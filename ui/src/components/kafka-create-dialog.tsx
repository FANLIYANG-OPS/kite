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

const DEFAULT_NAME = 'kafka'
const DEFAULT_NAMESPACE = 'middleware'
const KAFKA_VERSION = '3.6.0'
const KAFKA_IMAGE = 'bitnami/kafka:3.6.0'
const KRAFT_CLUSTER_ID = 'irGXOzLHQmTLiWKCBcHhoI'

const KAFKA_INIT_SCRIPT = `#!/bin/bash

    set -o errexit
    set -o nounset
    set -o pipefail

    error(){
      local message="\${1:?missing message}"
      echo "ERROR: \${message}"
      exit 1
    }

    retry_while() {
        local -r cmd="\${1:?cmd is missing}"
        local -r retries="\${2:-12}"
        local -r sleep_time="\${3:-5}"
        local return_value=1

        read -r -a command <<< "$cmd"
        for ((i = 1 ; i <= retries ; i+=1 )); do
            "\${command[@]}" && return_value=0 && break
            sleep "$sleep_time"
        done
        return $return_value
    }

    replace_in_file() {
        local filename="\${1:?filename is required}"
        local match_regex="\${2:?match regex is required}"
        local substitute_regex="\${3:?substitute regex is required}"
        local posix_regex=\${4:-true}

        local result

        local -r del=$'\\001'
        if [[ $posix_regex = true ]]; then
            result="$(sed -E "s\${del}\${match_regex}\${del}\${substitute_regex}\${del}g" "$filename")"
        else
            result="$(sed "s\${del}\${match_regex}\${del}\${substitute_regex}\${del}g" "$filename")"
        fi
        echo "$result" > "$filename"
    }

    kafka_conf_set() {
        local file="\${1:?missing file}"
        local key="\${2:?missing key}"
        local value="\${3:?missing value}"

        if grep -q "^[#\\\\s]*$key\\s*=.*" "$file"; then
            replace_in_file "$file" "^[#\\\\s]*\${key}\\s*=.*" "\${key}=\${value}" false
        else
            printf '\\n%s=%s' "$key" "$value" >>"$file"
        fi
    }

    replace_placeholder() {
      local placeholder="\${1:?missing placeholder value}"
      local password="\${2:?missing password value}"
      sed -i "s/$placeholder/$password/g" "$KAFKA_CONFIG_FILE"
    }

    append_file_to_kafka_conf() {
        local file="\${1:?missing source file}"
        local conf="\${2:?missing kafka conf file}"

        cat "$1" >> "$2"
    }

    configure_external_access() {
      if [[ -f "/shared/external-host.txt" ]]; then
        host=$(cat "/shared/external-host.txt")
      elif [[ -n "\${EXTERNAL_ACCESS_HOST:-}" ]]; then
        host="$EXTERNAL_ACCESS_HOST"
      elif [[ -n "\${EXTERNAL_ACCESS_HOSTS_LIST:-}" ]]; then
        read -r -a hosts <<<"$(tr ',' ' ' <<<"\${EXTERNAL_ACCESS_HOSTS_LIST}")"
        host="\${hosts[$POD_ID]}"
      elif [[ "$EXTERNAL_ACCESS_HOST_USE_PUBLIC_IP" =~ ^(yes|true)$ ]]; then
        host=$(curl -s https://ipinfo.io/ip)
      else
        error "External access hostname not provided"
      fi

      if [[ -f "/shared/external-port.txt" ]]; then
        port=$(cat "/shared/external-port.txt")
      elif [[ -n "\${EXTERNAL_ACCESS_PORT:-}" ]]; then
        if [[ "\${EXTERNAL_ACCESS_PORT_AUTOINCREMENT:-}" =~ ^(yes|true)$ ]]; then
          port="$((EXTERNAL_ACCESS_PORT + POD_ID))"
        else
          port="$EXTERNAL_ACCESS_PORT"
        fi
      elif [[ -n "\${EXTERNAL_ACCESS_PORTS_LIST:-}" ]]; then
        read -r -a ports <<<"$(tr ',' ' ' <<<"\${EXTERNAL_ACCESS_PORTS_LIST}")"
        port="\${ports[$POD_ID]}"
      else
        error "External access port not provided"
      fi
      sed -i -E "s|^(advertised\\.listeners=\\S+)$|\\1,EXTERNAL://\${host}:\${port}|" "$KAFKA_CONFIG_FILE"
    }

    export KAFKA_CONFIG_FILE=/config/server.properties
    cp /configmaps/server.properties $KAFKA_CONFIG_FILE

    POD_ID=$(echo "$MY_POD_NAME" | rev | cut -d'-' -f 1 | rev)
    POD_ROLE=$(echo "$MY_POD_NAME" | rev | cut -d'-' -f 2 | rev)

    if [[ -f "/bitnami/kafka/data/meta.properties" ]]; then
        if grep -q "broker.id" /bitnami/kafka/data/meta.properties; then
          ID="$(grep "broker.id" /bitnami/kafka/data/meta.properties | awk -F '=' '{print $2}')"
          kafka_conf_set "$KAFKA_CONFIG_FILE" "node.id" "$ID"
        else
          ID="$(grep "node.id" /bitnami/kafka/data/meta.properties | awk -F '=' '{print $2}')"
          kafka_conf_set "$KAFKA_CONFIG_FILE" "node.id" "$ID"
        fi
    else
        ID=$((POD_ID + KAFKA_MIN_ID))
        kafka_conf_set "$KAFKA_CONFIG_FILE" "node.id" "$ID"
    fi
    replace_placeholder "advertised-address-placeholder" "\${MY_POD_NAME}.{{ .Release.Name }}-headless.{{ .Release.Namespace }}.svc.cluster.local"
    if [[ "\${EXTERNAL_ACCESS_ENABLED:-false}" =~ ^(yes|true)$ ]]; then
      configure_external_access
    fi
    if [ -f /secret-config/server-secret.properties ]; then
      append_file_to_kafka_conf /secret-config/server-secret.properties $KAFKA_CONFIG_FILE
    fi`

