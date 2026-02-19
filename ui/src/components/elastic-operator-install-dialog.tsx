import { useEffect, useState } from 'react'
import { IconLoader2 } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { applyResource, generateElasticOperatorYamls, useResources } from '@/lib/api'
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

const DEFAULT_NAME = 'elastic'
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

interface ElasticOperatorInstallDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function ElasticOperatorInstallDialog({
  open,
  onOpenChange,
  onSuccess,
}: ElasticOperatorInstallDialogProps) {
  const { t } = useTranslation()
  const { data: namespaces } = useResources('namespaces')
  const [name, setName] = useState(DEFAULT_NAME)
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
    const instanceName = name.trim() || DEFAULT_NAME
    if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(instanceName)) {
      toast.error(
        t('elasticOperator.nameInvalid', 'Name must be a valid Kubernetes resource name')
      )
      return
    }
    if (!namespace?.trim()) {
      toast.error(t('elasticOperator.namespaceRequired', 'Namespace is required'))
      return
    }
    setIsLoading(true)
    try {
      await ensureNamespace(namespace.trim())
      const { yamls } = await generateElasticOperatorYamls({
        name: instanceName,
        namespace: namespace.trim(),
      })
      for (const yaml of yamls) {
        await applyResource(yaml.trim())
      }
      toast.success(
        t('elasticOperator.installSuccess', 'Elastic Operator installed successfully')
      )
      setName(DEFAULT_NAME)
      setNamespace(DEFAULT_NAMESPACE)
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      console.error('Failed to install Elastic Operator', err)
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
            {t('elasticOperator.installTitle', 'Install Elastic Operator')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'elasticOperator.installDescription',
              'Install ECK Operator (CRDs + StatefulSet, RBAC, Webhooks). If CRDs already exist, they will be updated.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('elasticOperator.instanceName', 'Instance Name')}</Label>
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleInstall} disabled={isLoading}>
            {isLoading ? (
              <>
                <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('elasticOperator.installing', 'Installing...')}
              </>
            ) : (
              t('elasticOperator.install', 'Install')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
