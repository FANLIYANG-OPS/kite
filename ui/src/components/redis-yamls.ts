// Redis Sentinel YAML resources - from tmp/redis.yaml
// Uses ${name}, ${namespace}, ${password} for template interpolation (no replace)

import { btoaUtf8 } from '@/lib/utils'

function indent(s: string, n: number): string {
  const pad = ' '.repeat(n)
  return s.split('\n').map((l) => pad + l).join('\n')
}

export function generateRedisYamls(
  name: string,
  namespace: string,
  password: string
): string[] {
  const headlessSvc = `${name}-headless.${namespace}.svc.cluster.local`
  const redisSvc = `${name}.${namespace}.svc.cluster.local`
  const sentinelMonitor = `${name}-0.${headlessSvc}`
  const passwordB64 = btoaUtf8(password)

  const svcYaml = `apiVersion: v1
kind: Service
metadata:
  labels:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/managed-by: Helm
    app.kubernetes.io/type: external-service
    app.kubernetes.io/version: 6.2.20
  name: ${name}
  namespace: ${namespace}
spec:
  internalTrafficPolicy: Cluster
  ipFamilies:
  - IPv4
  ipFamilyPolicy: SingleStack
  ports:
  - name: tcp-redis
    port: 6379
    protocol: TCP
    targetPort: 6379
  - name: tcp-sentinel
    port: 26379
    protocol: TCP
    targetPort: 26379
  selector:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: 6.2.20
  sessionAffinity: None
  type: ClusterIP
`

  const svcHeadlessYaml = `apiVersion: v1
kind: Service
metadata:
  labels:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/managed-by: Helm
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: 6.2.20
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
  - name: tcp-redis
    port: 6379
    protocol: TCP
    targetPort: redis
  - name: tcp-sentinel
    port: 26379
    protocol: TCP
    targetPort: redis-sentinel
  publishNotReadyAddresses: true
  selector:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: 6.2.20
  sessionAffinity: None
  type: ClusterIP
`

  const sentinelConf = `dir "/tmp"
port 26379
sentinel monitor mymaster ${sentinelMonitor} 6379 2
sentinel down-after-milliseconds mymaster 60000
sentinel failover-timeout mymaster 180000
sentinel parallel-syncs mymaster 1
ignore-warnings ARM64-COW-BUG
`

  const configMapConfigurationYaml = `apiVersion: v1
kind: ConfigMap
metadata:
  labels:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/managed-by: Helm
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: 6.2.20
  name: ${name}-configuration
  namespace: ${namespace}
data:
  master.conf: |-
    dir /data
    rename-command FLUSHDB ""
    rename-command FLUSHALL ""
  redis.conf: |-
    appendonly yes
    save ""
    ignore-warnings ARM64-COW-BUG
  replica.conf: |-
    dir /data
    rename-command FLUSHDB ""
    rename-command FLUSHALL ""
  sentinel.conf: |-
${indent(sentinelConf.trim(), 4)}
  users.acl: ""
`

  const healthScripts = `parse_sentinels.awk: |-
    /ip/ {FOUND_IP=1}
    /port/ {FOUND_PORT=1}
    /runid/ {FOUND_RUNID=1}
    !/ip|port|runid/ {
      if (FOUND_IP==1) {
        IP=$1; FOUND_IP=0;
      }
      else if (FOUND_PORT==1) {
        PORT=$1;
        FOUND_PORT=0;
      } else if (FOUND_RUNID==1) {
        printf "\\nsentinel known-sentinel mymaster %s %s %s", IP, PORT, $0; FOUND_RUNID=0;
      }
    }
  ping_liveness_local.sh: |-
    #!/bin/bash
    [[ -f $REDIS_PASSWORD_FILE ]] && export REDIS_PASSWORD="$(< "\${REDIS_PASSWORD_FILE}")"
    [[ -n "$REDIS_PASSWORD" ]] && export REDISCLI_AUTH="$REDIS_PASSWORD"
    response=$(timeout -s 15 $1 redis-cli -h localhost -p $REDIS_PORT ping)
    if [ "$?" -eq "124" ]; then echo "Timed out"; exit 1; fi
    responseFirstWord=$(echo $response | head -n1 | awk '{print $1;}')
    if [ "$response" != "PONG" ] && [ "$responseFirstWord" != "LOADING" ] && [ "$responseFirstWord" != "MASTERDOWN" ]; then
      echo "$response"; exit 1
    fi
  ping_liveness_local_and_master.sh: |-
    script_dir="$(dirname "$0")"
    exit_status=0
    "$script_dir/ping_liveness_local.sh" $1 || exit_status=$?
    "$script_dir/ping_liveness_master.sh" $1 || exit_status=$?
    exit $exit_status
  ping_liveness_master.sh: |-
    #!/bin/bash
    [[ -f $REDIS_MASTER_PASSWORD_FILE ]] && export REDIS_MASTER_PASSWORD="$(< "\${REDIS_MASTER_PASSWORD_FILE}")"
    [[ -n "$REDIS_MASTER_PASSWORD" ]] && export REDISCLI_AUTH="$REDIS_MASTER_PASSWORD"
    response=$(timeout -s 15 $1 redis-cli -h $REDIS_MASTER_HOST -p $REDIS_MASTER_PORT_NUMBER ping)
    if [ "$?" -eq "124" ]; then echo "Timed out"; exit 1; fi
    responseFirstWord=$(echo $response | head -n1 | awk '{print $1;}')
    if [ "$response" != "PONG" ] && [ "$responseFirstWord" != "LOADING" ]; then echo "$response"; exit 1; fi
  ping_readiness_local.sh: |-
    #!/bin/bash
    [[ -f $REDIS_PASSWORD_FILE ]] && export REDIS_PASSWORD="$(< "\${REDIS_PASSWORD_FILE}")"
    [[ -n "$REDIS_PASSWORD" ]] && export REDISCLI_AUTH="$REDIS_PASSWORD"
    response=$(timeout -s 15 $1 redis-cli -h localhost -p $REDIS_PORT ping)
    if [ "$?" -eq "124" ]; then echo "Timed out"; exit 1; fi
    if [ "$response" != "PONG" ]; then echo "$response"; exit 1; fi
  ping_readiness_local_and_master.sh: |-
    script_dir="$(dirname "$0")"
    exit_status=0
    "$script_dir/ping_readiness_local.sh" $1 || exit_status=$?
    "$script_dir/ping_readiness_master.sh" $1 || exit_status=$?
    exit $exit_status
  ping_readiness_master.sh: |-
    #!/bin/bash
    [[ -f $REDIS_MASTER_PASSWORD_FILE ]] && export REDIS_MASTER_PASSWORD="$(< "\${REDIS_MASTER_PASSWORD_FILE}")"
    [[ -n "$REDIS_MASTER_PASSWORD" ]] && export REDISCLI_AUTH="$REDIS_MASTER_PASSWORD"
    response=$(timeout -s 15 $1 redis-cli -h $REDIS_MASTER_HOST -p $REDIS_MASTER_PORT_NUMBER ping)
    if [ "$?" -eq "124" ]; then echo "Timed out"; exit 1; fi
    if [ "$response" != "PONG" ]; then echo "$response"; exit 1; fi
  ping_sentinel.sh: |-
    #!/bin/bash
    response=$(timeout -s 15 $1 redis-cli -h localhost -p $REDIS_SENTINEL_PORT ping)
    if [ "$?" -eq "124" ]; then echo "Timed out"; exit 1; fi
    if [ "$response" != "PONG" ]; then echo "$response"; exit 1; fi
`

  const configMapHealthYaml = `apiVersion: v1
kind: ConfigMap
metadata:
  labels:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/managed-by: Helm
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: 6.2.20
  name: ${name}-health
  namespace: ${namespace}
data:
${indent(healthScripts.trim(), 2)}
`

  const prestopRedisSh = `#!/bin/bash
. /opt/bitnami/scripts/libvalidations.sh
. /opt/bitnami/scripts/libos.sh
run_redis_command() {
    local args=("-h" "127.0.0.1")
    args+=("-p" "$REDIS_PORT")
    redis-cli "\${args[@]}" "$@"
}
is_master() {
    REDIS_ROLE=$(run_redis_command role | head -1)
    [[ "$REDIS_ROLE" == "master" ]]
}
HEADLESS_SERVICE="${headlessSvc}"
get_full_hostname() {
    hostname="$1"
    full_hostname="\${hostname}.\${HEADLESS_SERVICE}"
    echo "\${full_hostname}"
}
run_sentinel_command() {
    env -u REDISCLI_AUTH redis-cli -h "$REDIS_SERVICE" -p "$REDIS_SENTINEL_PORT" sentinel "$@"
}
sentinel_failover_finished() {
    REDIS_SENTINEL_INFO=($(run_sentinel_command get-master-addr-by-name "mymaster"))
    REDIS_MASTER_HOST="\${REDIS_SENTINEL_INFO[0]}"
    [[ "$REDIS_MASTER_HOST" != "$(get_full_hostname $HOSTNAME)" ]]
}
REDIS_SERVICE="${redisSvc}"
[[ -n "$REDIS_PASSWORD" ]] && export REDISCLI_AUTH="$REDIS_PASSWORD"
[[ -f "$REDIS_PASSWORD_FILE" ]] && export REDISCLI_AUTH="$(< "\${REDIS_PASSWORD_FILE}")"
if is_master && ! sentinel_failover_finished; then
    echo "I am the master pod and you are stopping me. Pausing client connections."
    run_redis_command CLIENT PAUSE "22000" WRITE
    run_sentinel_command failover "mymaster"
    echo "Waiting for sentinel to complete failover for up to 20s"
    retry_while "sentinel_failover_finished" "20" 1
else
    exit 0
fi
`

  const prestopSentinelSh = `#!/bin/bash
. /opt/bitnami/scripts/libvalidations.sh
. /opt/bitnami/scripts/libos.sh
HEADLESS_SERVICE="${headlessSvc}"
get_full_hostname() {
    hostname="$1"
    full_hostname="\${hostname}.\${HEADLESS_SERVICE}"
    echo "\${full_hostname}"
}
run_sentinel_command() {
    redis-cli -h "$REDIS_SERVICE" -p "$REDIS_SENTINEL_PORT" sentinel "$@"
}
sentinel_failover_finished() {
  REDIS_SENTINEL_INFO=($(run_sentinel_command get-master-addr-by-name "mymaster"))
  REDIS_MASTER_HOST="\${REDIS_SENTINEL_INFO[0]}"
  [[ "$REDIS_MASTER_HOST" != "$(get_full_hostname $HOSTNAME)" ]]
}
REDIS_SERVICE="${redisSvc}"
if ! sentinel_failover_finished; then
    echo "I am the master pod and you are stopping me. Starting sentinel failover"
    if retry_while "sentinel_failover_finished" "20" 1; then
        echo "Master has been successfuly failed over to a different pod."
        exit 0
    else
        echo "Master failover failed"
        exit 1
    fi
else
    exit 0
fi
`

  const startNodeSh = `#!/bin/bash
. /opt/bitnami/scripts/libos.sh
. /opt/bitnami/scripts/liblog.sh
. /opt/bitnami/scripts/libvalidations.sh
get_port() {
    hostname="$1"
    type="$2"
    port_var=$(echo "\${hostname^^}_SERVICE_PORT_$type" | sed "s/-/_/g")
    port=\${!port_var}
    if [ -z "$port" ]; then
        case $type in
            "SENTINEL") echo 26379 ;;
            "REDIS") echo 6379 ;;
        esac
    else
        echo $port
    fi
}
get_full_hostname() {
    hostname="$1"
    full_hostname="\${hostname}.\${HEADLESS_SERVICE}"
    echo "\${full_hostname}"
}
REDISPORT=$(get_port "$HOSTNAME" "REDIS")
HEADLESS_SERVICE="${headlessSvc}"
REDIS_SERVICE="${redisSvc}"
SENTINEL_SERVICE_PORT=$(get_port "${name}" "SENTINEL")
redis_cli_command() {
    local timeout="\${1:-0}"
    local args=("-h" "$REDIS_SERVICE" "-p" "$SENTINEL_SERVICE_PORT")
    local command="redis-cli"
    if [ "$timeout" -gt 0 ]; then
        command="timeout $timeout $command"
    fi
    echo " $command \${args[*]}"
}
validate_quorum() {
    quorum_info_command="$(redis_cli_command) sentinel master mymaster"
    eval $quorum_info_command | grep -Fq "s_down"
}
trigger_manual_failover() {
    failover_command="$(redis_cli_command) sentinel failover mymaster"
    eval $failover_command
}
get_sentinel_master_info() {
    sentinel_info_command="$(redis_cli_command 90) sentinel get-master-addr-by-name mymaster"
    retry_while "eval $sentinel_info_command" 2 5
}
[[ -f $REDIS_PASSWORD_FILE ]] && export REDIS_PASSWORD="$(< "\${REDIS_PASSWORD_FILE}")"
[[ -f $REDIS_MASTER_PASSWORD_FILE ]] && export REDIS_MASTER_PASSWORD="$(< "\${REDIS_MASTER_PASSWORD_FILE}")"
master_in_persisted_conf="$(get_full_hostname "$HOSTNAME")"
master_port_in_persisted_conf="$REDIS_MASTER_PORT_NUMBER"
master_in_sentinel="$(get_sentinel_master_info)"
redisRetVal=$?
if [[ -f /opt/bitnami/redis-sentinel/etc/sentinel.conf ]]; then
    master_in_persisted_conf="$(awk '/monitor/ {print $4}' /opt/bitnami/redis-sentinel/etc/sentinel.conf)"
    master_port_in_persisted_conf="$(awk '/monitor/ {print $5}' /opt/bitnami/redis-sentinel/etc/sentinel.conf)"
fi
if [[ -f /opt/bitnami/redis/mounted-etc/users.acl ]];then
    cp /opt/bitnami/redis/mounted-etc/users.acl /opt/bitnami/redis/etc/users.acl
fi
if [[ $redisRetVal -ne 0 ]]; then
    if [[ "$master_in_persisted_conf" == "$(get_full_hostname "$HOSTNAME")" ]]; then
        export REDIS_REPLICATION_MODE="master"
    else
        export REDIS_REPLICATION_MODE="replica"
        REDIS_MASTER_HOST=\${master_in_persisted_conf}
        REDIS_MASTER_PORT_NUMBER=\${master_port_in_persisted_conf}
    fi
else
    REDIS_SENTINEL_INFO=($(get_sentinel_master_info))
    REDIS_MASTER_HOST=\${REDIS_SENTINEL_INFO[0]}
    REDIS_MASTER_PORT_NUMBER=\${REDIS_SENTINEL_INFO[1]}
    if [[ "$REDIS_MASTER_HOST" == "$(get_full_hostname "$HOSTNAME")" ]]; then
        export REDIS_REPLICATION_MODE="master"
    else
        export REDIS_REPLICATION_MODE="replica"
    fi
fi
if [[ -f /opt/bitnami/redis/mounted-etc/replica.conf ]];then
    cp /opt/bitnami/redis/mounted-etc/replica.conf /opt/bitnami/redis/etc/replica.conf
fi
if [[ -f /opt/bitnami/redis/mounted-etc/redis.conf ]];then
    cp /opt/bitnami/redis/mounted-etc/redis.conf /opt/bitnami/redis/etc/redis.conf
fi
echo "" >> /opt/bitnami/redis/etc/replica.conf
echo "replica-announce-port $REDISPORT" >> /opt/bitnami/redis/etc/replica.conf
echo "replica-announce-ip $(get_full_hostname "$HOSTNAME")" >> /opt/bitnami/redis/etc/replica.conf
ARGS=("--port" "\${REDIS_PORT}")
if [[ "$REDIS_REPLICATION_MODE" = "slave" ]] || [[ "$REDIS_REPLICATION_MODE" = "replica" ]]; then
    ARGS+=("--replicaof" "\${REDIS_MASTER_HOST}" "\${REDIS_MASTER_PORT_NUMBER}")
fi
ARGS+=("--requirepass" "\${REDIS_PASSWORD}")
ARGS+=("--masterauth" "\${REDIS_MASTER_PASSWORD}")
ARGS+=("--include" "/opt/bitnami/redis/etc/replica.conf")
ARGS+=("--include" "/opt/bitnami/redis/etc/redis.conf")
exec redis-server "\${ARGS[@]}"
`

  const startSentinelSh = `#!/bin/bash
. /opt/bitnami/scripts/libos.sh
. /opt/bitnami/scripts/libvalidations.sh
. /opt/bitnami/scripts/libfile.sh
HEADLESS_SERVICE="${headlessSvc}"
REDIS_SERVICE="${redisSvc}"
get_port() {
    hostname="$1"
    type="$2"
    port_var=$(echo "\${hostname^^}_SERVICE_PORT_$type" | sed "s/-/_/g")
    port=\${!port_var}
    if [ -z "$port" ]; then
        case $type in "SENTINEL") echo 26379 ;; "REDIS") echo 6379 ;; esac
    else
        echo $port
    fi
}
get_full_hostname() {
    hostname="$1"
    full_hostname="\${hostname}.\${HEADLESS_SERVICE}"
    echo "\${full_hostname}"
}
SERVPORT=$(get_port "$HOSTNAME" "SENTINEL")
REDISPORT=$(get_port "$HOSTNAME" "REDIS")
SENTINEL_SERVICE_PORT=$(get_port "${name}" "SENTINEL")
sentinel_conf_set() {
    local -r key="\${1:?missing key}"
    local value="\${2:-}"
    value="\${value//\\\\/\\\\\\\\}"
    value="\${value//&/\\\\&}"
    value="\${value//\\?/\\\\?}"
    [[ "$value" = "" ]] && value="\\"$value\\""
    replace_in_file "/opt/bitnami/redis-sentinel/etc/prepare-sentinel.conf" "^#*\\\\s*\${key} .*" "\${key} \${value}" false
}
sentinel_conf_add() {
    echo $'\\n'"$@" >> "/opt/bitnami/redis-sentinel/etc/prepare-sentinel.conf"
}
host_id() {
    echo "$1" | openssl sha1 | awk '{print $2}'
}
get_sentinel_master_info() {
    sentinel_info_command="timeout 90 redis-cli -h $REDIS_SERVICE -p $SENTINEL_SERVICE_PORT sentinel get-master-addr-by-name mymaster"
    retry_while "eval $sentinel_info_command" 2 5
}
[[ -f $REDIS_PASSWORD_FILE ]] && export REDIS_PASSWORD="$(< "\${REDIS_PASSWORD_FILE}")"
master_in_persisted_conf="$(get_full_hostname "$HOSTNAME")"
if [[ -f /opt/bitnami/redis-sentinel/etc/sentinel.conf ]]; then
    master_in_persisted_conf="$(awk '/monitor/ {print $4}' /opt/bitnami/redis-sentinel/etc/sentinel.conf)"
fi
REDIS_SENTINEL_INFO=($(get_sentinel_master_info))
if [ "$?" -eq "0" ]; then
    REDIS_MASTER_HOST=\${REDIS_SENTINEL_INFO[0]}
    REDIS_MASTER_PORT_NUMBER=\${REDIS_SENTINEL_INFO[1]}
else
    REDIS_MASTER_HOST="$master_in_persisted_conf"
    REDIS_MASTER_PORT_NUMBER="$REDISPORT"
fi
if [[ "$REDIS_MASTER_HOST" == "$(get_full_hostname "$HOSTNAME")" ]]; then
    export REDIS_REPLICATION_MODE="master"
else
    export REDIS_REPLICATION_MODE="replica"
fi
[[ -n "$REDIS_EXTERNAL_MASTER_HOST" ]] && REDIS_MASTER_HOST="$REDIS_EXTERNAL_MASTER_HOST" && REDIS_MASTER_PORT_NUMBER="\${REDIS_EXTERNAL_MASTER_PORT}"
cp /opt/bitnami/redis-sentinel/mounted-etc/sentinel.conf /opt/bitnami/redis-sentinel/etc/prepare-sentinel.conf
printf "\\nsentinel auth-pass %s %s" "mymaster" "$REDIS_PASSWORD" >> /opt/bitnami/redis-sentinel/etc/prepare-sentinel.conf
printf "\\nsentinel myid %s" "$(host_id "$HOSTNAME")" >> /opt/bitnami/redis-sentinel/etc/prepare-sentinel.conf
sentinel_conf_set "sentinel monitor" "mymaster "$REDIS_MASTER_HOST" "$REDIS_MASTER_PORT_NUMBER" 2"
add_known_sentinel() {
    hostname="$1"
    ip="$2"
    if [[ -n "$hostname" && -n "$ip" && "$hostname" != "$HOSTNAME" ]]; then
        sentinel_conf_add "sentinel known-sentinel mymaster $(get_full_hostname "$hostname") $(get_port "$hostname" "SENTINEL") $(host_id "$hostname")"
    fi
}
add_known_replica() {
    hostname="$1"
    ip="$2"
    if [[ -n "$ip" && "$(get_full_hostname "$hostname")" != "$REDIS_MASTER_HOST" ]]; then
        sentinel_conf_add "sentinel known-replica mymaster $(get_full_hostname "$hostname") $(get_port "$hostname" "REDIS")"
    fi
}
for node in $(seq 0 2); do
    hostname="${name}-\${node}"
    ip="$(getent hosts "$hostname.$HEADLESS_SERVICE" | awk '{ print $1 }')"
    add_known_sentinel "$hostname" "$ip"
    add_known_replica "$hostname" "$ip"
done
echo "" >> /opt/bitnami/redis-sentinel/etc/prepare-sentinel.conf
echo "sentinel announce-hostnames yes" >> /opt/bitnami/redis-sentinel/etc/prepare-sentinel.conf
echo "sentinel resolve-hostnames yes" >> /opt/bitnami/redis-sentinel/etc/prepare-sentinel.conf
echo "sentinel announce-port $SERVPORT" >> /opt/bitnami/redis-sentinel/etc/prepare-sentinel.conf
mv /opt/bitnami/redis-sentinel/etc/prepare-sentinel.conf /opt/bitnami/redis-sentinel/etc/sentinel.conf
exec redis-server /opt/bitnami/redis-sentinel/etc/sentinel.conf --sentinel
`

  const scriptsData = `prestop-redis.sh: |
${indent(prestopRedisSh.trim(), 2)}
  prestop-sentinel.sh: |
${indent(prestopSentinelSh.trim(), 2)}
  start-node.sh: |
${indent(startNodeSh.trim(), 2)}
  start-sentinel.sh: |
${indent(startSentinelSh.trim(), 2)}
`

  const configMapScriptsYaml = `apiVersion: v1
kind: ConfigMap
metadata:
  labels:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/managed-by: Helm
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: 6.2.20
  name: ${name}-scripts
  namespace: ${namespace}
data:
${indent(scriptsData.trim(), 2)}
`

  const secretYaml = `apiVersion: v1
kind: Secret
metadata:
  labels:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/managed-by: Helm
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: 6.2.20
  name: ${name}
  namespace: ${namespace}
type: Opaque
data:
  redis-password: ${passwordB64}
`

  const statefulSetYaml = `apiVersion: apps/v1
kind: StatefulSet
metadata:
  labels:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/managed-by: Helm
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: 6.2.20
  name: ${name}
  namespace: ${namespace}
spec:
  podManagementPolicy: OrderedReady
  replicas: 3
  revisionHistoryLimit: 10
  selector:
    matchLabels:
      app.kubernetes.io/instance: ${namespace}
      app.kubernetes.io/name: ${name}
      app.kubernetes.io/version: 6.2.20
  serviceName: ${name}-headless
  template:
    metadata:
      labels:
        app.kubernetes.io/instance: ${namespace}
        app.kubernetes.io/name: ${name}
        app.kubernetes.io/version: 6.2.20
    spec:
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - podAffinityTerm:
              labelSelector:
                matchLabels:
                  app.kubernetes.io/instance: ${namespace}
                  app.kubernetes.io/name: ${name}
                  app.kubernetes.io/version: 6.2.20
              topologyKey: kubernetes.io/hostname
            weight: 1
      automountServiceAccountToken: false
      containers:
      - args:
        - /opt/bitnami/scripts/start-scripts/start-node.sh
        command:
        - /bin/bash
        - -c
        env:
        - name: POD_NAME
          valueFrom:
            fieldRef:
              apiVersion: v1
              fieldPath: metadata.name
        - name: BITNAMI_DEBUG
          value: "false"
        - name: REDIS_MASTER_PORT_NUMBER
          value: "6379"
        - name: ALLOW_EMPTY_PASSWORD
          value: "no"
        - name: REDIS_PASSWORD_FILE
          value: /opt/bitnami/redis/secrets/redis-password
        - name: REDIS_MASTER_PASSWORD_FILE
          value: /opt/bitnami/redis/secrets/redis-password
        - name: REDIS_TLS_ENABLED
          value: "no"
        - name: REDIS_PORT
          value: "6379"
        - name: REDIS_SENTINEL_TLS_ENABLED
          value: "no"
        - name: REDIS_SENTINEL_PORT
          value: "26379"
        - name: REDIS_DATA_DIR
          value: /data
        image: bitnami/redis:6.2.20
        imagePullPolicy: Always
        lifecycle:
          preStop:
            exec:
              command:
              - /bin/bash
              - -c
              - /opt/bitnami/scripts/start-scripts/prestop-redis.sh
        livenessProbe:
          exec:
            command:
            - sh
            - -c
            - /health/ping_liveness_local.sh 5
          failureThreshold: 5
          initialDelaySeconds: 20
          periodSeconds: 5
          successThreshold: 1
          timeoutSeconds: 5
        name: redis
        ports:
        - containerPort: 6379
          name: redis
          protocol: TCP
        readinessProbe:
          exec:
            command:
            - sh
            - -c
            - /health/ping_readiness_local.sh 1
          failureThreshold: 5
          initialDelaySeconds: 20
          periodSeconds: 5
          successThreshold: 1
          timeoutSeconds: 1
        resources:
          limits:
            cpu: 500m
            memory: 2Gi
          requests:
            cpu: 500m
            memory: 1Gi
        securityContext:
          allowPrivilegeEscalation: false
          capabilities:
            drop:
            - ALL
          readOnlyRootFilesystem: true
          runAsGroup: 1001
          runAsNonRoot: true
          runAsUser: 1001
          seccompProfile:
            type: RuntimeDefault
        startupProbe:
          exec:
            command:
            - sh
            - -c
            - /health/ping_liveness_local.sh 5
          failureThreshold: 22
          initialDelaySeconds: 10
          periodSeconds: 10
          successThreshold: 1
          timeoutSeconds: 5
        terminationMessagePath: /dev/termination-log
        terminationMessagePolicy: File
        volumeMounts:
        - mountPath: /opt/bitnami/scripts/start-scripts
          name: start-scripts
        - mountPath: /health
          name: health
        - mountPath: /opt/bitnami/redis-sentinel/etc
          name: sentinel-data
        - mountPath: /opt/bitnami/redis/secrets/
          name: redis-password
        - mountPath: /data
          name: redis-data
        - mountPath: /opt/bitnami/redis/mounted-etc
          name: config
        - mountPath: /opt/bitnami/redis/etc
          name: empty-dir
          subPath: app-conf-dir
        - mountPath: /tmp
          name: empty-dir
          subPath: tmp-dir
      - args:
        - /opt/bitnami/scripts/start-scripts/start-sentinel.sh
        command:
        - /bin/bash
        - -c
        env:
        - name: POD_NAME
          valueFrom:
            fieldRef:
              apiVersion: v1
              fieldPath: metadata.name
        - name: BITNAMI_DEBUG
          value: "false"
        - name: REDIS_PASSWORD_FILE
          value: /opt/bitnami/redis/secrets/redis-password
        - name: REDIS_SENTINEL_TLS_ENABLED
          value: "no"
        - name: REDIS_SENTINEL_PORT
          value: "26379"
        image: bitnami/redis-sentinel:6.2.20
        imagePullPolicy: IfNotPresent
        lifecycle:
          preStop:
            exec:
              command:
              - /bin/bash
              - -c
              - /opt/bitnami/scripts/start-scripts/prestop-sentinel.sh
        livenessProbe:
          exec:
            command:
            - sh
            - -c
            - /health/ping_sentinel.sh 5
          failureThreshold: 6
          initialDelaySeconds: 20
          periodSeconds: 10
          successThreshold: 1
          timeoutSeconds: 5
        name: sentinel
        ports:
        - containerPort: 26379
          name: redis-sentinel
          protocol: TCP
        readinessProbe:
          exec:
            command:
            - sh
            - -c
            - /health/ping_sentinel.sh 1
          failureThreshold: 6
          initialDelaySeconds: 20
          periodSeconds: 5
          successThreshold: 1
          timeoutSeconds: 1
        resources:
          limits:
            cpu: 500m
            memory: 2Gi
          requests:
            cpu: 500m
            memory: 1Gi
        securityContext:
          allowPrivilegeEscalation: false
          capabilities:
            drop:
            - ALL
          readOnlyRootFilesystem: true
          runAsGroup: 1001
          runAsNonRoot: true
          runAsUser: 1001
          seccompProfile:
            type: RuntimeDefault
        startupProbe:
          exec:
            command:
            - sh
            - -c
            - /health/ping_sentinel.sh 5
          failureThreshold: 22
          initialDelaySeconds: 10
          periodSeconds: 10
          successThreshold: 1
          timeoutSeconds: 5
        terminationMessagePath: /dev/termination-log
        terminationMessagePolicy: File
        volumeMounts:
        - mountPath: /tmp
          name: empty-dir
          subPath: tmp-dir
        - mountPath: /opt/bitnami/scripts/start-scripts
          name: start-scripts
        - mountPath: /health
          name: health
        - mountPath: /opt/bitnami/redis-sentinel/etc
          name: sentinel-data
        - mountPath: /opt/bitnami/redis/secrets/
          name: redis-password
        - mountPath: /data
          name: redis-data
        - mountPath: /opt/bitnami/redis-sentinel/mounted-etc
          name: config
      dnsPolicy: ClusterFirst
      enableServiceLinks: true
      restartPolicy: Always
      schedulerName: default-scheduler
      securityContext:
        fsGroup: 1001
        fsGroupChangePolicy: Always
      terminationGracePeriodSeconds: 30
      volumes:
      - configMap:
          defaultMode: 493
          name: ${name}-scripts
        name: start-scripts
      - configMap:
          defaultMode: 493
          name: ${name}-health
        name: health
      - name: redis-password
        secret:
          defaultMode: 420
          items:
          - key: redis-password
            path: redis-password
          secretName: ${name}
      - configMap:
          defaultMode: 420
          name: ${name}-configuration
        name: config
      - emptyDir: {}
        name: sentinel-data
      - emptyDir: {}
        name: empty-dir
  updateStrategy:
    type: RollingUpdate
  volumeClaimTemplates:
  - apiVersion: v1
    kind: PersistentVolumeClaim
    metadata:
      labels:
        app.kubernetes.io/component: node
        app.kubernetes.io/instance: ${namespace}
        app.kubernetes.io/name: ${name}
      name: redis-data
    spec:
      accessModes:
      - ReadWriteOnce
      resources:
        requests:
          storage: 8Gi
      storageClassName: local
      volumeMode: Filesystem
`

  return [
    svcYaml,
    svcHeadlessYaml,
    configMapConfigurationYaml,
    configMapHealthYaml,
    configMapScriptsYaml,
    secretYaml,
    statefulSetYaml,
  ]
}
