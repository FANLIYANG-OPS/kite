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
import { Label } from '@/components/ui/label'

import { generateDorisOperatorYamls } from './doris-operator-yamls'
import { NamespaceSelector } from './selector/namespace-selector'

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
    if (!msg.includes('AlreadyExists') && !msg.includes('already exists')) throw err
  }
}

interface DorisOperatorInstallDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function DorisOperatorInstallDialog({
  open,
  onOpenChange,
  onSuccess,
}: DorisOperatorInstallDialogProps) {
  const { t } = useTranslation()
  const { data: namespaces } = useResources('namespaces')
  const [namespace, setNamespace] = useState(DEFAULT_NAMESPACE)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (open && namespaces?.length) {
      const nsNames = namespaces.map((n) => n.metadata?.name).filter(Boolean)
      if (!nsNames.includes(DEFAULT_NAMESPACE) && nsNames[0]) {
        setNamespace(nsNames[0])
      }
    }
  }, [open, namespaces])

  const handleInstall = async () => {
    if (!namespace?.trim()) {
      toast.error(t('doris.operator.namespaceRequired', 'Namespace is required'))
      return
    }
    setIsLoading(true)
    try {
      await ensureNamespace(namespace.trim())
      const yamls = generateDorisOperatorYamls(namespace.trim())
      for (const yaml of yamls) {
        await applyResource(yaml.trim())
      }
      toast.success(t('doris.operator.installSuccess', 'Doris Operator installed successfully'))
      setNamespace(DEFAULT_NAMESPACE)
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      console.error('Failed to install Doris Operator', err)
      toast.error(translateError(err, t))
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    setNamespace(DEFAULT_NAMESPACE)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('doris.operator.installTitle', 'Install Doris Operator')}</DialogTitle>
          <DialogDescription>
            {t(
              'doris.operator.installDescription',
              'Install Doris Operator including CRDs, RBAC, ServiceAccount, Webhooks and Deployment'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="namespace">{t('common.namespace')}</Label>
            <div className="w-full max-w-xs">
              <NamespaceSelector
                selectedNamespace={namespace}
                handleNamespaceChange={setNamespace}
                extraOptions={[DEFAULT_NAMESPACE, 'doris-operator']}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleInstall} disabled={isLoading}>
            {isLoading ? (
              <>
                <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('doris.operator.installing', 'Installing...')}
              </>
            ) : (
              t('doris.operator.install', 'Install')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