function generateKafkaYamls(name: string, namespace: string): string[] {
  const initScript = KAFKA_INIT_SCRIPT
    .replace(/\{\{\s*\.Release\.Name\s*\}\}/g, name)
    .replace(/\{\{\s*\.Release\.Namespace\s*\}\}/g, namespace)

  const quorumVoters = `0@${name}-0.${name}-headless.${namespace}.svc.cluster.local:9093,1@${name}-1.${name}-headless.${namespace}.svc.cluster.local:9093,2@${name}-2.${name}-headless.${namespace}.svc.cluster.local:9093`
  const kraftClusterIdB64 = btoaUtf8(KRAFT_CLUSTER_ID)

  const scriptsConfigMapYaml = `apiVersion: v1
data:
  kafka-init.sh: |-
${initScript
  .split('\n')
  .map((line) => '    ' + line)
  .join('\n')}
kind: ConfigMap
metadata:
  labels:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: ${KAFKA_VERSION}
  name: ${name}-scripts
  namespace: ${namespace}
`

  const configConfigMapYaml = `---
apiVersion: v1
data:
  server.properties: |-
    # Listeners configuration
    listeners=CLIENT://:9092,INTERNAL://:9094,CONTROLLER://:9093
    advertised.listeners=CLIENT://advertised-address-placeholder:9092,INTERNAL://advertised-address-placeholder:9094
    listener.security.protocol.map=CLIENT:PLAINTEXT,INTERNAL:PLAINTEXT,CONTROLLER:PLAINTEXT
    # KRaft process roles
    process.roles=controller,broker
    #node.id=
    controller.listener.names=CONTROLLER
    controller.quorum.voters=${quorumVoters}
    log.dir=/bitnami/kafka/data
    # Interbroker configuration
    inter.broker.listener.name=INTERNAL
    auto.create.topics.enable=true
kind: ConfigMap
metadata:
  labels:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: ${KAFKA_VERSION}
  name: ${name}-config
  namespace: ${namespace}
`

  const headlessSvcYaml = `---
apiVersion: v1
kind: Service
metadata:
  labels:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: ${KAFKA_VERSION}
  name: ${name}-headless
  namespace: ${namespace}
spec:
  clusterIP: None
  clusterIPs:
  - None
  internalTrafficPolicy: Cluster
  ipFamilies:
  - IPv4
  ipFamilyPolicy: SingleStack
  ports:
  - name: tcp-interbroker
    port: 9094
    protocol: TCP
    targetPort: interbroker
  - name: tcp-client
    port: 9092
    protocol: TCP
    targetPort: client
  - name: tcp-controller
    port: 9093
    protocol: TCP
    targetPort: controller
  publishNotReadyAddresses: true
  selector:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: ${KAFKA_VERSION}
  sessionAffinity: None
  type: ClusterIP
`

  const clusterIPSvcYaml = `---
apiVersion: v1
kind: Service
metadata:
  labels:
    app.kubernetes.io/version: ${KAFKA_VERSION}
    app.kubernetes.io/instance: ${name}
    app.kubernetes.io/managed-by: Helm
    app.kubernetes.io/type: external-service
  name: ${name}
  namespace: ${namespace}
spec:
  ipFamilies:
  - IPv4
  ipFamilyPolicy: SingleStack
  ports:
  - name: tcp-client
    port: 9092
    protocol: TCP
    targetPort: client
  selector:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: ${KAFKA_VERSION}
  sessionAffinity: None
  type: ClusterIP
`

  const statefulSetYaml = `---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  labels:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: ${KAFKA_VERSION}
  name: ${name}
  namespace: ${namespace}
spec:
  replicas: 3
  selector:
    matchLabels:
      app.kubernetes.io/instance: ${namespace}
      app.kubernetes.io/name: ${name}
      app.kubernetes.io/version: ${KAFKA_VERSION}
  serviceName: ${name}-headless
  template:
    metadata:
      labels:
        app.kubernetes.io/instance: ${namespace}
        app.kubernetes.io/name: ${name}
        app.kubernetes.io/version: ${KAFKA_VERSION}
    spec:
      podManagementPolicy: Parallel
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - podAffinityTerm:
              labelSelector:
                matchLabels:
                  app.kubernetes.io/instance: ${namespace}
                  app.kubernetes.io/name: ${name}
                  app.kubernetes.io/version: ${KAFKA_VERSION}
              topologyKey: kubernetes.io/hostname
            weight: 1
      containers:
      - env:
        - name: BITNAMI_DEBUG
          value: "false"
        - name: KAFKA_HEAP_OPTS
          value: -Xmx1024m -Xms1024m
        - name: KAFKA_KRAFT_CLUSTER_ID
          valueFrom:
            secretKeyRef:
              key: kraft-cluster-id
              name: ${name}-kraft-cluster-id
        image: ${KAFKA_IMAGE}
        imagePullPolicy: Always
        livenessProbe:
          failureThreshold: 3
          initialDelaySeconds: 10
          periodSeconds: 10
          successThreshold: 1
          tcpSocket:
            port: controller
          timeoutSeconds: 5
        name: kafka
        ports:
        - containerPort: 9093
          name: controller
          protocol: TCP
        - containerPort: 9092
          name: client
          protocol: TCP
        - containerPort: 9094
          name: interbroker
          protocol: TCP
        readinessProbe:
          failureThreshold: 6
          initialDelaySeconds: 5
          periodSeconds: 10
          successThreshold: 1
          tcpSocket:
            port: controller
          timeoutSeconds: 5
        resources:
          limits:
            cpu: "2"
            memory: 4Gi
          requests:
            cpu: "2"
            memory: 4Gi
        securityContext:
          allowPrivilegeEscalation: false
          capabilities:
            drop:
            - ALL
          readOnlyRootFilesystem: true
          runAsNonRoot: true
          runAsUser: 1001
        terminationMessagePath: /dev/termination-log
        terminationMessagePolicy: File
        volumeMounts:
        - mountPath: /bitnami/kafka
          name: data
        - mountPath: /opt/bitnami/kafka/logs
          name: logs
        - mountPath: /opt/bitnami/kafka/config/server.properties
          name: kafka-config
          subPath: server.properties
        - mountPath: /tmp
          name: tmp
      dnsPolicy: ClusterFirst
      enableServiceLinks: true
      initContainers:
      - args:
        - -ec
        - |
          /scripts/kafka-init.sh
        command:
        - /bin/bash
        env:
        - name: BITNAMI_DEBUG
          value: "false"
        - name: MY_POD_NAME
          valueFrom:
            fieldRef:
              apiVersion: v1
              fieldPath: metadata.name
        - name: KAFKA_VOLUME_DIR
          value: /bitnami/kafka
        - name: KAFKA_MIN_ID
          value: "0"
        image: bitnami/kafka:3.6.0
        imagePullPolicy: Always
        name: kafka-init
        resources: {}
        securityContext:
          allowPrivilegeEscalation: false
          capabilities:
            drop:
            - ALL
          readOnlyRootFilesystem: true
          runAsNonRoot: true
          runAsUser: 1001
        terminationMessagePath: /dev/termination-log
        terminationMessagePolicy: File
        volumeMounts:
        - mountPath: /bitnami/kafka
          name: data
        - mountPath: /config
          name: kafka-config
        - mountPath: /configmaps
          name: kafka-configmaps
        - mountPath: /secret-config
          name: kafka-secret-config
        - mountPath: /scripts
          name: scripts
        - mountPath: /tmp
          name: tmp
      restartPolicy: Always
      schedulerName: default-scheduler
      securityContext:
        fsGroup: 1001
        seccompProfile:
          type: RuntimeDefault
      terminationGracePeriodSeconds: 30
      volumes:
      - configMap:
          defaultMode: 420
          name: ${name}-config
        name: kafka-configmaps
      - emptyDir: {}
        name: kafka-secret-config
      - emptyDir: {}
        name: kafka-config
      - emptyDir: {}
        name: tmp
      - configMap:
          defaultMode: 493
          name: ${name}-scripts
        name: scripts
      - emptyDir: {}
        name: logs
  updateStrategy:
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
          storage: 8Gi
      storageClassName: local
      volumeMode: Filesystem
    status:
      phase: Pending
`

  const secretYaml = `---
apiVersion: v1
data:
  kraft-cluster-id: ${kraftClusterIdB64}
kind: Secret
metadata:
  labels:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: ${KAFKA_VERSION}
  name: ${name}-kraft-cluster-id
  namespace: ${namespace}
type: Opaque
`

  return [
    scriptsConfigMapYaml,
    configConfigMapYaml,
    headlessSvcYaml,
    clusterIPSvcYaml,
    secretYaml,
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

function applyWithNamespace(namespace: string, yamls: string[]): string[] {
  const nsYaml = `apiVersion: v1
kind: Namespace
metadata:
  name: ${namespace}
`
  return [nsYaml, ...yamls]
}

interface KafkaCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function KafkaCreateDialog({
  open,
  onOpenChange,
  onSuccess,
}: KafkaCreateDialogProps) {
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
      toast.error(t('kafka.nameInvalid', 'Name must be a valid Kubernetes resource name'))
      return
    }
    if (!namespace?.trim()) {
      toast.error(t('kafka.namespaceRequired', 'Namespace is required'))
      return
    }

    setIsLoading(true)
    try {
      const yamls = generateKafkaYamls(instanceName, namespace.trim())
      const withNs = applyWithNamespace(namespace.trim(), yamls)
      await applyMultiYaml(withNs)
      toast.success(t('kafka.createSuccess', 'Kafka created successfully'))
      setName(DEFAULT_NAME)
      setNamespace(DEFAULT_NAMESPACE)
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      console.error('Failed to create Kafka', err)
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
          <DialogTitle>{t('kafka.createTitle', 'Create Kafka')}</DialogTitle>
          <DialogDescription>
            {t('kafka.createDescription', 'Create a Kafka cluster with ConfigMap, Secret, Services and StatefulSet')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('kafka.instanceName', 'Instance Name')}</Label>
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
