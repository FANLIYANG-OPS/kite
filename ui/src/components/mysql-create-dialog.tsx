import { useEffect, useState } from 'react'
import { IconLoader2 } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { applyResource, useResources } from '@/lib/api'
import { btoaUtf8, translateError } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { NamespaceSelector } from './selector/namespace-selector'

const DEFAULT_NAME = 'mysql'
const DEFAULT_NAMESPACE = 'middleware'
const DEFAULT_NODE_PORT = 30888
const DEFAULT_USERNAME = 'root'
const DEFAULT_PASSWORD = 'sb2Rq3B.9Yu9-7G'

function generateMysqlYamls(
  name: string,
  namespace: string,
  nodePort: number | null,
  username: string,
  password: string
): string[] {
  const namespaceYaml = `apiVersion: v1
kind: Namespace
metadata:
  name: ${namespace}
`

  const secretYaml = `apiVersion: v1
kind: Secret
metadata:
  name: ${name}
  namespace: ${namespace}
  labels:
    app.kubernetes.io/name: mysql
    app.kubernetes.io/instance: ${name}
    app.kubernetes.io/version: "8.0.38"
type: kubernetes.io/basic-auth
data:
  username: ${btoaUtf8(username)}
  password: ${btoaUtf8(password)}
`

  const clusterIPSvcYaml = `apiVersion: v1
kind: Service
metadata:
  name: ${name}
  namespace: ${namespace}
  labels:
    app.kubernetes.io/name: mysql
    app.kubernetes.io/instance: ${name}
    app.kubernetes.io/version: "8.0.38"
spec:
  type: ClusterIP
  ports:
  - name: tcp-3306
    port: 3306
    protocol: TCP
    targetPort: 3306
  selector:
    app.kubernetes.io/instance: ${name}
    app.kubernetes.io/name: mysql
    app.kubernetes.io/version: "8.0.38"
`

  const yamls = [namespaceYaml, secretYaml, clusterIPSvcYaml]

  if (nodePort != null) {
    yamls.push(`apiVersion: v1
kind: Service
metadata:
  name: ${name}-nodeport
  namespace: ${namespace}
  labels:
    app.kubernetes.io/name: mysql
    app.kubernetes.io/instance: ${name}
    app.kubernetes.io/version: "8.0.38"
spec:
  type: NodePort
  externalTrafficPolicy: Cluster
  ports:
  - name: tcp-3306
    nodePort: ${nodePort}
    port: 3306
    protocol: TCP
    targetPort: 3306
  selector:
    app.kubernetes.io/instance: ${name}
    app.kubernetes.io/name: mysql
    app.kubernetes.io/version: "8.0.38"
`)
  }

  const statefulSetYaml = `apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: ${name}
  namespace: ${namespace}
  labels:
    app.kubernetes.io/name: mysql
    app.kubernetes.io/instance: ${name}
    app.kubernetes.io/version: "8.0.38"
spec:
  serviceName: ${name}
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/instance: ${name}
      app.kubernetes.io/name: mysql
      app.kubernetes.io/version: "8.0.38"
  template:
    metadata:
      labels:
        app.kubernetes.io/instance: ${name}
        app.kubernetes.io/name: mysql
        app.kubernetes.io/version: "8.0.38"
    spec:
      containers:
      - name: mysql
        image: bitnami/mysql:8.0.38
        imagePullPolicy: Always
        env:
        - name: MYSQL_ROOT_PASSWORD
          valueFrom:
            secretKeyRef:
              key: password
              name: ${name}
        - name: MYSQL_AUTHENTICATION_PLUGIN
          value: mysql_native_password
        - name: MYSQL_EXTRA_FLAGS
          value: --lower_case_table_names=1 --innodb_strict_mode=0 --max-connections=1000
        - name: MYSQL_SQL_MODE
          value: STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION
        ports:
        - containerPort: 3306
          name: tcp-0
          protocol: TCP
        readinessProbe:
          tcpSocket:
            port: 3306
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 1
        startupProbe:
          tcpSocket:
            port: 3306
          initialDelaySeconds: 15
          periodSeconds: 10
          timeoutSeconds: 1
        resources:
          requests:
            cpu: "1"
            memory: 1Gi
          limits:
            cpu: "4"
            memory: 4Gi
        volumeMounts:
        - name: mysql-data
          mountPath: /bitnami/mysql/data
  volumeClaimTemplates:
  - metadata:
      name: mysql-data
      labels:
        app.kubernetes.io/instance: ${name}
        app.kubernetes.io/name: mysql
        app.kubernetes.io/version: "8.0.38"
    spec:
      accessModes:
      - ReadWriteOnce
      resources:
        requests:
          storage: 8Gi
`

  yamls.push(statefulSetYaml)
  return yamls
}

