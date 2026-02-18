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

const DEFAULT_NAME = 'doris'
const DEFAULT_NAMESPACE = 'middleware'
const DEFAULT_NODE_PORT = 30883
const NODE_PORT_MIN = 30000
const NODE_PORT_MAX = 32767
const DORIS_VERSION = '2.0.15'

const FE_CONF = `        CUR_DATE=\`date +%Y%m%d-%H%M%S\`
        LOG_DIR = \${DORIS_HOME}/log
        JAVA_OPTS="-Dfile.encoding=UTF-8 -Djavax.security.auth.useSubjectCredsOnly=false -Xss4m -Xmx8192m -XX:+UnlockExperimentalVMOptions -XX:+UseG1GC -XX:MaxGCPauseMillis=200 -XX:+PrintGCDateStamps -XX:+PrintGCDetails -XX:+PrintClassHistogramAfterFullGC -Xloggc:$LOG_DIR/log/fe.gc.log.$CUR_DATE -XX:+UseGCLogFileRotation -XX:NumberOfGCLogFiles=10 -XX:GCLogFileSize=50M -Dlog4j2.formatMsgNoLookups=true"
        JAVA_OPTS_FOR_JDK_17="-Dfile.encoding=UTF-8 -Djavax.security.auth.useSubjectCredsOnly=false -Xmx8192m -Xms8192m -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=$LOG_DIR -Xlog:gc*,classhisto*=trace:$LOG_DIR/fe.gc.log.$CUR_DATE:time,uptime:filecount=10,filesize=50M --add-opens=java.base/java.nio=ALL-UNNAMED --add-opens java.base/jdk.internal.ref=ALL-UNNAMED --add-opens java.base/sun.nio.ch=ALL-UNNAMED"
        http_port = 8030
        rpc_port = 9020
        query_port = 9030
        edit_log_port = 9010
        arrow_flight_sql_port = -1
        syg_level = INFO
        syg_mode = ASYNC
        enable_fqdn_mode = true`

const BE_CONF = `        CUR_DATE=\`date +%Y%m%d-%H%M%S\`
        LOG_DIR="\${DORIS_HOME}/log/"
        JAVA_OPTS="-Dfile.encoding=UTF-8 -Xmx2048m -DlogPath=$LOG_DIR/jni.log -Xloggc:$LOG_DIR/be.gc.log.$CUR_DATE -XX:+UseGCLogFileRotation -XX:NumberOfGCLogFiles=10 -XX:GCLogFileSize=50M -Djavax.security.auth.useSubjectCredsOnly=false -Dsun.security.krb5.debug=true -Dsun.java.command=DorisBE -XX:-CriticalJNINatives"
        JAVA_OPTS_FOR_JDK_17="-Dfile.encoding=UTF-8 -Djol.skipHotspotSAAttach=true -Xmx2048m -DlogPath=$LOG_DIR/jni.log -Xlog:gc*:$LOG_DIR/be.gc.log.$CUR_DATE:time,uptime:filecount=10,filesize=50M -Djavax.security.auth.useSubjectCredsOnly=false -Dsun.security.krb5.debug=true -Dsun.java.command=DorisBE -XX:-CriticalJNINatives -XX:+IgnoreUnrecognizedVMOptions --add-opens=java.base/java.lang=ALL-UNNAMED --add-opens=java.base/java.lang.invoke=ALL-UNNAMED --add-opens=java.base/java.lang.reflect=ALL-UNNAMED --add-opens=java.base/java.io=ALL-UNNAMED --add-opens=java.base/java.net=ALL-UNNAMED --add-opens=java.base/java.nio=ALL-UNNAMED --add-opens=java.base/java.util=ALL-UNNAMED --add-opens=java.base/java.util.concurrent=ALL-UNNAMED --add-opens=java.base/java.util.concurrent.atomic=ALL-UNNAMED --add-opens=java.base/sun.nio.ch=ALL-UNNAMED --add-opens=java.base/sun.nio.cs=ALL-UNNAMED --add-opens=java.base/sun.security.action=ALL-UNNAMED --add-opens=java.base/sun.util.calendar=ALL-UNNAMED --add-opens=java.security.jgss/sun.security.krb5=ALL-UNNAMED --add-opens=java.management/sun.management=ALL-UNNAMED -Darrow.enable_null_check_for_get=false"
        JEMALLOC_CONF="percpu_arena:percpu,background_thread:true,metadata_thp:auto,muzzy_decay_ms:5000,dirty_decay_ms:5000,oversize_threshold:0,prof:true,prof_active:false,lg_prof_interval:-1"
        JEMALLOC_PROF_PRFIX="jemalloc_heap_profile_"
        be_port = 9060
        webserver_port = 8040
        heartbeat_service_port = 9050
        brpc_port = 8060
        arrow_flight_sql_port = -1
        enable_https = false
        ssl_certificate_path = "$DORIS_HOME/conf/cert.pem"
        ssl_private_key_path = "$DORIS_HOME/conf/key.pem"
        sys_log_level = INFO
        aws_log_level=0
        AWS_EC2_METADATA_DISABLED=true`

