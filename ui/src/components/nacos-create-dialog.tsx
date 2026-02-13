import { useEffect, useState } from 'react'
import { IconLoader2 } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { applyResource, useResources } from '@/lib/api'
import { translateError } from '@/lib/utils'
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

const DEFAULT_NAME = 'nacos'
const DEFAULT_NAMESPACE = 'middleware'
const DEFAULT_NODE_PORT = 30884
const NODE_PORT_MIN = 30000
const NODE_PORT_MAX = 32767

function generateNacosYamls(
  name: string,
  namespace: string,
  nodePort: number
): string[] {
  const namespaceYaml = `apiVersion: v1
kind: Namespace
metadata:
  name: ${namespace}
`

  const headlessSvcYaml = `apiVersion: v1
kind: Service
metadata:
  name: ${name}-headless
  namespace: ${namespace}
  labels:
    app.kubernetes.io/component: nacos
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: v2.5.1
spec:
  clusterIP: None
  ports:
  - name: http
    port: 8848
    protocol: TCP
    targetPort: 8848
  - name: client-rpc
    port: 9848
    protocol: TCP
    targetPort: 9848
  - name: raft-rpc
    port: 9849
    protocol: TCP
    targetPort: 9849
  - name: old-raft-rpc
    port: 7848
    protocol: TCP
    targetPort: 7848
  selector:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: v2.5.1
  type: ClusterIP
`

  const statefulSetYaml = `apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: ${name}
  namespace: ${namespace}
  labels:
    app.kubernetes.io/component: nacos
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: v2.5.1
spec:
  podManagementPolicy: Parallel
  replicas: 1
  revisionHistoryLimit: 10
  selector:
    matchLabels:
      app.kubernetes.io/instance: ${namespace}
      app.kubernetes.io/name: ${name}
      app.kubernetes.io/version: v2.5.1
  serviceName: ${name}-headless
  template:
    metadata:
      labels:
        app.kubernetes.io/instance: ${namespace}
        app.kubernetes.io/name: ${name}
        app.kubernetes.io/version: v2.5.1
    spec:
      containers:
      - env:
        - name: NACOS_SERVER_PORT
          value: "8848"
        - name: NACOS_APPLICATION_PORT
          value: "8848"
        - name: PREFER_HOST_MODE
          value: hostname
        - name: MODE
          value: standalone
        - name: EMBEDDED_STORAGE
          value: embedded
        image: nacos/nacos-server:v2.5.1
        imagePullPolicy: Always
        livenessProbe:
          failureThreshold: 3
          httpGet:
            path: /nacos/v1/console/health/liveness
            port: 8848
            scheme: HTTP
          initialDelaySeconds: 10
          periodSeconds: 5
          successThreshold: 1
          timeoutSeconds: 10
        name: nacos
        ports:
        - containerPort: 8848
          name: http
          protocol: TCP
        - containerPort: 9848
          name: client-rpc
          protocol: TCP
        - containerPort: 9849
          name: raft-rpc
          protocol: TCP
        - containerPort: 7848
          name: old-raft-rpc
          protocol: TCP
        resources:
          requests:
            cpu: 500m
            memory: 2Gi
        startupProbe:
          failureThreshold: 3
          httpGet:
            path: /nacos/v1/console/health/readiness
            port: 8848
            scheme: HTTP
          initialDelaySeconds: 180
          periodSeconds: 5
          successThreshold: 1
          timeoutSeconds: 10
        terminationMessagePath: /dev/termination-log
        terminationMessagePolicy: File
        volumeMounts:
        - mountPath: /home/nacos/plugins/peer-finder
          name: data
          subPath: peer-finder
        - mountPath: /home/nacos/data
          name: data
          subPath: data
        - mountPath: /home/nacos/logs
          name: data
          subPath: logs
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
      name: data
    spec:
      accessModes:
      - ReadWriteOnce
      resources:
        requests:
          storage: 5Gi
      storageClassName: local
      volumeMode: Filesystem
`

  const clusterIPSvcYaml = `apiVersion: v1
kind: Service
metadata:
  name: ${name}
  namespace: ${namespace}
  labels:
    app.kubernetes.io/component: nacos
    app.kubernetes.io/version: v2.5.1
    app.kubernetes.io/instance: ${name}
    app.kubernetes.io/managed-by: Helm
    app.kubernetes.io/type: external-service
spec:
  ipFamilies:
  - IPv4
  ipFamilyPolicy: SingleStack
  ports:
  - name: http
    port: 8848
    protocol: TCP
    targetPort: 8848
  - name: client-rpc
    port: 9848
    protocol: TCP
    targetPort: 9848
  - name: raft-rpc
    port: 9849
    protocol: TCP
    targetPort: 9849
  - name: old-raft-rpc
    port: 7848
    protocol: TCP
    targetPort: 7848
  selector:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: v2.5.1
  sessionAffinity: None
  type: ClusterIP
`

  const nodePortSvcYaml = `apiVersion: v1
kind: Service
metadata:
  name: ${name}-nodeport
  namespace: ${namespace}
  labels:
    app.kubernetes.io/component: nacos
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: v2.5.1
spec:
  ipFamilies:
  - IPv4
  ipFamilyPolicy: SingleStack
  ports:
  - name: http
    port: 8848
    protocol: TCP
    nodePort: ${nodePort}
    targetPort: 8848
  selector:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: v2.5.1
  sessionAffinity: None
  type: NodePort
`

  return [
    namespaceYaml,
    headlessSvcYaml,
    statefulSetYaml,
    clusterIPSvcYaml,
    nodePortSvcYaml,
  ]
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

interface NacosCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function NacosCreateDialog({
  open,
  onOpenChange,
  onSuccess,
}: NacosCreateDialogProps) {
  const { t } = useTranslation()
  const { data: namespaces } = useResources('namespaces')
  const [name, setName] = useState(DEFAULT_NAME)
  const [namespace, setNamespace] = useState(DEFAULT_NAMESPACE)
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
      toast.error(t('nacos.nameInvalid', 'Name must be a valid Kubernetes resource name'))
      return
    }
    if (!namespace?.trim()) {
      toast.error(t('nacos.namespaceRequired', 'Namespace is required'))
      return
    }
    const portNum = parseInt(nodePort.trim(), 10)
    if (isNaN(portNum) || portNum < NODE_PORT_MIN || portNum > NODE_PORT_MAX) {
      toast.error(t('nacos.portRangeError', 'Port must be between 30000-32767'))
      return
    }

    setIsLoading(true)
    try {
      const yamls = generateNacosYamls(instanceName, namespace.trim(), portNum)
      await applyMultiYaml(yamls)
      toast.success(t('nacos.createSuccess', 'Nacos created successfully'))
      setName(DEFAULT_NAME)
      setNamespace(DEFAULT_NAMESPACE)
      setNodePort(String(DEFAULT_NODE_PORT))
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      console.error('Failed to create Nacos', err)
      toast.error(translateError(err, t))
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    setName(DEFAULT_NAME)
    setNamespace(DEFAULT_NAMESPACE)
    setNodePort(String(DEFAULT_NODE_PORT))
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('nacos.createTitle', 'Create Nacos')}</DialogTitle>
          <DialogDescription>
            {t('nacos.createDescription', 'Create a Nacos instance with Services and StatefulSet')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('nacos.instanceName', 'Instance Name')}</Label>
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
            <Label htmlFor="nodePort">{t('nacos.nodePort', '对外服务端口')}</Label>
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
              {t('nacos.nodePortHint', 'NodePort 范围 30000-32767，默认 30884')}
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
