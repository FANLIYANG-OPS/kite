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

const DEFAULT_NAME = 'minio'
const DEFAULT_NAMESPACE = 'middleware'
const DEFAULT_NODE_PORT = 30889
const NODE_PORT_MIN = 30000
const NODE_PORT_MAX = 32767

function generateMinioYamls(
  name: string,
  namespace: string,
  accessKey: string,
  secretKey: string,
  nodePort: number
): string[] {
  const accessKeyB64 = btoaUtf8(accessKey)
  const secretKeyB64 = btoaUtf8(secretKey)

  const clusterIPSvcYaml = `kind: Service
apiVersion: v1
metadata:
  name: ${name}
  namespace: ${namespace}
  labels:
    app.kubernetes.io/instance: ${name}
    app.kubernetes.io/managed-by: Helm
    app.kubernetes.io/type: external-service
spec:
  ports:
    - name: tcp-9000
      protocol: TCP
      port: 9000
      targetPort: 9000
  selector:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
  type: ClusterIP
  ipFamilyPolicy: SingleStack
`

  const nodePortSvcYaml = `---
kind: Service
apiVersion: v1
metadata:
  name: ${name}-nodeport
  namespace: ${namespace}
  labels:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
spec:
  ports:
    - name: tcp-9000
      protocol: TCP
      port: 9000
      targetPort: 9000
      nodePort: ${nodePort}
  selector:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
  type: NodePort
  ipFamilyPolicy: SingleStack
`

  const secretYaml = `---
kind: Secret
apiVersion: v1
metadata:
  name: ${name}
  namespace: ${namespace}
  labels:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
data:
  accesskey: ${accessKeyB64}
  secretkey: ${secretKeyB64}
`

  const statefulSetYaml = `---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: ${name}
  namespace: ${namespace}
  labels:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
spec:
  podManagementPolicy: Parallel
  replicas: 1
  revisionHistoryLimit: 10
  serviceName: ${name}
  selector:
    matchLabels:
      app.kubernetes.io/instance: ${namespace}
      app.kubernetes.io/name: ${name}
  template:
    metadata:
      labels:
        app.kubernetes.io/instance: ${namespace}
        app.kubernetes.io/name: ${name}
    spec:
      volumes:
        - name: minio-user
          secret:
            secretName: ${name}
            defaultMode: 420
        - name: minio-config-dir
          emptyDir: {}
      containers:
        - env:
            - name: MINIO_ACCESS_KEY
              valueFrom:
                secretKeyRef:
                  name: ${name}
                  key: accesskey
            - name: MINIO_SECRET_KEY
              valueFrom:
                secretKeyRef:
                  name: ${name}
                  key: secretkey
            - name: MINIO_BROWSER
              value: "on"
          name: minio
          image: middleware/minio:20190807
          imagePullPolicy: Always
          command:
            - /bin/sh
            - "-ce"
            - /usr/bin/docker-entrypoint.sh minio -C /root/.minio/ server /data
          livenessProbe:
            httpGet:
              path: /minio/health/live
              port: console
              scheme: HTTP
            initialDelaySeconds: 5
            timeoutSeconds: 1
            periodSeconds: 30
            successThreshold: 1
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /minio/health/ready
              port: console
              scheme: HTTP
            initialDelaySeconds: 5
            timeoutSeconds: 1
            periodSeconds: 15
            successThreshold: 1
            failureThreshold: 3
          ports:
            - name: console
              containerPort: 9000
              protocol: TCP
          resources:
            requests:
              cpu: 1000m
              memory: 4096Mi
          terminationMessagePath: /dev/termination-log
          terminationMessagePolicy: File
          volumeMounts:
            - name: export
              mountPath: /data
            - name: minio-config-dir
              mountPath: /root/.minio/
      dnsPolicy: ClusterFirst
      restartPolicy: Always
      schedulerName: default-scheduler
      securityContext: {}
      terminationGracePeriodSeconds: 30
  updateStrategy:
    rollingUpdate:
      partition: 0
    type: RollingUpdate
  volumeClaimTemplates:
    - apiVersion: v1
      kind: PersistentVolumeClaim
      metadata:
        name: export
      spec:
        accessModes:
          - ReadWriteOnce
        resources:
          requests:
            storage: 5Gi
        storageClassName: local
        volumeMode: Filesystem
`

  return [clusterIPSvcYaml, nodePortSvcYaml, secretYaml, statefulSetYaml]
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

function applyWithNamespace(namespace: string, yamls: string[]): string[] {
  const nsYaml = `apiVersion: v1
kind: Namespace
metadata:
  name: ${namespace}
`
  return [nsYaml, ...yamls]
}

interface MinioCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function MinioCreateDialog({
  open,
  onOpenChange,
  onSuccess,
}: MinioCreateDialogProps) {
  const { t } = useTranslation()
  const { data: namespaces } = useResources('namespaces')
  const [name, setName] = useState(DEFAULT_NAME)
  const [namespace, setNamespace] = useState(DEFAULT_NAMESPACE)
  const [accessKey, setAccessKey] = useState('openpitrixminioaccesskey')
  const [secretKey, setSecretKey] = useState('openpitrixminiosecretkey')
  const [nodePort, setNodePort] = useState(String(DEFAULT_NODE_PORT))
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
      toast.error(t('minio.nameInvalid', 'Name must be a valid Kubernetes resource name'))
      return
    }
    if (!namespace?.trim()) {
      toast.error(t('minio.namespaceRequired', 'Namespace is required'))
      return
    }
    if (!accessKey?.trim()) {
      toast.error(t('minio.accessKeyRequired', 'Access Key is required'))
      return
    }
    if (!secretKey?.trim()) {
      toast.error(t('minio.secretKeyRequired', 'Secret Key is required'))
      return
    }
    const portNum = parseInt(nodePort.trim(), 10)
    if (isNaN(portNum) || portNum < NODE_PORT_MIN || portNum > NODE_PORT_MAX) {
      toast.error(t('minio.portRangeError', 'Port must be between 30000-32767'))
      return
    }

    setIsLoading(true)
    try {
      const yamls = generateMinioYamls(
        instanceName,
        namespace.trim(),
        accessKey.trim(),
        secretKey.trim(),
        portNum
      )
      const withNs = applyWithNamespace(namespace.trim(), yamls)
      await applyMultiYaml(withNs)
      toast.success(t('minio.createSuccess', 'MinIO created successfully'))
      setName(DEFAULT_NAME)
      setNamespace(DEFAULT_NAMESPACE)
      setAccessKey('minioadmin')
      setSecretKey('minioadmin')
      setNodePort(String(DEFAULT_NODE_PORT))
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      console.error('Failed to create MinIO', err)
      toast.error(translateError(err, t))
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    setName(DEFAULT_NAME)
    setNamespace(DEFAULT_NAMESPACE)
    setAccessKey('minioadmin')
    setSecretKey('minioadmin')
    setNodePort(String(DEFAULT_NODE_PORT))
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('minio.createTitle', 'Create MinIO')}</DialogTitle>
          <DialogDescription>
            {t('minio.createDescription', 'Create a MinIO instance with Secret, Services and StatefulSet')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('minio.instanceName', 'Instance Name')}</Label>
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
            <Label htmlFor="accessKey">{t('minio.accessKey', 'Access Key')}</Label>
            <Input
              id="accessKey"
              value={accessKey}
              onChange={(e) => setAccessKey(e.target.value)}
              placeholder="minioadmin"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="secretKey">{t('minio.secretKey', 'Secret Key')}</Label>
            <Input
              id="secretKey"
              type="password"
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              placeholder="minioadmin"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="nodePort">{t('minio.nodePort', 'External Port')}</Label>
            <Input
              id="nodePort"
              type="number"
              min={NODE_PORT_MIN}
              max={NODE_PORT_MAX}
              value={nodePort}
              onChange={(e) => setNodePort(e.target.value)}
              placeholder={String(DEFAULT_NODE_PORT)}
            />
            <p className="text-xs text-muted-foreground">
              {t('minio.nodePortHint', 'NodePort range 30000-32767, default 30889')}
            </p>
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
