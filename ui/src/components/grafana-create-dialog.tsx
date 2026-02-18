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

const DEFAULT_NAME = 'grafana'
const DEFAULT_NAMESPACE = 'middleware'
const GRAFANA_VERSION = '11.3.1'
const DEFAULT_ADMIN_USER = 'admin'
const DEFAULT_ADMIN_PASSWORD = 'xqppkmVpDGjr8o9raW3QLenTC2GD9F4pbPrVq5Ep'

function generateGrafanaYamls(
  name: string,
  namespace: string,
  adminUser: string,
  adminPassword: string
): string[] {
  const adminUserB64 = btoaUtf8(adminUser)
  const adminPasswordB64 = btoaUtf8(adminPassword)

  const configMapYaml = `apiVersion: v1
data:
  grafana.ini: |
    [analytics]
    check_for_updates = true
    [grafana_net]
    url = https://grafana.net
    [log]
    mode = console
    [paths]
    data = /var/lib/grafana/
    logs = /var/log/grafana
    plugins = /var/lib/grafana/plugins
    provisioning = /etc/grafana/provisioning
    [server]
    domain = ''
kind: ConfigMap
metadata:
  labels:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: ${GRAFANA_VERSION}
    app.kubernetes.io/component: grafana
  name: ${name}
  namespace: ${namespace}
`

  const secretYaml = `apiVersion: v1
data:
  admin-password: ${adminPasswordB64}
  admin-user: ${adminUserB64}
  ldap-toml: ""
kind: Secret
metadata:
  labels:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: ${GRAFANA_VERSION}
    app.kubernetes.io/component: grafana
  name: ${name}
  namespace: ${namespace}
type: Opaque
`

  const deploymentYaml = `apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: ${GRAFANA_VERSION}
    app.kubernetes.io/component: grafana
  name: ${name}
  namespace: ${namespace}
spec:
  progressDeadlineSeconds: 600
  replicas: 1
  revisionHistoryLimit: 10
  selector:
    matchLabels:
      app.kubernetes.io/instance: ${namespace}
      app.kubernetes.io/name: ${name}
      app.kubernetes.io/version: ${GRAFANA_VERSION}
  strategy:
    rollingUpdate:
      maxSurge: 25%
      maxUnavailable: 25%
    type: RollingUpdate
  template:
    metadata:
      labels:
        app.kubernetes.io/instance: ${namespace}
        app.kubernetes.io/name: ${name}
        app.kubernetes.io/version: ${GRAFANA_VERSION}
    spec:
      automountServiceAccountToken: true
      containers:
      - env:
        - name: POD_IP
          valueFrom:
            fieldRef:
              apiVersion: v1
              fieldPath: status.podIP
        - name: GF_SECURITY_ADMIN_USER
          valueFrom:
            secretKeyRef:
              key: admin-user
              name: ${name}
        - name: GF_SECURITY_ADMIN_PASSWORD
          valueFrom:
            secretKeyRef:
              key: admin-password
              name: ${name}
        - name: GF_PATHS_DATA
          value: /var/lib/grafana/
        - name: GF_PATHS_LOGS
          value: /var/log/grafana
        - name: GF_PATHS_PLUGINS
          value: /var/lib/grafana/plugins
        - name: GF_PATHS_PROVISIONING
          value: /etc/grafana/provisioning
        image: grafana/grafana:${GRAFANA_VERSION}
        imagePullPolicy: Always
        livenessProbe:
          failureThreshold: 10
          httpGet:
            path: /api/health
            port: 3000
            scheme: HTTP
          initialDelaySeconds: 60
          periodSeconds: 10
          successThreshold: 1
          timeoutSeconds: 30
        name: grafana
        ports:
        - containerPort: 3000
          name: grafana
          protocol: TCP
        - containerPort: 9094
          name: gossip-tcp
          protocol: TCP
        - containerPort: 9094
          name: gossip-udp
          protocol: UDP
        readinessProbe:
          failureThreshold: 3
          httpGet:
            path: /api/health
            port: 3000
            scheme: HTTP
          periodSeconds: 10
          successThreshold: 1
          timeoutSeconds: 1
        resources:
          limits:
            cpu: 1000m
            memory: 2Gi
          requests:
            cpu: 100m
            memory: 1Gi
        securityContext:
          allowPrivilegeEscalation: false
          capabilities:
            drop:
            - ALL
          seccompProfile:
            type: RuntimeDefault
        terminationMessagePath: /dev/termination-log
        terminationMessagePolicy: File
        volumeMounts:
        - mountPath: /etc/grafana/grafana.ini
          name: config
          subPath: grafana.ini
        - mountPath: /var/lib/grafana
          name: storage
      dnsPolicy: ClusterFirst
      enableServiceLinks: true
      restartPolicy: Always
      schedulerName: default-scheduler
      securityContext:
        fsGroup: 472
        runAsGroup: 472
        runAsNonRoot: true
        runAsUser: 472
      terminationGracePeriodSeconds: 30
      volumes:
      - configMap:
          defaultMode: 420
          name: ${name}
        name: config
      - emptyDir: {}
        name: storage
`

  const serviceYaml = `apiVersion: v1
kind: Service
metadata:
  labels:
    app.kubernetes.io/version: ${GRAFANA_VERSION}
    app.kubernetes.io/instance: ${name}
    app.kubernetes.io/managed-by: Helm
    app.kubernetes.io/type: external-service
    app.kubernetes.io/component: grafana
  name: ${name}
  namespace: ${namespace}
spec:
  ipFamilies:
  - IPv4
  ipFamilyPolicy: SingleStack
  ports:
  - name: service
    port: 80
    protocol: TCP
    targetPort: 3000
  selector:
    app.kubernetes.io/instance: ${namespace}
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/version: ${GRAFANA_VERSION}
  sessionAffinity: None
  type: ClusterIP
`

  return [configMapYaml, secretYaml, deploymentYaml, serviceYaml]
}

