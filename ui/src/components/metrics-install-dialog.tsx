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

import { METRICS_TEMPLATE } from './metrics-template'
import { NamespaceSelector } from './selector/namespace-selector'

const DEFAULT_NAMESPACE = 'middleware'

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

function generateMetricsYamls(namespace: string): string[] {
  let template = METRICS_TEMPLATE
  template = template.replace(/\bmiddleware\b/g, namespace)
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
    } else if (yaml.includes('kind: Namespace')) {
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

interface MetricsInstallDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function MetricsInstallDialog({
  open,
  onOpenChange,
  onSuccess,
}: MetricsInstallDialogProps) {
  const { t } = useTranslation()
  const { data: namespaces } = useResources('namespaces')
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

  const handleInstall = async () => {
    if (!namespace?.trim()) {
      toast.error(t('metrics.namespaceRequired', 'Namespace is required'))
      return
    }

    setIsLoading(true)
    try {
      const yamls = generateMetricsYamls(namespace.trim())
      const withNs = applyWithNamespace(namespace.trim(), yamls)
      await applyMultiYaml(withNs)
      toast.success(t('metrics.installSuccess', 'Metrics stack installed successfully'))
      setNamespace(DEFAULT_NAMESPACE)
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      console.error('Failed to install metrics', err)
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
          <DialogTitle>{t('metrics.installTitle', 'Install Metrics Stack')}</DialogTitle>
          <DialogDescription>
            {t('metrics.installDescription', 'Install metrics-server, kube-state-metrics, node-exporter and Prometheus (from tmp/redis.yaml template)')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
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
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isLoading}
          >
            {t('common.cancel')}
          </Button>
          <Button onClick={handleInstall} disabled={isLoading}>
            {isLoading ? (
              <>
                <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('metrics.installing', 'Installing...')}
              </>
            ) : (
              t('metrics.install', 'Install')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
