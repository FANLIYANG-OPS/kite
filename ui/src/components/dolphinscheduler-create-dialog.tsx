import { useEffect, useState } from 'react'
import { IconLoader2 } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { applyResource, generateDolphinschedulerYamls, useResources } from '@/lib/api'
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

const DEFAULT_NAME = 'dolphinscheduler'
const DEFAULT_NAMESPACE = 'middleware'

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

interface DolphinschedulerCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function DolphinschedulerCreateDialog({
  open,
  onOpenChange,
  onSuccess,
}: DolphinschedulerCreateDialogProps) {
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
      toast.error(
        t('dolphinscheduler.nameInvalid', 'Name must be a valid Kubernetes resource name')
      )
      return
    }
    if (!namespace?.trim()) {
      toast.error(t('dolphinscheduler.namespaceRequired', 'Namespace is required'))
      return
    }

    setIsLoading(true)
    try {
      await ensureNamespace(namespace.trim())
      const { yamls } = await generateDolphinschedulerYamls({
        name: instanceName,
        namespace: namespace.trim(),
      })
      for (const yaml of yamls) {
        await applyResource(yaml.trim())
      }
      toast.success(
        t('dolphinscheduler.createSuccess', 'DolphinScheduler created successfully')
      )
      setName(DEFAULT_NAME)
      setNamespace(DEFAULT_NAMESPACE)
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      console.error('Failed to create DolphinScheduler', err)
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
          <DialogTitle>
            {t('dolphinscheduler.createTitle', 'Create DolphinScheduler')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'dolphinscheduler.createDescription',
              'Create DolphinScheduler Deployment and NodePort Service (from pkg/templates/dolphinscheduler)'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">
              {t('dolphinscheduler.instanceName', 'Instance Name')}
            </Label>
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