async function applyYamlIgnoreAlreadyExists(yaml: string): Promise<void> {
  try {
    await applyResource(yaml.trim())
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes('AlreadyExists') && !msg.includes('already exists')) {
      throw err
    }
  }
}

async function applyMultiYaml(yamls: string[]): Promise<void> {
  for (let i = 0; i < yamls.length; i++) {
    const yaml = yamls[i].trim()
    if (i === 0 && yaml.includes('kind: Namespace')) {
      await applyYamlIgnoreAlreadyExists(yaml)
    } else {
      await applyResource(yaml)
    }
  }
}

interface MysqlCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function MysqlCreateDialog({
  open,
  onOpenChange,
  onSuccess,
}: MysqlCreateDialogProps) {
  const { t } = useTranslation()
  const { data: namespaces } = useResources('namespaces')
  const [name, setName] = useState(DEFAULT_NAME)
  const [namespace, setNamespace] = useState(DEFAULT_NAMESPACE)
  const [nodePort, setNodePort] = useState(DEFAULT_NODE_PORT.toString())
  const [username, setUsername] = useState(DEFAULT_USERNAME)
  const [password, setPassword] = useState(DEFAULT_PASSWORD)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (open && namespaces?.length) {
      const nsNames = namespaces.map((n) => n.metadata?.name).filter(Boolean)
      const hasDefault = nsNames.includes(DEFAULT_NAMESPACE)
      if (!hasDefault && nsNames[0]) {
        setNamespace(nsNames[0])
      }
    }
  }, [open, namespaces])

  const handleCreate = async () => {
    const instanceName = name.trim() || DEFAULT_NAME
    if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(instanceName)) {
      toast.error(t('mysql.nameInvalid', 'Name must be a valid Kubernetes resource name'))
      return
    }
    let port: number | null = null
    if (nodePort.trim()) {
      const parsed = parseInt(nodePort, 10)
      if (isNaN(parsed) || parsed < 30000 || parsed > 32767) {
        toast.error(t('mysql.portRangeError', 'NodePort must be between 30000-32767'))
        return
      }
      port = parsed
    }
    if (!namespace?.trim()) {
      toast.error(t('mysql.namespaceRequired', 'Namespace is required'))
      return
    }
    if (!username.trim()) {
      toast.error(t('mysql.usernameRequired', 'Username is required'))
      return
    }
    if (!password.trim()) {
      toast.error(t('mysql.passwordRequired', 'Password is required'))
      return
    }

    setIsLoading(true)
    try {
      const yamls = generateMysqlYamls(
        instanceName,
        namespace.trim(),
        port ?? null,
        username.trim(),
        password
      )
      await applyMultiYaml(yamls)
      toast.success(t('mysql.createSuccess', 'MySQL created successfully'))
      setName(DEFAULT_NAME)
      setNamespace(DEFAULT_NAMESPACE)
      setNodePort(DEFAULT_NODE_PORT.toString())
      setUsername(DEFAULT_USERNAME)
      setPassword(DEFAULT_PASSWORD)
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      console.error('Failed to create MySQL', err)
      toast.error(translateError(err, t))
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    setName(DEFAULT_NAME)
    setNamespace(DEFAULT_NAMESPACE)
    setNodePort('')
    setUsername(DEFAULT_USERNAME)
    setPassword(DEFAULT_PASSWORD)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('mysql.createTitle', 'Create MySQL')}</DialogTitle>
          <DialogDescription>
            {t('mysql.createDescription', 'Create a MySQL instance with Secret, Services and StatefulSet')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('mysql.instanceName', 'Instance Name')}</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={DEFAULT_NAME}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="namespace">{t('common.namespace')}</Label>
            <div className="w-full max-w-xs">
              <NamespaceSelector
                selectedNamespace={namespace}
                handleNamespaceChange={setNamespace}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nodePort">{t('mysql.nodePort', 'NodePort')}</Label>
            <Input
              id="nodePort"
              type="number"
              min={30000}
              max={32767}
              value={nodePort}
              onChange={(e) => setNodePort(e.target.value)}
              placeholder={t('mysql.nodePortOptional', '留空则不创建对外服务')}
            />
            <p className="text-xs text-muted-foreground">
              {t('mysql.nodePortHint', 'Optional. External access port (30000-32767). Leave empty to skip NodePort service.')}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="username">{t('mysql.username', 'Username')}</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={DEFAULT_USERNAME}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{t('mysql.password', 'Password')}</Label>
            <Input
              id="password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="********"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isLoading}
          >
            {t('common.cancel')}
          </Button>
          <Button onClick={handleCreate} disabled={isLoading}>
            {isLoading ? (
              <>
                <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('common.creating')}
              </>
            ) : (
              t('common.create')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
