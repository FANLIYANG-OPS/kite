// Redis YAML template - inlined from tmp/redis.yaml
export const REDIS_TEMPLATE = `apiVersion: v1
kind: Service
metadata:
  annotations:
    meta.helm.sh/release-name: redis
    meta.helm.sh/release-namespace: jz-middleware
  creationTimestamp: "2026-02-12T08:16:28Z"
  labels:
    app.kubernetes.io/instance: redis
    app.kubernetes.io/managed-by: Helm
    app.kubernetes.io/type: external-service
    app.kubernetes.io/version: 6.2.20
  name: redis
  namespace: jz-middleware
  resourceVersion: "79997568"
  uid: fb374273-eda9-42da-a88f-b2d68dac3fec
spec:
  clusterIP: 10.233.8.28
  clusterIPs:
  - 10.233.8.28
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
    app.kubernetes.io/instance: jz-middleware
    app.kubernetes.io/name: redis
    app.kubernetes.io/version: 6.2.20
  sessionAffinity: None
  type: ClusterIP
status:
  loadBalancer: {}

---


apiVersion: v1
kind: Service
metadata:
  annotations:
    meta.helm.sh/release-name: redis
    meta.helm.sh/release-namespace: jz-middleware
  creationTimestamp: "2026-02-12T08:16:28Z"
  labels:
    app.kubernetes.io/instance: jz-middleware
    app.kubernetes.io/managed-by: Helm
    app.kubernetes.io/name: redis
    app.kubernetes.io/version: 6.2.20
  name: redis-headless
  namespace: jz-middleware
  resourceVersion: "79997567"
  uid: e77c89b4-0db1-4cf5-b112-e501c7b48f14
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
    app.kubernetes.io/instance: jz-middleware
    app.kubernetes.io/name: redis
    app.kubernetes.io/version: 6.2.20
  sessionAffinity: None
  type: ClusterIP
status:
  loadBalancer: {}


---


apiVersion: v1
data:
  master.conf: |-
    dir /data
    # User-supplied master configuration:
    rename-command FLUSHDB ""
    rename-command FLUSHALL ""
    # End of master configuration
  redis.conf: |-
    # User-supplied common configuration:
    # Enable AOF https://redis.io/topics/persistence#append-only-file
    appendonly yes
    # Disable RDB persistence, AOF persistence already enabled.
    save ""
    ignore-warnings ARM64-COW-BUG
    # End of common configuration
  replica.conf: |-
    dir /data
    # User-supplied replica configuration:
    rename-command FLUSHDB ""
    rename-command FLUSHALL ""
    # End of replica configuration
  sentinel.conf: |-
    dir "/tmp"
    port 26379
    sentinel monitor mymaster redis-0.redis-headless.jz-middleware.svc.cluster.local 6379 2
    sentinel down-after-milliseconds mymaster 60000
    sentinel failover-timeout mymaster 180000
    sentinel parallel-syncs mymaster 1
    ignore-warnings ARM64-COW-BUG
    # User-supplied sentinel configuration:
    # End of sentinel configuration
  users.acl: ""
kind: ConfigMap
metadata:
  annotations:
    meta.helm.sh/release-name: redis
    meta.helm.sh/release-namespace: jz-middleware
  creationTimestamp: "2026-02-12T08:16:28Z"
  labels:
    app.kubernetes.io/instance: jz-middleware
    app.kubernetes.io/managed-by: Helm
    app.kubernetes.io/name: redis
    app.kubernetes.io/version: 6.2.20
  name: redis-configuration
  namespace: jz-middleware
  resourceVersion: "79997563"
  uid: 89ac6693-89ca-4e47-add4-a22870936ee4

---

apiVersion: v1
data:
  parse_sentinels.awk: |-
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
        printf "\nsentinel known-sentinel mymaster %s %s %s", IP, PORT, $0; FOUND_RUNID=0;
      }
    }
  ping_liveness_local.sh: |-
    #!/bin/bash

    [[ -f $REDIS_PASSWORD_FILE ]] && export REDIS_PASSWORD="$(< "\${REDIS_PASSWORD_FILE}")"
    [[ -n "$REDIS_PASSWORD" ]] && export REDISCLI_AUTH="$REDIS_PASSWORD"
    response=$(
      timeout -s 15 $1 \
      redis-cli \
        -h localhost \
        -p $REDIS_PORT \
        ping
    )
    if [ "$?" -eq "124" ]; then
      echo "Timed out"
      exit 1
    fi
    responseFirstWord=$(echo $response | head -n1 | awk '{print $1;}')
    if [ "$response" != "PONG" ] && [ "$responseFirstWord" != "LOADING" ] && [ "$responseFirstWord" != "MASTERDOWN" ]; then
      echo "$response"
      exit 1
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
    response=$(
      timeout -s 15 $1 \
      redis-cli \
        -h $REDIS_MASTER_HOST \
        -p $REDIS_MASTER_PORT_NUMBER \
        ping
    )
    if [ "$?" -eq "124" ]; then
      echo "Timed out"
      exit 1
    fi
    responseFirstWord=$(echo $response | head -n1 | awk '{print $1;}')
    if [ "$response" != "PONG" ] && [ "$responseFirstWord" != "LOADING" ]; then
      echo "$response"
      exit 1
    fi
  ping_readiness_local.sh: |-
    #!/bin/bash

    [[ -f $REDIS_PASSWORD_FILE ]] && export REDIS_PASSWORD="$(< "\${REDIS_PASSWORD_FILE}")"
    [[ -n "$REDIS_PASSWORD" ]] && export REDISCLI_AUTH="$REDIS_PASSWORD"
    response=$(
      timeout -s 15 $1 \
      redis-cli \
        -h localhost \
        -p $REDIS_PORT \
        ping
    )
    if [ "$?" -eq "124" ]; then
      echo "Timed out"
      exit 1
    fi
    if [ "$response" != "PONG" ]; then
      echo "$response"
      exit 1
    fi
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
    response=$(
      timeout -s 15 $1 \
      redis-cli \
        -h $REDIS_MASTER_HOST \
        -p $REDIS_MASTER_PORT_NUMBER \
        ping
    )
    if [ "$?" -eq "124" ]; then
      echo "Timed out"
      exit 1
    fi
    if [ "$response" != "PONG" ]; then
      echo "$response"
      exit 1
    fi
  ping_sentinel.sh: |-
    #!/bin/bash
    response=$(
      timeout -s 15 $1 \
      redis-cli \
        -h localhost \
        -p $REDIS_SENTINEL_PORT \
        ping
    )
    if [ "$?" -eq "124" ]; then
      echo "Timed out"
      exit 1
    fi
    if [ "$response" != "PONG" ]; then
      echo "$response"
      exit 1
    fi
kind: ConfigMap
metadata:
  annotations:
    meta.helm.sh/release-name: redis
    meta.helm.sh/release-namespace: jz-middleware
  creationTimestamp: "2026-02-12T08:16:28Z"
  labels:
    app.kubernetes.io/instance: jz-middleware
    app.kubernetes.io/managed-by: Helm
    app.kubernetes.io/name: redis
    app.kubernetes.io/version: 6.2.20
  name: redis-health
  namespace: jz-middleware
  resourceVersion: "79997565"
  uid: 953da7a1-0101-41cd-99ee-4e74b0ac2c5e

---


apiVersion: v1
data:
  prestop-redis.sh: |
    #!/bin/bash

    . /opt/bitnami/scripts/libvalidations.sh
    . /opt/bitnami/scripts/libos.sh

    run_redis_command() {
        local args=("-h" "127.0.0.1")
        if is_boolean_yes "$REDIS_TLS_ENABLED"; then
            args+=("-p" "$REDIS_TLS_PORT" "--tls" "--cert" "$REDIS_TLS_CERT_FILE" "--key" "$REDIS_TLS_KEY_FILE")
            [ -n "$REDIS_TLS_CA_FILE" ] && args+=("--cacert" "$REDIS_TLS_CA_FILE")
        else
            args+=("-p" "$REDIS_PORT")
        fi
        redis-cli "\${args[@]}" "$@"
    }
    is_master() {
        REDIS_ROLE=$(run_redis_command role | head -1)
        [[ "$REDIS_ROLE" == "master" ]]
    }

    HEADLESS_SERVICE="redis-headless.jz-middleware.svc.cluster.local"

    get_full_hostname() {
        hostname="$1"
        full_hostname="\${hostname}.\${HEADLESS_SERVICE}"
        echo "\${full_hostname}"
    }

    run_sentinel_command() {
        if is_boolean_yes "$REDIS_SENTINEL_TLS_ENABLED"; then
            env -u REDISCLI_AUTH redis-cli -h "$REDIS_SERVICE" -p "$REDIS_SENTINEL_TLS_PORT_NUMBER" --tls --cert "$REDIS_SENTINEL_TLS_CERT_FILE" --key "$REDIS_SENTINEL_TLS_KEY_FILE" --cacert "$REDIS_SENTINEL_TLS_CA_FILE" sentinel "$@"
        else
            env -u REDISCLI_AUTH redis-cli -h "$REDIS_SERVICE" -p "$REDIS_SENTINEL_PORT" sentinel "$@"
        fi
    }
    sentinel_failover_finished() {
        REDIS_SENTINEL_INFO=($(run_sentinel_command get-master-addr-by-name "mymaster"))
        REDIS_MASTER_HOST="\${REDIS_SENTINEL_INFO[0]}"
        [[ "$REDIS_MASTER_HOST" != "$(get_full_hostname $HOSTNAME)" ]]
    }

    REDIS_SERVICE="redis.jz-middleware.svc.cluster.local"

    # redis-cli automatically consumes credentials from the REDISCLI_AUTH variable
    [[ -n "$REDIS_PASSWORD" ]] && export REDISCLI_AUTH="$REDIS_PASSWORD"
    [[ -f "$REDIS_PASSWORD_FILE" ]] && export REDISCLI_AUTH="$(< "\${REDIS_PASSWORD_FILE}")"


    if is_master && ! sentinel_failover_finished; then
        echo "I am the master pod and you are stopping me. Pausing client connections."
        # Pausing client write connections to avoid data loss
        run_redis_command CLIENT PAUSE "22000" WRITE

        echo "Issuing failover"
        # if I am the master, issue a command to failover once
        run_sentinel_command failover "mymaster"
        echo "Waiting for sentinel to complete failover for up to 20s"
        retry_while "sentinel_failover_finished" "20" 1
    else
        exit 0
    fi
  prestop-sentinel.sh: |
    #!/bin/bash

    . /opt/bitnami/scripts/libvalidations.sh
    . /opt/bitnami/scripts/libos.sh

    HEADLESS_SERVICE="redis-headless.jz-middleware.svc.cluster.local"

    get_full_hostname() {
        hostname="$1"
        full_hostname="\${hostname}.\${HEADLESS_SERVICE}"
        echo "\${full_hostname}"
    }

    run_sentinel_command() {
        if is_boolean_yes "$REDIS_SENTINEL_TLS_ENABLED"; then
            redis-cli -h "$REDIS_SERVICE" -p "$REDIS_SENTINEL_TLS_PORT_NUMBER" --tls --cert "$REDIS_SENTINEL_TLS_CERT_FILE" --key "$REDIS_SENTINEL_TLS_KEY_FILE" --cacert "$REDIS_SENTINEL_TLS_CA_FILE" sentinel "$@"
        else
            redis-cli -h "$REDIS_SERVICE" -p "$REDIS_SENTINEL_PORT" sentinel "$@"
        fi
    }
    sentinel_failover_finished() {
      REDIS_SENTINEL_INFO=($(run_sentinel_command get-master-addr-by-name "mymaster"))
      REDIS_MASTER_HOST="\${REDIS_SENTINEL_INFO[0]}"
      [[ "$REDIS_MASTER_HOST" != "$(get_full_hostname $HOSTNAME)" ]]
    }

    REDIS_SERVICE="redis.jz-middleware.svc.cluster.local"



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
  start-node.sh: |
    #!/bin/bash

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
                "SENTINEL")
                    echo 26379
                    ;;
                "REDIS")
                    echo 6379
                    ;;
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

    HEADLESS_SERVICE="redis-headless.jz-middleware.svc.cluster.local"

    if [ -n "$REDIS_EXTERNAL_MASTER_HOST" ]; then
        REDIS_SERVICE="$REDIS_EXTERNAL_MASTER_HOST"
    else
        REDIS_SERVICE="redis.jz-middleware.svc.cluster.local"
    fi

    SENTINEL_SERVICE_PORT=$(get_port "redis" "SENTINEL")

    redis_cli_command() {
        local timeout="\${1:-0}"

        local args=("-h" "$REDIS_SERVICE" "-p" "$SENTINEL_SERVICE_PORT")
        local command="redis-cli"
        if is_boolean_yes "$REDIS_TLS_ENABLED"; then
            args+=("--tls" "--cert" "$REDIS_TLS_CERT_FILE" "--key" "$REDIS_TLS_KEY_FILE")
            [ -n "$REDIS_TLS_CA_FILE" ] && args+=("--cacert" "$REDIS_TLS_CA_FILE")
        fi
        if [ "$timeout" -gt 0 ]; then
            command="timeout $timeout $command"
        fi

        echo " $command \${args[*]}"
    }

    validate_quorum() {
        quorum_info_command="$(redis_cli_command) sentinel master mymaster"
        info "about to run the command: $quorum_info_command"
        eval $quorum_info_command | grep -Fq "s_down"
    }

    trigger_manual_failover() {
        failover_command="$(redis_cli_command) sentinel failover mymaster"
        info "about to run the command: $failover_command"
        eval $failover_command
    }

    get_sentinel_master_info() {
        sentinel_info_command="$(redis_cli_command 90) sentinel get-master-addr-by-name mymaster"
        info "about to run the command: $sentinel_info_command"
        retry_while "eval $sentinel_info_command" 2 5
    }

    [[ -f $REDIS_PASSWORD_FILE ]] && export REDIS_PASSWORD="$(< "\${REDIS_PASSWORD_FILE}")"
    [[ -f $REDIS_MASTER_PASSWORD_FILE ]] && export REDIS_MASTER_PASSWORD="$(< "\${REDIS_MASTER_PASSWORD_FILE}")"

    # check if there is a master
    master_in_persisted_conf="$(get_full_hostname "$HOSTNAME")"
    master_port_in_persisted_conf="$REDIS_MASTER_PORT_NUMBER"
    master_in_sentinel="$(get_sentinel_master_info)"
    redisRetVal=$?

    if [[ -f /opt/bitnami/redis-sentinel/etc/sentinel.conf ]]; then
        master_in_persisted_conf="$(awk '/monitor/ {print $4}' /opt/bitnami/redis-sentinel/etc/sentinel.conf)"
        master_port_in_persisted_conf="$(awk '/monitor/ {print $5}' /opt/bitnami/redis-sentinel/etc/sentinel.conf)"
        info "Found previous master \${master_in_persisted_conf}:\${master_port_in_persisted_conf} in /opt/bitnami/redis-sentinel/etc/sentinel.conf"
        debug "$(cat /opt/bitnami/redis-sentinel/etc/sentinel.conf | grep monitor)"
    fi

    if [[ -f /opt/bitnami/redis/mounted-etc/users.acl ]];then
        cp /opt/bitnami/redis/mounted-etc/users.acl /opt/bitnami/redis/etc/users.acl
    fi

    if [[ $redisRetVal -ne 0 ]]; then
        if [[ "$master_in_persisted_conf" == "$(get_full_hostname "$HOSTNAME")" ]]; then
            # Case 1: No active sentinel and in previous sentinel.conf we were the master --> MASTER
            info "Configuring the node as master"
            export REDIS_REPLICATION_MODE="master"
        else
            # Case 2: No active sentinel and in previous sentinel.conf we were not master --> REPLICA
            info "Configuring the node as replica"
            export REDIS_REPLICATION_MODE="replica"
            REDIS_MASTER_HOST=\${master_in_persisted_conf}
            REDIS_MASTER_PORT_NUMBER=\${master_port_in_persisted_conf}
        fi
    else
        # Fetches current master's host and port
        REDIS_SENTINEL_INFO=($(get_sentinel_master_info))
        info "Current master: REDIS_SENTINEL_INFO=(\${REDIS_SENTINEL_INFO[0]},\${REDIS_SENTINEL_INFO[1]})"
        REDIS_MASTER_HOST=\${REDIS_SENTINEL_INFO[0]}
        REDIS_MASTER_PORT_NUMBER=\${REDIS_SENTINEL_INFO[1]}

        if [[ "$REDIS_MASTER_HOST" == "$(get_full_hostname "$HOSTNAME")" ]]; then
            # Case 3: Active sentinel and master it is this node --> MASTER
            info "Configuring the node as master"
            export REDIS_REPLICATION_MODE="master"
        else
            # Case 4: Active sentinel and master is not this node --> REPLICA
            info "Configuring the node as replica"
            export REDIS_REPLICATION_MODE="replica"
        fi
    fi

    if [[ -n "$REDIS_EXTERNAL_MASTER_HOST" ]]; then
      REDIS_MASTER_HOST="$REDIS_EXTERNAL_MASTER_HOST"
      REDIS_MASTER_PORT_NUMBER="\${REDIS_EXTERNAL_MASTER_PORT}"
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
  start-sentinel.sh: |
    #!/bin/bash

    . /opt/bitnami/scripts/libos.sh
    . /opt/bitnami/scripts/libvalidations.sh
    . /opt/bitnami/scripts/libfile.sh

    HEADLESS_SERVICE="redis-headless.jz-middleware.svc.cluster.local"
    REDIS_SERVICE="redis.jz-middleware.svc.cluster.local"

    get_port() {
        hostname="$1"
        type="$2"

        port_var=$(echo "\${hostname^^}_SERVICE_PORT_$type" | sed "s/-/_/g")
        port=\${!port_var}

        if [ -z "$port" ]; then
            case $type in
                "SENTINEL")
                    echo 26379
                    ;;
                "REDIS")
                    echo 6379
                    ;;
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

    SERVPORT=$(get_port "$HOSTNAME" "SENTINEL")
    REDISPORT=$(get_port "$HOSTNAME" "REDIS")
    SENTINEL_SERVICE_PORT=$(get_port "redis" "SENTINEL")

    sentinel_conf_set() {
        local -r key="\${1:?missing key}"
        local value="\${2:-}"

        # Sanitize inputs
        value="\${value//\\/\\\\}"
        value="\${value//&/\\&}"
        value="\${value//\?/\\?}"
        [[ "$value" = "" ]] && value="\"$value\""

        replace_in_file "/opt/bitnami/redis-sentinel/etc/prepare-sentinel.conf" "^#*\s*\${key} .*" "\${key} \${value}" false
    }
    sentinel_conf_add() {
        echo $'\n'"$@" >> "/opt/bitnami/redis-sentinel/etc/prepare-sentinel.conf"
    }
    host_id() {
        echo "$1" | openssl sha1 | awk '{print $2}'
    }
    get_sentinel_master_info() {
        if is_boolean_yes "$REDIS_SENTINEL_TLS_ENABLED"; then
            sentinel_info_command="timeout 90 redis-cli -h $REDIS_SERVICE -p $SENTINEL_SERVICE_PORT --tls --cert \${REDIS_SENTINEL_TLS_CERT_FILE} --key \${REDIS_SENTINEL_TLS_KEY_FILE} --cacert \${REDIS_SENTINEL_TLS_CA_FILE} sentinel get-master-addr-by-name mymaster"
        else
            sentinel_info_command="timeout 90 redis-cli -h $REDIS_SERVICE -p $SENTINEL_SERVICE_PORT sentinel get-master-addr-by-name mymaster"
        fi
        info "about to run the command: $sentinel_info_command"
        retry_while "eval $sentinel_info_command" 2 5
    }

    [[ -f $REDIS_PASSWORD_FILE ]] && export REDIS_PASSWORD="$(< "\${REDIS_PASSWORD_FILE}")"

    master_in_persisted_conf="$(get_full_hostname "$HOSTNAME")"

    if [[ -f /opt/bitnami/redis-sentinel/etc/sentinel.conf ]]; then
        master_in_persisted_conf="$(awk '/monitor/ {print $4}' /opt/bitnami/redis-sentinel/etc/sentinel.conf)"
        info "Found previous master $master_in_persisted_conf in /opt/bitnami/redis-sentinel/etc/sentinel.conf"
        debug "$(cat /opt/bitnami/redis-sentinel/etc/sentinel.conf | grep monitor)"
    fi
    REDIS_SENTINEL_INFO=($(get_sentinel_master_info))
    if [ "$?" -eq "0" ]; then
        # current master's host and port obtained from other Sentinel
        info "printing REDIS_SENTINEL_INFO=(\${REDIS_SENTINEL_INFO[0]},\${REDIS_SENTINEL_INFO[1]})"
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

    if [[ -n "$REDIS_EXTERNAL_MASTER_HOST" ]]; then
      REDIS_MASTER_HOST="$REDIS_EXTERNAL_MASTER_HOST"
      REDIS_MASTER_PORT_NUMBER="\${REDIS_EXTERNAL_MASTER_PORT}"
    fi

    # To prevent incomplete configuration and as the redis container accesses /opt/bitnami/redis-sentinel/etc/sentinel.conf
    # as well, prepare the new config in \`prepare-sentinel.conf\` and move it atomically to the ultimate destination when it is complete.
    cp /opt/bitnami/redis-sentinel/mounted-etc/sentinel.conf /opt/bitnami/redis-sentinel/etc/prepare-sentinel.conf
    printf "\nsentinel auth-pass %s %s" "mymaster" "$REDIS_PASSWORD" >> /opt/bitnami/redis-sentinel/etc/prepare-sentinel.conf
    printf "\nsentinel myid %s" "$(host_id "$HOSTNAME")" >> /opt/bitnami/redis-sentinel/etc/prepare-sentinel.conf

    if [[ -z "$REDIS_MASTER_HOST" ]] || [[ -z "$REDIS_MASTER_PORT_NUMBER" ]]
    then
        # Prevent incorrect configuration to be written to sentinel.conf
        error "Redis master host is configured incorrectly (host: $REDIS_MASTER_HOST, port: $REDIS_MASTER_PORT_NUMBER)"
        exit 1
    fi
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

    add_known_sentinel_public_ip() {
        hostname="$1"
        ip="$2"
        sentinel_conf_add "sentinel known-sentinel mymaster $ip $(get_port "$hostname" "SENTINEL") $(host_id "$hostname")"
    }

    add_known_replica_public_ip() {
        hostname="$1"
        ip="$2"
        sentinel_conf_add "sentinel known-replica mymaster $ip $(get_port "$hostname" "REDIS")"
    }

    for node in $(seq 0 $((3-1))); do
        hostname="redis-node-$node"
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
kind: ConfigMap
metadata:
  annotations:
    meta.helm.sh/release-name: redis
    meta.helm.sh/release-namespace: jz-middleware
  creationTimestamp: "2026-02-12T08:16:28Z"
  labels:
    app.kubernetes.io/instance: jz-middleware
    app.kubernetes.io/managed-by: Helm
    app.kubernetes.io/name: redis
    app.kubernetes.io/version: 6.2.20
  name: redis-scripts
  namespace: jz-middleware
  resourceVersion: "79997564"
  uid: 45f2af74-c1bb-4a9d-85a2-34a44602ac9a

---

apiVersion: v1
data:
  redis-password: N3haY3FtdSFjQUNDZWVy
kind: Secret
metadata:
  annotations:
    meta.helm.sh/release-name: redis
    meta.helm.sh/release-namespace: jz-middleware
  creationTimestamp: "2026-02-12T08:16:28Z"
  labels:
    app.kubernetes.io/instance: jz-middleware
    app.kubernetes.io/managed-by: Helm
    app.kubernetes.io/name: redis
    app.kubernetes.io/version: 6.2.20
  name: redis
  namespace: jz-middleware
  resourceVersion: "79997562"
  uid: 681dc20b-682a-46ea-a48d-66e4edd09e4d
type: Opaque

---


apiVersion: apps/v1
kind: StatefulSet
metadata:
  annotations:
    meta.helm.sh/release-name: redis
    meta.helm.sh/release-namespace: jz-middleware
  creationTimestamp: "2026-02-12T08:16:28Z"
  generation: 1
  labels:
    app.kubernetes.io/instance: jz-middleware
    app.kubernetes.io/managed-by: Helm
    app.kubernetes.io/name: redis
    app.kubernetes.io/version: 6.2.20
  name: redis
  namespace: jz-middleware
  resourceVersion: "79998083"
  uid: 60d086f6-9c51-4af6-8b00-3c17090e0dd6
spec:
  persistentVolumeClaimRetentionPolicy:
    whenDeleted: Retain
    whenScaled: Retain
  podManagementPolicy: OrderedReady
  replicas: 3
  revisionHistoryLimit: 10
  selector:
    matchLabels:
      app.kubernetes.io/instance: jz-middleware
      app.kubernetes.io/name: redis
      app.kubernetes.io/version: 6.2.20
  serviceName: redis-headless
  template:
    metadata:
      creationTimestamp: null
      labels:
        app.kubernetes.io/instance: jz-middleware
        app.kubernetes.io/name: redis
        app.kubernetes.io/version: 6.2.20
    spec:
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - podAffinityTerm:
              labelSelector:
                matchLabels:
                  app.kubernetes.io/instance: jz-middleware
                  app.kubernetes.io/name: redis
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
        image: 192.168.252.252:5566/bitnami/redis:6.2.20
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
          seLinuxOptions: {}
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
        image: 192.168.252.252:5566/bitnami/redis-sentinel:6.2.20
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
          seLinuxOptions: {}
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
          name: redis-scripts
        name: start-scripts
      - configMap:
          defaultMode: 493
          name: redis-health
        name: health
      - name: redis-password
        secret:
          defaultMode: 420
          items:
          - key: redis-password
            path: redis-password
          secretName: redis
      - configMap:
          defaultMode: 420
          name: redis-configuration
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
      creationTimestamp: null
      labels:
        app.kubernetes.io/component: node
        app.kubernetes.io/instance: redis
        app.kubernetes.io/name: redis
      name: redis-data
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
status:
  availableReplicas: 3
  collisionCount: 0
  currentReplicas: 3
  currentRevision: redis-85df8d7b5b
  observedGeneration: 1
  readyReplicas: 3
  replicas: 3
  updateRevision: redis-85df8d7b5b
  updatedReplicas: 3`;
