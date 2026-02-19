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

import { generateRedisStandaloneYamls } from './redis-standalone-yamls'
import { NamespaceSelector } from './selector/namespace-selector'

const DEFAULT_NAME = 'redis-standalone'
const DEFAULT_NAMESPACE = 'middleware'
const DEFAULT_PASSWORD = '7xZcqmu!cACCeer'

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

interface RedisStandaloneCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function RedisStandaloneCreateDialog({
  open,
  onOpenChange,
  onSuccess,
}: RedisStandaloneCreateDialogProps) {
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
      toast.error(
        t('redisStandalone.nameInvalid', 'Name must be a valid Kubernetes resource name')
      )
      return
    }
    if (!namespace?.trim()) {
      toast.error(t('redisStandalone.namespaceRequired', 'Namespace is required'))
      return
    }
    if (!password?.trim()) {
      toast.error(t('redisStandalone.passwordRequired', 'Password is required'))
      return
    }

    setIsLoading(true)
    try {
      await ensureNamespace(namespace.trim())
      const yamls = generateRedisStandaloneYamls(
        instanceName,
        namespace.trim(),
        password.trim()
      )
      for (const yaml of yamls) {
        await applyResource(yaml.trim())
      }
      toast.success(
        t('redisStandalone.createSuccess', 'Redis Standalone created successfully')
      )
      setName(DEFAULT_NAME)
      setNamespace(DEFAULT_NAMESPACE)
      setPassword(DEFAULT_PASSWORD)
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      console.error('Failed to create Redis Standalone', err)
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
          <DialogTitle>
            {t('redisStandalone.createTitle', 'Create Redis Standalone')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'redisStandalone.createDescription',
              'Create a Redis Standalone instance with ConfigMap, StatefulSet and Service'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('redisStandalone.instanceName', 'Instance Name')}</Label>
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
            <Label htmlFor="password">{t('redisStandalone.password', 'Password')}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="********"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
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
