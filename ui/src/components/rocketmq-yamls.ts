// RocketMQ YAML resources - from tmp/rocketmq.yaml
export function generateRocketmqYamls(name: string, namespace: string): string[] {
  const ns = `${name}-0.${name}-headless.${namespace}.svc.cluster.local:9876;${name}-1.${name}-headless.${namespace}.svc.cluster.local:9876`
  const runbrokerSh = `#!/bin/sh
error_exit () { echo "ERROR: $1 !!"; exit 1; }
[ ! -e "$JAVA_HOME/bin/java" ] && JAVA_HOME=$HOME/jdk/java
[ ! -e "$JAVA_HOME/bin/java" ] && JAVA_HOME=/usr/java
[ ! -e "$JAVA_HOME/bin/java" ] && error_exit "Please set JAVA_HOME"
export JAVA_HOME JAVA="$JAVA_HOME/bin/java"
export BASE_DIR=$(dirname $0)/..
export CLASSPATH=.:\${BASE_DIR}/conf:\${CLASSPATH}
JAVA_OPT="\${JAVA_OPT} -server -Xms1500m -Xmx1500m -Xmn800m"
JAVA_OPT="\${JAVA_OPT} -XX:+UseG1GC -XX:MaxDirectMemorySize=15g -cp \${CLASSPATH}"
numactl --interleave=all pwd > /dev/null 2>&1
if [ $? -eq 0 ]; then numactl --interleave=all $JAVA \${JAVA_OPT} $@; else $JAVA \${JAVA_OPT} $@; fi
`
  const initSh = `#!/bin/bash
[ -f "/home/rocketmq/store/broker.conf" ] && rm -f "/home/rocketmq/store/broker.conf"
brokerName=\${BROKER_NAME}
pod_index="\${brokerName: -1}"
cp /opt/scripts/broker-templates.conf /home/rocketmq/store/broker.conf
namesrv=\${NAMESRV_ADDR}
sed -i "s/NAMESRV/\x24namesrv/" /home/rocketmq/store/broker.conf
case "$pod_index" in
0) sed -i 's/BROKERNAME/broker-a/;s/BROKERID/0/;s/BROKERROLE/ASYNC_MASTER/' /home/rocketmq/store/broker.conf ;;
1) sed -i 's/BROKERNAME/broker-a/;s/BROKERID/1/;s/BROKERROLE/SLAVE/' /home/rocketmq/store/broker.conf ;;
2) sed -i 's/BROKERNAME/broker-b/;s/BROKERID/0/;s/BROKERROLE/ASYNC_MASTER/' /home/rocketmq/store/broker.conf ;;
3) sed -i 's/BROKERNAME/broker-b/;s/BROKERID/1/;s/BROKERROLE/SLAVE/' /home/rocketmq/store/broker.conf ;;
esac
`
  const brokerTpl = `deleteWhen=04
fileReservedTime=48
brokerClusterName=DefaultCluster
brokerName=BROKERNAME
brokerId=BROKERID
brokerRole=BROKERROLE
flushDiskType=ASYNC_FLUSH
namesrvAddr=NAMESRV
storePathRootDir=/home/rocketmq/store
storePathCommitLog=/home/rocketmq/store/commitlog
storePathConsumeQueue=/home/rocketmq/store/consumequeue
storePathIndex=/home/rocketmq/store/index
autoCreateTopicEnable=true
`
  const indent = (s: string, n: number) => s.split('\n').map((l) => ' '.repeat(n) + l).join('\n')

  const cm1 = `apiVersion: v1
kind: ConfigMap
metadata:
  name: ${name}
  namespace: ${namespace}
  labels:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: 4.5.0
    app.kubernetes.io/component: rocketmq
data:
  runbroker.sh: |-
${indent(runbrokerSh.trim(), 4)}
  broker-templates.conf: |-
${indent(brokerTpl.trim(), 4)}
  init.sh: |-
${indent(initSh.trim(), 4)}
`
  const cm2 = `apiVersion: v1
kind: ConfigMap
metadata:
  name: ${name}-broker
  namespace: ${namespace}
  labels:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: 4.5.0
    app.kubernetes.io/component: rocketmq
data:
  runbroker.sh: |-
${indent(runbrokerSh.trim(), 4)}
`
  const svcHeadless = `apiVersion: v1
kind: Service
metadata:
  name: ${name}-headless
  namespace: ${namespace}
  labels:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: 4.5.0
    app.kubernetes.io/role: namesrv
    app.kubernetes.io/component: rocketmq
spec:
  clusterIP: None
  clusterIPs:
  - None
  internalTrafficPolicy: Cluster
  ipFamilies:
  - IPv4
  ipFamilyPolicy: SingleStack
  ports:
  - name: tcp-namesrv
    port: 9876
    protocol: TCP
    targetPort: 9876
  publishNotReadyAddresses: true
  selector:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: 4.5.0
    app.kubernetes.io/role: namesrv
  sessionAffinity: None
  type: ClusterIP
`
  const stsNs = `apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: ${name}
  namespace: ${namespace}
  labels:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: 4.5.0
    app.kubernetes.io/role: namesrv
    app.kubernetes.io/component: rocketmq
spec:
  podManagementPolicy: OrderedReady
  replicas: 2
  revisionHistoryLimit: 10
  serviceName: ${name}-headless
  selector:
    matchLabels:
      app.kubernetes.io/instance: ${namespace}
      app.kubernetes.io/name: ${name}
      app.kubernetes.io/version: 4.5.0
      app.kubernetes.io/role: namesrv
  template:
    metadata:
      labels:
        app.kubernetes.io/instance: ${namespace}
        app.kubernetes.io/name: ${name}
        app.kubernetes.io/version: 4.5.0
        app.kubernetes.io/role: namesrv
    spec:
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - podAffinityTerm:
              labelSelector:
                matchLabels:
                  app.kubernetes.io/instance: ${namespace}
                  app.kubernetes.io/name: ${name}
                  app.kubernetes.io/version: 4.5.0
                  app.kubernetes.io/role: namesrv
              topologyKey: kubernetes.io/hostname
            weight: 1
      containers:
      - image: apache/rocketmq:4.5.0
        imagePullPolicy: Always
        name: nameserver
        command: ["sh","mqnamesrv"]
        env:
        - name: JAVA_OPTS
          value: '-Xms1024M -Xmx1024M -Xmn512M'
        ports:
        - containerPort: 9876
          name: main
          protocol: TCP
        resources:
          limits:
            cpu: 500m
            memory: 1Gi
          requests:
            cpu: 250m
            memory: 512Mi
        securityContext: {}
        terminationMessagePath: /dev/termination-log
        terminationMessagePolicy: File
        volumeMounts:
        - mountPath: /home/rocketmq/logs
          name: exchange-namesrv-storage
          subPath: logs
      dnsPolicy: ClusterFirstWithHostNet
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
      name: exchange-namesrv-storage
    spec:
      accessModes:
      - ReadWriteOnce
      resources:
        requests:
          storage: 10Gi
      storageClassName: local
      volumeMode: Filesystem
`
  const stsBroker = `apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: ${name}-broker
  namespace: ${namespace}
  labels:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: 4.5.0
    app.kubernetes.io/role: broker
    app.kubernetes.io/component: rocketmq
spec:
  podManagementPolicy: Parallel
  replicas: 4
  selector:
    matchLabels:
      app.kubernetes.io/instance: ${namespace}
      app.kubernetes.io/name: ${name}
      app.kubernetes.io/version: 4.5.0
      app.kubernetes.io/role: broker
  template:
    metadata:
      labels:
        app.kubernetes.io/instance: ${namespace}
        app.kubernetes.io/name: ${name}
        app.kubernetes.io/version: 4.5.0
        app.kubernetes.io/role: broker
    spec:
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - podAffinityTerm:
              labelSelector:
                matchLabels:
                  app.kubernetes.io/instance: ${namespace}
                  app.kubernetes.io/name: ${name}
                  app.kubernetes.io/version: 4.5.0
                  app.kubernetes.io/role: broker
              topologyKey: kubernetes.io/hostname
            weight: 1
      containers:
      - command: ["sh","mqbroker","-c","/home/rocketmq/store/broker.conf"]
        image: apache/rocketmq:4.5.0
        imagePullPolicy: Always
        name: broker
        ports:
        - containerPort: 10909
          name: vip
          protocol: TCP
        - containerPort: 10911
          name: main
          protocol: TCP
        - containerPort: 10912
          name: ha
          protocol: TCP
        resources:
          limits:
            cpu: 1
            memory: 2Gi
          requests:
            cpu: 1
            memory: 2Gi
        terminationMessagePath: /dev/termination-log
        terminationMessagePolicy: File
        volumeMounts:
        - mountPath: /home/rocketmq/store
          name: data
        - mountPath: /home/rocketmq/logs
          name: logs
        - mountPath: /home/rocketmq/rocketmq-4.5.0/bin/runbroker.sh
          name: broker-config
          readOnly: true
          subPath: runbroker.sh
      initContainers:
      - command: ["bash", "/opt/scripts/init.sh"]
        env:
        - name: BROKER_NAME
          valueFrom:
            fieldRef:
              apiVersion: v1
              fieldPath: metadata.name
        - name: NAMESRV_ADDR
          value: ${ns}
        image: apache/rocketmq:4.5.0
        imagePullPolicy: Always
        name: broker-init
        resources: {}
        volumeMounts:
        - mountPath: /opt/scripts
          name: config
        - mountPath: /home/rocketmq/store
          name: data
      dnsPolicy: ClusterFirst
      restartPolicy: Always
      schedulerName: default-scheduler
      terminationGracePeriodSeconds: 30
      volumes:
      - configMap:
          defaultMode: 420
          name: ${name}
        name: config
      - configMap:
          defaultMode: 420
          items:
          - key: runbroker.sh
            path: runbroker.sh
          name: ${name}-broker
        name: broker-config
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
  - apiVersion: v1
    kind: PersistentVolumeClaim
    metadata:
      name: logs
    spec:
      accessModes:
      - ReadWriteOnce
      resources:
        requests:
          storage: 8Gi
      storageClassName: local
      volumeMode: Filesystem
`
  const svcClusterIp = `apiVersion: v1
kind: Service
metadata:
  name: ${name}
  namespace: ${namespace}
  labels:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: 4.5.0
    app.kubernetes.io/role: namesrv
    app.kubernetes.io/component: rocketmq
spec:
  ipFamilies:
  - IPv4
  ipFamilyPolicy: SingleStack
  ports:
  - port: 9876
    protocol: TCP
    targetPort: 9876
  selector:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: 4.5.0
    app.kubernetes.io/role: namesrv
  sessionAffinity: None
  type: ClusterIP
`
  return [cm1, cm2, svcHeadless, stsNs, stsBroker, svcClusterIp]
}
