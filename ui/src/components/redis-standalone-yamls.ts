// Redis Standalone YAML resources - from tmp/redisstandalone.yaml
// Each resource uses ${name}, ${namespace}, ${password} for template interpolation

export function generateRedisStandaloneYamls(
  name: string,
  namespace: string,
  password: string
): string[] {
  const redisConfLines = [
    `requirepass ${password}`,
    'bind 0.0.0.0',
    'protected-mode no',
    'acllog-max-len 128',
    'dir  /data',
    'dbfilename dump.rdb',
    'ignore-warnings ARM64-COW-BUG',
  ].join('\n')

  const configMapYaml = `apiVersion: v1
kind: ConfigMap
metadata:
  name: ${name}
  namespace: ${namespace}
  labels:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: 6.2.17
    app.kubernetes.io/component: redis-standalone
data:
  redis.conf: |-
${redisConfLines.split('\n').map((l) => `    ${l}`).join('\n')}
`

  const statefulSetYaml = `apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: ${name}
  namespace: ${namespace}
  labels:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: 6.2.17
    app.kubernetes.io/component: redis-standalone
spec:
  serviceName: ${name}
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/instance: ${namespace}
      app.kubernetes.io/name: ${name}
      app.kubernetes.io/version: 6.2.17
  template:
    metadata:
      labels:
        app.kubernetes.io/instance: ${namespace}
        app.kubernetes.io/name: ${name}
        app.kubernetes.io/version: 6.2.17
    spec:
      volumes:
        - name: host-time
          hostPath:
            path: /etc/localtime
            type: ''
        - name: volume-za30oy
          configMap:
            name: ${name}
            items:
              - key: redis.conf
                path: redis.conf
            defaultMode: 420
      containers:
        - name: container-a30une
          image: library/redis:6.2.20
          command:
            - redis-server
          args:
            - /opt/redis.conf
          ports:
            - name: tcp-0
              containerPort: 6379
              protocol: TCP
          resources:
            limits:
              cpu: '1'
              memory: 2Gi
            requests:
              cpu: 500m
              memory: 1Gi
          volumeMounts:
            - name: host-time
              readOnly: true
              mountPath: /etc/localtime
            - name: volume-za30oy
              readOnly: true
              mountPath: /opt/redis.conf
              subPath: redis.conf
            - name: redis-standalone-data
              mountPath: /data
          terminationMessagePath: /dev/termination-log
          terminationMessagePolicy: File
          imagePullPolicy: Always
      restartPolicy: Always
      terminationGracePeriodSeconds: 30
      dnsPolicy: ClusterFirst
      serviceAccountName: default
      serviceAccount: default
      securityContext: {}
      schedulerName: default-scheduler
  podManagementPolicy: OrderedReady
  updateStrategy:
    type: RollingUpdate
    rollingUpdate:
      partition: 0
  revisionHistoryLimit: 10
  volumeClaimTemplates:
  - apiVersion: v1
    kind: PersistentVolumeClaim
    metadata:
      labels:
        app.kubernetes.io/instance: ${namespace}
        app.kubernetes.io/name: ${name}
        app.kubernetes.io/version: 6.2.17
      name: redis-standalone-data
    spec:
      accessModes:
      - ReadWriteOnce
      resources:
        requests:
          storage: 8Gi
      storageClassName: local
      volumeMode: Filesystem
`

  const serviceYaml = `apiVersion: v1
kind: Service
metadata:
  name: ${name}
  namespace: ${namespace}
  labels:
    app.kubernetes.io/version: 6.2.17
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/managed-by: Helm
    app.kubernetes.io/type: external-service
    app.kubernetes.io/component: redis-standalone
spec:
  ports:
    - name: http-0
      protocol: TCP
      port: 6379
      targetPort: 6379
  selector:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: 6.2.17
  type: ClusterIP
  sessionAffinity: None
  ipFamilies:
    - IPv4
  ipFamilyPolicy: SingleStack
  internalTrafficPolicy: Cluster
`

  return [configMapYaml, statefulSetYaml, serviceYaml]
}
