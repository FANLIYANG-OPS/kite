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

// Template from tmp/redis.yaml; sync with: make sync-redis-template
import redisTemplate from '@/templates/redis.yaml?raw'
import { NamespaceSelector } from './selector/namespace-selector'

const DEFAULT_NAME = 'redis'
const DEFAULT_NAMESPACE = 'middleware'
const DEFAULT_PASSWORD = '7xZcqmu!cACCeer'

function stripRuntimeFields(yaml: string): string {
  return yaml
    .replace(/\n  creationTimestamp: "[^"]*"/g, '')
    .replace(/\n  resourceVersion: "[^"]*"/g, '')
    .replace(/\n  uid: [a-f0-9-]+/g, '')
    .replace(/\n  generation: \d+/g, '')
    .replace(/\nstatus:\s*\n(?:  [^\n]*\n)*/g, '')
    .replace(/\n  clusterIP: [\d.]+\n/g, '\n')
    .replace(/\n  clusterIPs:\s*\n(?:  - [^\n]+\n)+/g, '\n')
}

function generateRedisYamls(
  name: string,
  namespace: string,
  password: string
): string[] {
  const headlessSvc = `${name}-headless.${namespace}.svc.cluster.local`
  const redisSvc = `${name}.${namespace}.svc.cluster.local`
  const sentinelMonitor = `${name}-0.${headlessSvc}`
  const passwordB64 = btoaUtf8(password)

  let template = redisTemplate

  // Replace in order (longer strings first)
  template = template.replace(
    /redis-0\.redis-headless\.jz-middleware\.svc\.cluster\.local/g,
    sentinelMonitor
  )
  template = template.replace(
    /redis-headless\.jz-middleware\.svc\.cluster\.local/g,
    headlessSvc
  )
  template = template.replace(
    /redis\.jz-middleware\.svc\.cluster\.local/g,
    redisSvc
  )
  template = template.replace(
    /hostname="redis-node-\$node"/g,
    `hostname="${name}-$node"`
  )
  template = template.replace(/get_port "redis"/g, `get_port "${name}"`)
  template = template.replace(
    /redis-password: N3haY3FtdSFjQUNDZWVy/g,
    `redis-password: ${passwordB64}`
  )
  template = template.replace(/\bjz-middleware\b/g, namespace)
  template = template.replace(
    /name: redis-headless(\s|$)/g,
    `name: ${name}-headless$1`
  )
  template = template.replace(
    /name: redis-configuration(\s|$)/g,
    `name: ${name}-configuration$1`
  )
  template = template.replace(
    /name: redis-health(\s|$)/g,
    `name: ${name}-health$1`
  )
  template = template.replace(
    /name: redis-scripts(\s|$)/g,
    `name: ${name}-scripts$1`
  )
  template = template.replace(
    /name: redis-data(\s|$)/g,
    `name: ${name}-data$1`
  )
  template = template.replace(/secretName: redis(\s|$)/g, `secretName: ${name}$1`)
  template = template.replace(
    /serviceName: redis-headless(\s|$)/g,
    `serviceName: ${name}-headless$1`
  )
  template = template.replace(/(^|\s)name: redis(\s|$)/gm, `$1name: ${name}$2`)
  template = template.replace(
    /app\.kubernetes\.io\/instance: redis(\s|$)/g,
    `app.kubernetes.io/instance: ${namespace}$1`
  )

  template = stripRuntimeFields(template)

  const docs = template
    .split(/\n---\s*\n/)
    .map((d) => d.trim())
    .filter(Boolean)

  return docs
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

interface RedisCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function RedisCreateDialog({
  open,
  onOpenChange,
  onSuccess,
}: RedisCreateDialogProps) {
  const { t } = useTranslation()
  const { data: namespaces } = useResources('namespaces')
  const [name, setName] = useState(DEFAULT_NAME)
  const [namespace, setNamespace] = useState(DEFAULT_NAMESPACE)
  const [password, setPassword] = useState(DEFAULT_PASSWORD)
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
      toast.error(t('redis.nameInvalid', 'Name must be a valid Kubernetes resource name'))
      return
    }
    if (!namespace?.trim()) {
      toast.error(t('redis.namespaceRequired', 'Namespace is required'))
      return
    }
    if (!password?.trim()) {
      toast.error(t('redis.passwordRequired', 'Password is required'))
      return
    }

    setIsLoading(true)
    try {
      const yamls = generateRedisYamls(
        instanceName,
        namespace.trim(),
        password.trim()
      )
      const withNs = applyWithNamespace(namespace.trim(), yamls)
      await applyMultiYaml(withNs)
      toast.success(t('redis.createSuccess', 'Redis created successfully'))
      setName(DEFAULT_NAME)
      setNamespace(DEFAULT_NAMESPACE)
      setPassword(DEFAULT_PASSWORD)
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      console.error('Failed to create Redis', err)
      toast.error(translateError(err, t))
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    setName(DEFAULT_NAME)
    setNamespace(DEFAULT_NAMESPACE)
    setPassword(DEFAULT_PASSWORD)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('redis.createTitle', 'Create Redis')}</DialogTitle>
          <DialogDescription>
            {t('redis.createDescription', 'Create Redis Sentinel cluster (from tmp/redis.yaml template)')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('redis.instanceName', 'Instance Name')}</Label>
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
            <Label htmlFor="password">{t('redis.password', 'Password')}</Label>
            <Input
              id="password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={DEFAULT_PASSWORD}
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
