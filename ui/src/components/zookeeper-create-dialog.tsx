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

const DEFAULT_NAME = 'zookeeper'
const DEFAULT_NAMESPACE = 'middleware'

function generateZookeeperYamls(name: string, namespace: string): string[] {
  const zooServers = [
    `${name}-0.${name}-headless.${namespace}.svc.cluster.local:2888:3888::1`,
    `${name}-1.${name}-headless.${namespace}.svc.cluster.local:2888:3888::2`,
    `${name}-2.${name}-headless.${namespace}.svc.cluster.local:2888:3888::3`,
  ].join(' ')

  const namespaceYaml = `apiVersion: v1
kind: Namespace
metadata:
  name: ${namespace}
`

  const configMapYaml = `apiVersion: v1
data:
  init-certs.sh: '#!/bin/bash'
  setup.sh: |-
    #!/bin/bash

    # Execute entrypoint as usual after obtaining ZOO_SERVER_ID
    # check ZOO_SERVER_ID in persistent volume via myid
    # if not present, set based on POD hostname
    if [[ -f "/bitnami/zookeeper/data/myid" ]]; then
        export ZOO_SERVER_ID="$(cat /bitnami/zookeeper/data/myid)"
    else
        HOSTNAME="$(hostname -s)"
        if [[ $HOSTNAME =~ (.*)-([0-9]+)$ ]]; then
            ORD=\${BASH_REMATCH[2]}
            export ZOO_SERVER_ID="$((ORD + 1 ))"
        else
            echo "Failed to get index from hostname $HOSTNAME"
            exit 1
        fi
    fi
    exec /entrypoint.sh /run.sh
kind: ConfigMap
metadata:
  name: ${name}-scripts
  namespace: ${namespace}
  labels:
    app.kubernetes.io/component: zookeeper
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: 3.9.3
`

  const headlessSvcYaml = `apiVersion: v1
kind: Service
metadata:
  name: ${name}-headless
  namespace: ${namespace}
  labels:
    app.kubernetes.io/component: zookeeper
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: 3.9.3
spec:
  clusterIP: None
  clusterIPs:
  - None
  internalTrafficPolicy: Cluster
  ipFamilies:
  - IPv4
  ipFamilyPolicy: SingleStack
  ports:
  - name: tcp-client
    port: 2181
    protocol: TCP
    targetPort: client
  - name: tcp-follower
    port: 2888
    protocol: TCP
    targetPort: follower
  - name: tcp-election
    port: 3888
    protocol: TCP
    targetPort: election
  publishNotReadyAddresses: true
  selector:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: 3.9.3
  sessionAffinity: None
  type: ClusterIP
`

  const clusterIPSvcYaml = `apiVersion: v1
kind: Service
metadata:
  name: ${name}
  namespace: ${namespace}
  labels:
    app.kubernetes.io/component: zookeeper
    app.kubernetes.io/version: 3.9.3
    app.kubernetes.io/instance: ${name}
    app.kubernetes.io/managed-by: Helm
    app.kubernetes.io/type: external-service
spec:
  ipFamilies:
  - IPv4
  ipFamilyPolicy: SingleStack
  ports:
  - name: tcp-client
    port: 2181
    protocol: TCP
    targetPort: client
  - name: tcp-follower
    port: 2888
    protocol: TCP
    targetPort: follower
  - name: tcp-election
    port: 3888
    protocol: TCP
    targetPort: election
  selector:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: 3.9.3
  sessionAffinity: None
  type: ClusterIP
`

  const statefulSetYaml = `apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: ${name}
  namespace: ${namespace}
  labels:
    app.kubernetes.io/component: zookeeper
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: 3.9.3
spec:
  podManagementPolicy: Parallel
  replicas: 3
  revisionHistoryLimit: 10
  selector:
    matchLabels:
      app.kubernetes.io/instance: ${namespace}
      app.kubernetes.io/name: ${name}
      app.kubernetes.io/version: 3.9.3
  serviceName: ${name}-headless
  template:
    metadata:
      creationTimestamp: null
      labels:
        app.kubernetes.io/instance: ${namespace}
        app.kubernetes.io/name: ${name}
        app.kubernetes.io/version: 3.9.3
    spec:
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - podAffinityTerm:
              labelSelector:
                matchLabels:
                  app.kubernetes.io/instance: ${namespace}
                  app.kubernetes.io/name: ${name}
                  app.kubernetes.io/version: 3.9.3
              topologyKey: kubernetes.io/hostname
            weight: 1
      automountServiceAccountToken: false
      containers:
      - command:
        - /scripts/setup.sh
        env:
        - name: BITNAMI_DEBUG
          value: "false"
        - name: ZOO_DATA_LOG_DIR
        - name: ZOO_PORT_NUMBER
          value: "2181"
        - name: ZOO_TICK_TIME
          value: "2000"
        - name: ZOO_INIT_LIMIT
          value: "10"
        - name: ZOO_SYNC_LIMIT
          value: "5"
        - name: ZOO_PRE_ALLOC_SIZE
          value: "65536"
        - name: ZOO_SNAPCOUNT
          value: "100000"
        - name: ZOO_MAX_CLIENT_CNXNS
          value: "60"
        - name: ZOO_4LW_COMMANDS_WHITELIST
          value: srvr, mntr, ruok
        - name: ZOO_LISTEN_ALLIPS_ENABLED
          value: "no"
        - name: ZOO_AUTOPURGE_INTERVAL
          value: "1"
        - name: ZOO_AUTOPURGE_RETAIN_COUNT
          value: "10"
        - name: ZOO_MAX_SESSION_TIMEOUT
          value: "40000"
        - name: ZOO_SERVERS
          value: ${zooServers}
        - name: ZOO_ENABLE_AUTH
          value: "no"
        - name: ZOO_ENABLE_QUORUM_AUTH
          value: "no"
        - name: ZOO_HEAP_SIZE
          value: "1024"
        - name: ZOO_LOG_LEVEL
          value: ERROR
        - name: ALLOW_ANONYMOUS_LOGIN
          value: "yes"
        - name: POD_NAME
          valueFrom:
            fieldRef:
              apiVersion: v1
              fieldPath: metadata.name
        - name: ZOO_ADMIN_SERVER_PORT_NUMBER
          value: "8080"
        image: bitnami/zookeeper:3.9.3-debian-12-r8
        imagePullPolicy: Always
        livenessProbe:
          exec:
            command:
            - /bin/bash
            - -ec
            - ZOO_HC_TIMEOUT=3 /opt/bitnami/scripts/zookeeper/healthcheck.sh
          failureThreshold: 6
          initialDelaySeconds: 30
          periodSeconds: 10
          successThreshold: 1
          timeoutSeconds: 5
        name: zookeeper
        ports:
        - containerPort: 2181
          name: client
          protocol: TCP
        - containerPort: 2888
          name: follower
          protocol: TCP
        - containerPort: 3888
          name: election
          protocol: TCP
        - containerPort: 8080
          name: http-admin
          protocol: TCP
        readinessProbe:
          exec:
            command:
            - /bin/bash
            - -ec
            - ZOO_HC_TIMEOUT=2 /opt/bitnami/scripts/zookeeper/healthcheck.sh
          failureThreshold: 6
          initialDelaySeconds: 5
          periodSeconds: 10
          successThreshold: 1
          timeoutSeconds: 5
        resources:
          limits:
            cpu: 500m
            memory: 1Gi
          requests:
            cpu: 500m
            memory: 1Gi
        securityContext:
          allowPrivilegeEscalation: false
          capabilities:
            drop:
            - ALL
          privileged: false
          readOnlyRootFilesystem: true
          runAsGroup: 1001
          runAsNonRoot: true
          runAsUser: 1001
          seLinuxOptions: {}
          seccompProfile:
            type: RuntimeDefault
        terminationMessagePath: /dev/termination-log
        terminationMessagePolicy: File
        volumeMounts:
        - mountPath: /tmp
          name: empty-dir
          subPath: tmp-dir
        - mountPath: /opt/bitnami/zookeeper/conf
          name: empty-dir
          subPath: app-conf-dir
        - mountPath: /opt/bitnami/zookeeper/logs
          name: empty-dir
          subPath: app-logs-dir
        - mountPath: /scripts/setup.sh
          name: scripts
          subPath: setup.sh
        - mountPath: /bitnami/zookeeper
          name: data
      dnsPolicy: ClusterFirst
      enableServiceLinks: true
      restartPolicy: Always
      schedulerName: default-scheduler
      securityContext:
        fsGroup: 1001
        fsGroupChangePolicy: Always
      terminationGracePeriodSeconds: 30
      volumes:
      - emptyDir: {}
        name: empty-dir
      - configMap:
          defaultMode: 493
          name: ${name}-scripts
        name: scripts
  updateStrategy:
    rollingUpdate:
      partition: 0
    type: RollingUpdate
  volumeClaimTemplates:
  - apiVersion: v1
    kind: PersistentVolumeClaim
    metadata:
      creationTimestamp: null
      name: data
    spec:
      accessModes:
      - ReadWriteOnce
      resources:
        requests:
          storage: 8Gi
      storageClassName: local
      volumeMode: Filesystem
    status:
      phase: Pending
`

  return [
    namespaceYaml,
    configMapYaml,
    headlessSvcYaml,
    clusterIPSvcYaml,
    statefulSetYaml,
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

interface ZookeeperCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function ZookeeperCreateDialog({
  open,
  onOpenChange,
  onSuccess,
}: ZookeeperCreateDialogProps) {
  const { t } = useTranslation()
  const { data: namespaces } = useResources('namespaces')
  const [name, setName] = useState(DEFAULT_NAME)
  const [namespace, setNamespace] = useState(DEFAULT_NAMESPACE)
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
      toast.error(t('zookeeper.nameInvalid', 'Name must be a valid Kubernetes resource name'))
      return
    }
    if (!namespace?.trim()) {
      toast.error(t('zookeeper.namespaceRequired', 'Namespace is required'))
      return
    }

    setIsLoading(true)
    try {
      const yamls = generateZookeeperYamls(instanceName, namespace.trim())
      await applyMultiYaml(yamls)
      toast.success(t('zookeeper.createSuccess', 'Zookeeper created successfully'))
      setName(DEFAULT_NAME)
      setNamespace(DEFAULT_NAMESPACE)
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      console.error('Failed to create Zookeeper', err)
      toast.error(translateError(err, t))
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    setName(DEFAULT_NAME)
    setNamespace(DEFAULT_NAMESPACE)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('zookeeper.createTitle', 'Create Zookeeper')}</DialogTitle>
          <DialogDescription>
            {t('zookeeper.createDescription', 'Create a Zookeeper cluster with ConfigMap, Services and StatefulSet')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('zookeeper.instanceName', 'Instance Name')}</Label>
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