function generateDorisYamls(
  name: string,
  namespace: string,
  nodePort: number
): string[] {
  const dorisClusterYaml = `apiVersion: doris.selectdb.com/v1
kind: DorisCluster
metadata:
  name: ${name}
  namespace: ${namespace}
  labels:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: ${DORIS_VERSION}
spec:
  adminUser:
    name: root
    password: $vtjw4p#dwCdD
  beSpec:
    startTimeout: 3600
    liveTimeout: 60
    configMapInfo:
      configMapName: ${name}
      resolveKey: be.conf
    image: apache/doris:be-4.0.3
    limits:
      cpu: "4"
      memory: 8Gi
    persistentVolumes:
    - mountPath: /opt/apache-doris/be/log
      name: belog
      persistentVolumeClaimSpec:
        accessModes:
        - ReadWriteOnce
        resources:
          requests:
            storage: 10Gi
        storageClassName: local
    - mountPath: /opt/apache-doris/be/storage
      name: be-storage
      persistentVolumeClaimSpec:
        accessModes:
        - ReadWriteOnce
        resources:
          requests:
            storage: 200Gi
        storageClassName: local
    replicas: 3
    requests:
      cpu: "4"
      memory: 8Gi
    service:
      type: ClusterIP
  enableRestartWhenConfigChange: true
  feSpec:
    startTimeout: 3600
    liveTimeout: 60
    configMapInfo:
      configMapName: ${name}
      resolveKey: fe.conf
    image: apache/doris:fe-4.0.3
    limits:
      cpu: "4"
      memory: 8Gi
    persistentVolumes:
    - mountPath: /opt/apache-doris/fe/doris-meta
      name: meta
      persistentVolumeClaimSpec:
        accessModes:
        - ReadWriteOnce
        resources:
          requests:
            storage: 100Gi
        storageClassName: local
    - mountPath: /opt/apache-doris/fe/log
      name: log
      persistentVolumeClaimSpec:
        accessModes:
        - ReadWriteOnce
        resources:
          requests:
            storage: 10Gi
        storageClassName: local
    replicas: 3
    requests:
      cpu: "4"
      memory: 8Gi
    service:
      type: ClusterIP
`

  const configMapYaml = `---
apiVersion: v1
data:
  fe.conf: |2-

${FE_CONF}

  be.conf: |2-

${BE_CONF}

kind: ConfigMap
metadata:
  name: ${name}
  namespace: ${namespace}
  labels:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: ${DORIS_VERSION}
`

  const nodePortServiceYaml = `---
apiVersion: v1
kind: Service
metadata:
  name: ${name}-nodeport-service
  namespace: ${namespace}
  labels:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: ${DORIS_VERSION}
spec:
  ipFamilies:
  - IPv4
  ipFamilyPolicy: SingleStack
  ports:
  - name: query-port
    nodePort: ${nodePort}
    port: 9030
    protocol: TCP
    targetPort: 9030
  selector:
    app.doris.ownerreference/name: ${name}-fe
    app.kubernetes.io/component: fe
  sessionAffinity: ClientIP
  sessionAffinityConfig:
    clientIP:
      timeoutSeconds: 10800
  type: NodePort
`

  return [configMapYaml, dorisClusterYaml, nodePortServiceYaml]
}

async function applyMultiYaml(yamls: string[]): Promise<void> {
  for (let i = 0; i < yamls.length; i++) {
    const yaml = yamls[i].trim()
    if (i === 0 && yaml.includes('kind: Namespace')) {
      try {
        await applyResource(yaml)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (!msg.includes('AlreadyExists') && !msg.includes('already exists')) {
          throw err
        }
      }
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

interface DorisCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function DorisCreateDialog({
  open,
  onOpenChange,
  onSuccess,
}: DorisCreateDialogProps) {
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
      toast.error(t('doris.nameInvalid', 'Name must be a valid Kubernetes resource name'))
      return
    }
    if (!namespace?.trim()) {
      toast.error(t('doris.namespaceRequired', 'Namespace is required'))
      return
    }
    const portNum = parseInt(nodePort.trim(), 10)
    if (isNaN(portNum) || portNum < NODE_PORT_MIN || portNum > NODE_PORT_MAX) {
      toast.error(t('doris.portRangeError', 'Port must be between 30000-32767'))
      return
    }

    setIsLoading(true)
    try {
      const yamls = generateDorisYamls(instanceName, namespace.trim(), portNum)
      const withNs = applyWithNamespace(namespace.trim(), yamls)
      await applyMultiYaml(withNs)
      toast.success(t('doris.createSuccess', 'Doris created successfully'))
      setName(DEFAULT_NAME)
      setNamespace(DEFAULT_NAMESPACE)
      setNodePort(String(DEFAULT_NODE_PORT))
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      console.error('Failed to create Doris', err)
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
          <DialogTitle>{t('doris.createTitle', 'Create Doris')}</DialogTitle>
          <DialogDescription>
            {t('doris.createDescription', 'Create a Doris cluster with DorisCluster CR, ConfigMap and NodePort Service')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('doris.instanceName', 'Instance Name')}</Label>
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
            <Label htmlFor="nodePort">{t('doris.nodePort', 'External Port')}</Label>
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
              {t('doris.nodePortHint', 'NodePort range 30000-32767, default 30883')}
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