async function ensureNamespace(namespace: string): Promise<void> {
  const nsYaml = `apiVersion: v1
kind: Namespace
metadata:
  name: ${namespace}
`
  try {
    await applyResource(nsYaml.trim())
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes('AlreadyExists') && !msg.includes('already exists')) {
      throw err
    }
  }
}

async function applyMultiYaml(yamls: string[]): Promise<void> {
  for (const yaml of yamls) {
    await applyResource(yaml.trim())
  }
}

interface GrafanaCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function GrafanaCreateDialog({
  open,
  onOpenChange,
  onSuccess,
}: GrafanaCreateDialogProps) {
  const { t } = useTranslation()
  const { data: namespaces } = useResources('namespaces')
  const [name, setName] = useState(DEFAULT_NAME)
  const [namespace, setNamespace] = useState(DEFAULT_NAMESPACE)
  const [adminUser, setAdminUser] = useState(DEFAULT_ADMIN_USER)
  const [adminPassword, setAdminPassword] = useState(DEFAULT_ADMIN_PASSWORD)
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
      toast.error(t('grafana.nameInvalid', 'Name must be a valid Kubernetes resource name'))
      return
    }
    if (!namespace?.trim()) {
      toast.error(t('grafana.namespaceRequired', 'Namespace is required'))
      return
    }
    if (!adminUser?.trim()) {
      toast.error(t('grafana.adminUserRequired', 'Admin username is required'))
      return
    }
    if (!adminPassword?.trim()) {
      toast.error(t('grafana.adminPasswordRequired', 'Admin password is required'))
      return
    }

    setIsLoading(true)
    try {
      await ensureNamespace(namespace.trim())
      const yamls = generateGrafanaYamls(
        instanceName,
        namespace.trim(),
        adminUser.trim(),
        adminPassword.trim()
      )
      await applyMultiYaml(yamls)
      toast.success(t('grafana.createSuccess', 'Grafana created successfully'))
      setName(DEFAULT_NAME)
      setNamespace(DEFAULT_NAMESPACE)
      setAdminUser(DEFAULT_ADMIN_USER)
      setAdminPassword(DEFAULT_ADMIN_PASSWORD)
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      console.error('Failed to create Grafana', err)
      toast.error(translateError(err, t))
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    setName(DEFAULT_NAME)
    setNamespace(DEFAULT_NAMESPACE)
    setAdminUser(DEFAULT_ADMIN_USER)
    setAdminPassword(DEFAULT_ADMIN_PASSWORD)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('grafana.createTitle', 'Create Grafana')}</DialogTitle>
          <DialogDescription>
            {t(
              'grafana.createDescription',
              'Create a Grafana instance with ConfigMap, Secret, Deployment and Service'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('grafana.instanceName', 'Instance Name')}</Label>
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
                extraOptions={[DEFAULT_NAMESPACE]}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="adminUser">{t('grafana.adminUser', 'Admin Username')}</Label>
            <Input
              id="adminUser"
              value={adminUser}
              onChange={(e) => setAdminUser(e.target.value)}
              placeholder={DEFAULT_ADMIN_USER}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="adminPassword">{t('grafana.adminPassword', 'Admin Password')}</Label>
            <Input
              id="adminPassword"
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="********"
            />
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
