// Metrics YAML resources - from tmp/metrics.yaml (tmp/redis.yaml)
// Each resource is a separate variable, use ${namespace} for template interpolation

export function generateMetricsYamls(namespace: string): string[] {
  const namespaceYaml = `apiVersion: v1
kind: Namespace
metadata:
  name: ${namespace}
`

  const serviceAccountYaml = `apiVersion: v1
kind: ServiceAccount
metadata:
  labels:
    app.kubernetes.io/component: server
    app.kubernetes.io/instance: prometheus
    app.kubernetes.io/name: prometheus
    app.kubernetes.io/version: v3.7.3
  name: metrics-server
  namespace: ${namespace}
`

  const clusterRoleBindingYaml = `apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: metrics-server:cluster-admins
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cluster-admin
subjects:
- kind: ServiceAccount
  name: metrics-server
  namespace: ${namespace}
`

  const kubeStateMetricsServiceYaml = `apiVersion: v1
kind: Service
metadata:
  labels:
    k8s-app: kube-state-metrics
    app.kubernetes.io/instance: metrics
    app.kubernetes.io/managed-by: Helm
  name: kube-state-metrics
  namespace: ${namespace}
spec:
  ports:
  - name: http-metrics
    port: 8080
    targetPort: http-metrics
  - name: telemetry
    port: 8081
    targetPort: telemetry
  selector:
    k8s-app: kube-state-metrics
`

  const kubeStateMetricsDeploymentYaml = `apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    k8s-app: kube-state-metrics
  name: kube-state-metrics
  namespace: ${namespace}
spec:
  replicas: 1
  selector:
    matchLabels:
      k8s-app: kube-state-metrics
  template:
    metadata:
      labels:
        k8s-app: kube-state-metrics
    spec:
      automountServiceAccountToken: true
      containers:
      - image: kube-state-metrics/kube-state-metrics:v2.17.0
        imagePullPolicy: Always
        livenessProbe:
          httpGet:
            path: /livez
            port: http-metrics
          initialDelaySeconds: 5
          timeoutSeconds: 5
        name: kube-state-metrics
        args:
          - "--resources=daemonsets,nodes,statefulsets,pods,deployments"
        ports:
        - containerPort: 8080
          name: http-metrics
        - containerPort: 8081
          name: telemetry
        readinessProbe:
          httpGet:
            path: /readyz
            port: telemetry
          initialDelaySeconds: 5
          timeoutSeconds: 5
        securityContext:
          allowPrivilegeEscalation: false
          capabilities:
            drop:
            - ALL
          readOnlyRootFilesystem: true
          runAsNonRoot: true
          runAsUser: 65534
          seccompProfile:
            type: RuntimeDefault
      nodeSelector:
        kubernetes.io/os: linux
      serviceAccountName: metrics-server
`

  const metricsServerServiceYaml = `apiVersion: v1
kind: Service
metadata:
  labels:
    k8s-app: kube-metrics-server
    app.kubernetes.io/instance: metrics
    app.kubernetes.io/managed-by: Helm
  name: metrics-server
  namespace: ${namespace}
spec:
  ports:
  - appProtocol: https
    name: https
    port: 443
    protocol: TCP
    targetPort: https
  selector:
    k8s-app: kube-metrics-server
`

  const metricsServerDeploymentYaml = `apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    k8s-app: kube-metrics-server
  name: kube-metrics-server
  namespace: ${namespace}
spec:
  selector:
    matchLabels:
      k8s-app: kube-metrics-server
  strategy:
    rollingUpdate:
      maxUnavailable: 0
  template:
    metadata:
      labels:
        k8s-app: kube-metrics-server
    spec:
      containers:
      - args:
        - --cert-dir=/tmp
        - --secure-port=10250
        - --kubelet-preferred-address-types=InternalIP,ExternalIP,Hostname
        - --kubelet-use-node-status-port
        - --metric-resolution=15s
        - --kubelet-insecure-tls
        image: metrics-server/metrics-server:v0.8.0
        imagePullPolicy: Always
        livenessProbe:
          failureThreshold: 3
          httpGet:
            path: /livez
            port: https
            scheme: HTTPS
          periodSeconds: 10
        name: metrics-server
        ports:
        - containerPort: 10250
          name: https
          protocol: TCP
        readinessProbe:
          failureThreshold: 3
          httpGet:
            path: /readyz
            port: https
            scheme: HTTPS
          initialDelaySeconds: 20
          periodSeconds: 10
        resources:
          requests:
            cpu: 100m
            memory: 200Mi
        securityContext:
          allowPrivilegeEscalation: false
          capabilities:
            drop:
            - ALL
          readOnlyRootFilesystem: true
          runAsNonRoot: true
          runAsUser: 1000
          seccompProfile:
            type: RuntimeDefault
        volumeMounts:
        - mountPath: /tmp
          name: tmp-dir
      nodeSelector:
        kubernetes.io/os: linux
      priorityClassName: system-cluster-critical
      serviceAccountName: metrics-server
      volumes:
      - emptyDir: {}
        name: tmp-dir
`

  const apiServiceYaml = `apiVersion: apiregistration.k8s.io/v1
kind: APIService
metadata:
  labels:
    k8s-app: metrics-server
  name: v1beta1.metrics.k8s.io
spec:
  group: metrics.k8s.io
  groupPriorityMinimum: 100
  insecureSkipTLSVerify: true
  service:
    name: metrics-server
    namespace: ${namespace}
  version: v1beta1
  versionPriority: 100
`

  const nodeExporterDaemonSetYaml = `apiVersion: apps/v1
kind: DaemonSet
metadata:
  labels:
    k8s-app: kube-node-exporter
  name: kube-node-exporter
  namespace: ${namespace}
spec:
  revisionHistoryLimit: 10
  selector:
    matchLabels:
      k8s-app: kube-node-exporter
  template:
    metadata:
      labels:
        k8s-app: kube-node-exporter
    spec:
      automountServiceAccountToken: false
      containers:
      - args:
        - --path.procfs=/host/proc
        - --path.sysfs=/host/sys
        - --path.rootfs=/host/root
        - --path.udev.data=/host/root/run/udev/data
        - --web.listen-address=[\${HOST_IP}]:9100
        env:
        - name: HOST_IP
          value: "0.0.0.0"
        image: prometheus/node-exporter:v1.10.2
        imagePullPolicy: Always
        livenessProbe:
          failureThreshold: 3
          httpGet:
            path: /
            port: metrics
            scheme: HTTP
          periodSeconds: 10
          successThreshold: 1
          timeoutSeconds: 1
        name: node-exporter
        ports:
        - containerPort: 9100
          name: metrics
          protocol: TCP
        readinessProbe:
          failureThreshold: 3
          httpGet:
            path: /
            port: metrics
            scheme: HTTP
          periodSeconds: 10
          successThreshold: 1
          timeoutSeconds: 1
        resources: {}
        securityContext:
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: true
        terminationMessagePath: /dev/termination-log
        terminationMessagePolicy: File
        volumeMounts:
        - mountPath: /host/proc
          name: proc
          readOnly: true
        - mountPath: /host/sys
          name: sys
          readOnly: true
        - mountPath: /host/root
          mountPropagation: HostToContainer
          name: root
          readOnly: true
      dnsPolicy: ClusterFirst
      hostNetwork: true
      hostPID: true
      nodeSelector:
        kubernetes.io/os: linux
      restartPolicy: Always
      schedulerName: default-scheduler
      securityContext:
        fsGroup: 65534
        runAsGroup: 65534
        runAsNonRoot: true
        runAsUser: 65534
      serviceAccountName: metrics-server
      terminationGracePeriodSeconds: 30
      tolerations:
      - effect: NoSchedule
        operator: Exists
      volumes:
      - hostPath:
          path: /proc
          type: ""
        name: proc
      - hostPath:
          path: /sys
          type: ""
        name: sys
      - hostPath:
          path: /
          type: ""
        name: root
  updateStrategy:
    rollingUpdate:
      maxSurge: 0
      maxUnavailable: 1
    type: RollingUpdate
`

  const nodeExporterServiceYaml = `apiVersion: v1
kind: Service
metadata:
  labels:
    k8s-app: kube-node-exporter
    app.kubernetes.io/instance: metrics
    app.kubernetes.io/managed-by: Helm
  name: node-exporter
  namespace: ${namespace}
spec:
  internalTrafficPolicy: Cluster
  ipFamilies:
  - IPv4
  ipFamilyPolicy: SingleStack
  ports:
  - name: metrics
    port: 9100
    protocol: TCP
    targetPort: 9100
  selector:
    k8s-app: kube-node-exporter
  sessionAffinity: None
  type: ClusterIP
`

  const prometheusDeploymentYaml = `apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    k8s-app: kube-prometheus-server
  name: kube-prometheus-server
  namespace: ${namespace}
spec:
  replicas: 1
  selector:
    matchLabels:
      k8s-app: kube-prometheus-server
  strategy:
    type: Recreate
  template:
    metadata:
      labels:
        k8s-app: kube-prometheus-server
    spec:
      containers:
      - args:
        - --watched-dir=/etc/config
        - --listen-address=0.0.0.0:8080
        - --reload-url=http://127.0.0.1:9090/-/reload
        image: prometheus-operator/prometheus-config-reloader:v0.87.0
        imagePullPolicy: IfNotPresent
        livenessProbe:
          failureThreshold: 3
          httpGet:
            path: /healthz
            port: metrics
            scheme: HTTP
          initialDelaySeconds: 2
          periodSeconds: 10
          successThreshold: 1
          timeoutSeconds: 1
        name: prometheus-server-configmap-reload
        ports:
        - containerPort: 8080
          name: metrics
          protocol: TCP
        readinessProbe:
          failureThreshold: 3
          httpGet:
            path: /healthz
            port: metrics
            scheme: HTTP
          periodSeconds: 10
          successThreshold: 1
          timeoutSeconds: 1
        resources: {}
        terminationMessagePath: /dev/termination-log
        terminationMessagePolicy: File
        volumeMounts:
        - mountPath: /etc/config
          name: config-volume
          readOnly: true
      - args:
        - --storage.tsdb.retention.time=15d
        - --config.file=/etc/config/prometheus.yml
        - --storage.tsdb.path=/data
        - --web.console.libraries=/etc/prometheus/console_libraries
        - --web.console.templates=/etc/prometheus/consoles
        - --web.enable-lifecycle
        image: prometheus/prometheus:v3.7.3
        imagePullPolicy: Always
        livenessProbe:
          failureThreshold: 3
          httpGet:
            path: /-/healthy
            port: 9090
            scheme: HTTP
          initialDelaySeconds: 30
          periodSeconds: 15
          successThreshold: 1
          timeoutSeconds: 10
        name: prometheus-server
        ports:
        - containerPort: 9090
          protocol: TCP
        readinessProbe:
          failureThreshold: 3
          httpGet:
            path: /-/ready
            port: 9090
            scheme: HTTP
          initialDelaySeconds: 30
          periodSeconds: 5
          successThreshold: 1
          timeoutSeconds: 4
        resources: {}
        terminationMessagePath: /dev/termination-log
        terminationMessagePolicy: File
        volumeMounts:
        - mountPath: /etc/config
          name: config-volume
        - mountPath: /data
          name: storage-volume
      dnsPolicy: ClusterFirst
      enableServiceLinks: true
      restartPolicy: Always
      schedulerName: default-scheduler
      securityContext:
        fsGroup: 65534
        runAsGroup: 65534
        runAsNonRoot: true
        runAsUser: 65534
      serviceAccountName: metrics-server
      terminationGracePeriodSeconds: 300
      volumes:
      - configMap:
          defaultMode: 420
          name: prometheus-server
        name: config-volume
      - name: storage-volume
        persistentVolumeClaim:
          claimName: prometheus-server
`

  const prometheusConfigMapYaml = `apiVersion: v1
data:
  alerting_rules.yml: |
    {}
  alerts: |
    {}
  allow-snippet-annotations: "false"
  prometheus.yml: |
    global:
      evaluation_interval: 1m
      scrape_interval: 1m
      scrape_timeout: 10s
    rule_files:
    - /etc/config/recording_rules.yml
    - /etc/config/alerting_rules.yml
    - /etc/config/rules
    - /etc/config/alerts
    scrape_configs:
    - job_name: kube-state-metrics
      static_configs:
      - targets:
        - kube-state-metrics.${namespace}.svc.cluster.local:8080
    - job_name: prometheus
      static_configs:
      - targets:
        - localhost:9090
    - bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token
      job_name: kubernetes-apiservers
      kubernetes_sd_configs:
      - role: endpoints
      relabel_configs:
      - action: keep
        regex: default;kubernetes;https
        source_labels:
        - __meta_kubernetes_namespace
        - __meta_kubernetes_service_name
        - __meta_kubernetes_endpoint_port_name
      scheme: https
      tls_config:
        ca_file: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
    - bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token
      job_name: kubernetes-nodes
      kubernetes_sd_configs:
      - role: node
      relabel_configs:
      - action: labelmap
        regex: __meta_kubernetes_node_label_(.+)
      - replacement: kubernetes.default.svc:443
        target_label: __address__
      - regex: (.+)
        replacement: /api/v1/nodes/$1/proxy/metrics
        source_labels:
        - __meta_kubernetes_node_name
        target_label: __metrics_path__
      scheme: https
      tls_config:
        ca_file: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
    - bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token
      job_name: kubernetes-nodes-cadvisor
      kubernetes_sd_configs:
      - role: node
      relabel_configs:
      - action: labelmap
        regex: __meta_kubernetes_node_label_(.+)
      - replacement: kubernetes.default.svc:443
        target_label: __address__
      - regex: (.+)
        replacement: /api/v1/nodes/$1/proxy/metrics/cadvisor
        source_labels:
        - __meta_kubernetes_node_name
        target_label: __metrics_path__
      scheme: https
      tls_config:
        ca_file: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
    - honor_labels: true
      job_name: kubernetes-service-endpoints
      kubernetes_sd_configs:
      - role: endpoints
      relabel_configs:
      - action: keep
        regex: true
        source_labels:
        - __meta_kubernetes_service_annotation_prometheus_io_scrape
      - action: drop
        regex: true
        source_labels:
        - __meta_kubernetes_service_annotation_prometheus_io_scrape_slow
      - action: replace
        regex: (https?)
        source_labels:
        - __meta_kubernetes_service_annotation_prometheus_io_scheme
        target_label: __scheme__
      - action: replace
        regex: (.+)
        source_labels:
        - __meta_kubernetes_service_annotation_prometheus_io_path
        target_label: __metrics_path__
      - action: replace
        regex: (.+?)(?::\\d+)?;(\\d+)
        replacement: $1:$2
        source_labels:
        - __address__
        - __meta_kubernetes_service_annotation_prometheus_io_port
        target_label: __address__
      - action: labelmap
        regex: __meta_kubernetes_service_annotation_prometheus_io_param_(.+)
        replacement: __param_$1
      - action: labelmap
        regex: __meta_kubernetes_service_label_(.+)
      - action: replace
        source_labels:
        - __meta_kubernetes_namespace
        target_label: namespace
      - action: replace
        source_labels:
        - __meta_kubernetes_service_name
        target_label: service
      - action: replace
        source_labels:
        - __meta_kubernetes_pod_node_name
        target_label: node
    - honor_labels: true
      job_name: kubernetes-service-endpoints-slow
      kubernetes_sd_configs:
      - role: endpoints
      relabel_configs:
      - action: keep
        regex: true
        source_labels:
        - __meta_kubernetes_service_annotation_prometheus_io_scrape_slow
      - action: replace
        regex: (https?)
        source_labels:
        - __meta_kubernetes_service_annotation_prometheus_io_scheme
        target_label: __scheme__
      - action: replace
        regex: (.+)
        source_labels:
        - __meta_kubernetes_service_annotation_prometheus_io_path
        target_label: __metrics_path__
      - action: replace
        regex: (.+?)(?::\\d+)?;(\\d+)
        replacement: $1:$2
        source_labels:
        - __address__
        - __meta_kubernetes_service_annotation_prometheus_io_port
        target_label: __address__
      - action: labelmap
        regex: __meta_kubernetes_service_annotation_prometheus_io_param_(.+)
        replacement: __param_$1
      - action: labelmap
        regex: __meta_kubernetes_service_label_(.+)
      - action: replace
        source_labels:
        - __meta_kubernetes_namespace
        target_label: namespace
      - action: replace
        source_labels:
        - __meta_kubernetes_service_name
        target_label: service
      - action: replace
        source_labels:
        - __meta_kubernetes_pod_node_name
        target_label: node
      scrape_interval: 5m
      scrape_timeout: 30s
    - honor_labels: true
      job_name: prometheus-pushgateway
      kubernetes_sd_configs:
      - role: service
      relabel_configs:
      - action: keep
        regex: pushgateway
        source_labels:
        - __meta_kubernetes_service_annotation_prometheus_io_probe
    - honor_labels: true
      job_name: kubernetes-services
      kubernetes_sd_configs:
      - role: service
      metrics_path: /probe
      params:
        module:
        - http_2xx
      relabel_configs:
      - action: keep
        regex: true
        source_labels:
        - __meta_kubernetes_service_annotation_prometheus_io_probe
      - source_labels:
        - __address__
        target_label: __param_target
      - replacement: blackbox
        target_label: __address__
      - source_labels:
        - __param_target
        target_label: instance
      - action: labelmap
        regex: __meta_kubernetes_service_label_(.+)
      - source_labels:
        - __meta_kubernetes_namespace
        target_label: namespace
      - source_labels:
        - __meta_kubernetes_service_name
        target_label: service
    - honor_labels: true
      job_name: kubernetes-pods
      kubernetes_sd_configs:
      - role: pod
      relabel_configs:
      - action: keep
        regex: true
        source_labels:
        - __meta_kubernetes_pod_annotation_prometheus_io_scrape
      - action: drop
        regex: true
        source_labels:
        - __meta_kubernetes_pod_annotation_prometheus_io_scrape_slow
      - action: replace
        regex: (https?)
        source_labels:
        - __meta_kubernetes_pod_annotation_prometheus_io_scheme
        target_label: __scheme__
      - action: replace
        regex: (.+)
        source_labels:
        - __meta_kubernetes_pod_annotation_prometheus_io_path
        target_label: __metrics_path__
      - action: replace
        regex: (\\d+);(([A-Fa-f0-9]{1,4}::?){1,7}[A-Fa-f0-9]{1,4})
        replacement: '[$2]:$1'
        source_labels:
        - __meta_kubernetes_pod_annotation_prometheus_io_port
        - __meta_kubernetes_pod_ip
        target_label: __address__
      - action: replace
        regex: (\\d+);((([0-9]+?)(\\.|$)){4})
        replacement: $2:$1
        source_labels:
        - __meta_kubernetes_pod_annotation_prometheus_io_port
        - __meta_kubernetes_pod_ip
        target_label: __address__
      - action: labelmap
        regex: __meta_kubernetes_pod_annotation_prometheus_io_param_(.+)
        replacement: __param_$1
      - action: labelmap
        regex: __meta_kubernetes_pod_label_(.+)
      - action: replace
        source_labels:
        - __meta_kubernetes_namespace
        target_label: namespace
      - action: replace
        source_labels:
        - __meta_kubernetes_pod_name
        target_label: pod
      - action: drop
        regex: Pending|Succeeded|Failed|Completed
        source_labels:
        - __meta_kubernetes_pod_phase
      - action: replace
        source_labels:
        - __meta_kubernetes_pod_node_name
        target_label: node
    - honor_labels: true
      job_name: kubernetes-pods-slow
      kubernetes_sd_configs:
      - role: pod
      relabel_configs:
      - action: keep
        regex: true
        source_labels:
        - __meta_kubernetes_pod_annotation_prometheus_io_scrape_slow
      - action: replace
        regex: (https?)
        source_labels:
        - __meta_kubernetes_pod_annotation_prometheus_io_scheme
        target_label: __scheme__
      - action: replace
        regex: (.+)
        source_labels:
        - __meta_kubernetes_pod_annotation_prometheus_io_path
        target_label: __metrics_path__
      - action: replace
        regex: (\\d+);(([A-Fa-f0-9]{1,4}::?){1,7}[A-Fa-f0-9]{1,4})
        replacement: '[$2]:$1'
        source_labels:
        - __meta_kubernetes_pod_annotation_prometheus_io_port
        - __meta_kubernetes_pod_ip
        target_label: __address__
      - action: replace
        regex: (\\d+);((([0-9]+?)(\\.|$)){4})
        replacement: $2:$1
        source_labels:
        - __meta_kubernetes_pod_annotation_prometheus_io_port
        - __meta_kubernetes_pod_ip
        target_label: __address__
      - action: labelmap
        regex: __meta_kubernetes_pod_annotation_prometheus_io_param_(.+)
        replacement: __param_$1
      - action: labelmap
        regex: __meta_kubernetes_pod_label_(.+)
      - action: replace
        source_labels:
        - __meta_kubernetes_namespace
        target_label: namespace
      - action: replace
        source_labels:
        - __meta_kubernetes_pod_name
        target_label: pod
      - action: drop
        regex: Pending|Succeeded|Failed|Completed
        source_labels:
        - __meta_kubernetes_pod_phase
      - action: replace
        source_labels:
        - __meta_kubernetes_pod_node_name
        target_label: node
      scrape_interval: 5m
      scrape_timeout: 30s
  recording_rules.yml: |
    {}
  rules: |
    {}
kind: ConfigMap
metadata:
  labels:
    k8s-app: kube-prometheus-server
  name: prometheus-server
  namespace: ${namespace}
`

  const prometheusPvcYaml = `apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  labels:
    app.kubernetes.io/component: server
    app.kubernetes.io/instance: prometheus
    app.kubernetes.io/name: prometheus
  name: prometheus-server
  namespace: ${namespace}
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 8Gi
  storageClassName: local
  volumeMode: Filesystem
`

  const prometheusServiceYaml = `apiVersion: v1
kind: Service
metadata:
  labels:
    k8s-app: kube-prometheus-server
    app.kubernetes.io/instance: metrics
    app.kubernetes.io/managed-by: Helm
    app.kubernetes.io/type: external-service
  name: prometheus-server
  namespace: ${namespace}
spec:
  internalTrafficPolicy: Cluster
  ipFamilies:
  - IPv4
  ipFamilyPolicy: SingleStack
  ports:
  - name: http
    port: 80
    protocol: TCP
    targetPort: 9090
  selector:
    k8s-app: kube-prometheus-server
  sessionAffinity: None
  type: ClusterIP
`

  return [
    namespaceYaml,
    serviceAccountYaml,
    clusterRoleBindingYaml,
    kubeStateMetricsServiceYaml,
    kubeStateMetricsDeploymentYaml,
    metricsServerServiceYaml,
    metricsServerDeploymentYaml,
    apiServiceYaml,
    nodeExporterDaemonSetYaml,
    nodeExporterServiceYaml,
    prometheusConfigMapYaml,
    prometheusPvcYaml,
    prometheusDeploymentYaml,
    prometheusServiceYaml,
  ]
}

