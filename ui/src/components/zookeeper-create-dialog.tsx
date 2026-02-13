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

import zookeeperTemplate from '@/templates/zookeeper.yaml?raw'
import { NamespaceSelector } from './selector/namespace-selector'

const DEFAULT_NAME = 'zookeeper'
const DEFAULT_NAMESPACE = 'middleware'

function generateZookeeperYamls(name: string, namespace: string): string[] {
  const zooServers = [
    `${name}-0.${name}-headless.${namespace}.svc.cluster.local:2888:3888::1`,
    `${name}-1.${name}-headless.${namespace}.svc.cluster.local:2888:3888::2`,
    `${name}-2.${name}-headless.${namespace}.svc.cluster.local:2888:3888::3`,
  ].join(' ')

  let template = zookeeperTemplate
  template = template.replace(/\b__NAMESPACE__\b/g, namespace)
  template = template.replace(/\b__NAME__\b/g, name)
  template = template.replace(/\b__ZOO_SERVERS__\b/g, zooServers)

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

interface ZookeeperCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function ZookeeperCreateDialog({
  open,
  onOpenChange,
  onSuccess,
}: ZookeeperCreateDialogProps) {
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
      toast.error(t('zookeeper.nameInvalid', 'Name must be a valid Kubernetes resource name'))
      return
    }
    if (!namespace?.trim()) {
      toast.error(t('zookeeper.namespaceRequired', 'Namespace is required'))
      return
    }

    setIsLoading(true)
    try {
      const yamls = generateZookeeperYamls(instanceName, namespace.trim())
      const withNs = applyWithNamespace(namespace.trim(), yamls)
      await applyMultiYaml(withNs)
      toast.success(t('zookeeper.createSuccess', 'Zookeeper created successfully'))
      setName(DEFAULT_NAME)
      setNamespace(DEFAULT_NAMESPACE)
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      console.error('Failed to create Zookeeper', err)
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
          <DialogTitle>{t('zookeeper.createTitle', 'Create Zookeeper')}</DialogTitle>
          <DialogDescription>
            {t('zookeeper.createDescription', 'Create a Zookeeper cluster with ConfigMap, Services and StatefulSet')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('zookeeper.instanceName', 'Instance Name')}</Label>
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
