import { useMemo, useState } from 'react'
import {
  IconChartBar,
  IconCircleCheckFilled,
  IconCopy,
  IconLoader,
  IconTrash,
} from '@tabler/icons-react'
import { Deployment } from 'kubernetes-types/apps/v1'
import { DaemonSet } from 'kubernetes-types/apps/v1'
import { Service } from 'kubernetes-types/core/v1'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { deleteResource, useResources } from '@/lib/api'
import { translateError } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const METRICS_COMPONENT_NAMES = [
  'kube-state-metrics',
  'kube-metrics-server',
  'kube-prometheus-server',
] as const
const METRICS_DAEMONSET_NAMES = ['kube-node-exporter'] as const
const PROMETHEUS_SERVICE_NAME = 'prometheus-server'

function StatusBadge({
  ready,
  desired,
  isLoading,
}: {
  ready: number
  desired: number
  isLoading?: boolean
}) {
  const { t } = useTranslation()
  const isReady = ready === desired && desired > 0
  if (isLoading) {
    return (
      <Badge variant="outline" className="text-muted-foreground px-1.5">
        <IconLoader className="h-3.5 w-3.5 animate-spin" />
        {t('common.loading')}
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="text-muted-foreground px-1.5">
      {isReady ? (
        <IconCircleCheckFilled className="fill-green-500 dark:fill-green-400" />
      ) : (
        <IconLoader className="h-3.5 w-3.5 animate-spin" />
      )}
      {isReady ? t('deployments.available') : t('common.loading')}
    </Badge>
  )
}

interface ComponentRow {
  name: string
  kind: 'Deployment' | 'DaemonSet'
  namespace: string
  ready: number
  desired: number
}

export function MetricsInstanceTable() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const { data: deployments, isLoading: deploymentsLoading } = useResources(
    'deployments',
    '_all'
  )
  const { data: daemonsets, isLoading: daemonsetsLoading } = useResources(
    'daemonsets',
    '_all'
  )
  const { data: services } = useResources('services', '_all', {
    labelSelector: 'app.kubernetes.io/instance=metrics',
  })

  const components = useMemo((): ComponentRow[] => {
    const rows: ComponentRow[] = []
    const depItems = Array.isArray(deployments) ? deployments : []
    const dsItems = Array.isArray(daemonsets) ? daemonsets : []

    for (const name of METRICS_COMPONENT_NAMES) {
      const dep = depItems.find(
        (d: Deployment) => d.metadata?.name === name
      ) as Deployment | undefined
      if (dep) {
        rows.push({
          name,
          kind: 'Deployment',
          namespace: dep.metadata?.namespace ?? '',
          ready: dep.status?.readyReplicas ?? 0,
          desired: dep.status?.replicas ?? 0,
        })
      }
    }

    for (const name of METRICS_DAEMONSET_NAMES) {
      const ds = dsItems.find(
        (d: DaemonSet) => d.metadata?.name === name
      ) as DaemonSet | undefined
      if (ds) {
        rows.push({
          name,
          kind: 'DaemonSet',
          namespace: ds.metadata?.namespace ?? '',
          ready: ds.status?.numberReady ?? 0,
          desired: ds.status?.desiredNumberScheduled ?? 0,
        })
      }
    }

    return rows.sort((a, b) => a.name.localeCompare(b.name))
  }, [deployments, daemonsets])

  const prometheusService = useMemo(() => {
    const svcItems = Array.isArray(services) ? services : []
    return svcItems.find(
      (s: Service) => s.metadata?.name === PROMETHEUS_SERVICE_NAME
    ) as Service | undefined
  }, [services])

  const prometheusDomain = useMemo(() => {
    if (!prometheusService) return null
    const ns = prometheusService.metadata?.namespace ?? 'middleware'
    const port = prometheusService.spec?.ports?.[0]?.port ?? 80
    return `prometheus-server.${ns}.svc.cluster.local:${port}`
  }, [prometheusService])

  const isLoading = deploymentsLoading || daemonsetsLoading

  const selectedCount = useMemo(
    () => Object.values(selected).filter(Boolean).length,
    [selected]
  )

  const toggleSelect = (key: string) => {
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const toggleSelectAll = () => {
    if (selectedCount === components.length) {
      setSelected({})
    } else {
      const next: Record<string, boolean> = {}
      components.forEach((row) => {
        next[`${row.namespace}/${row.name}`] = true
      })
      setSelected(next)
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedCount === 0) return
    setIsDeleting(true)
    try {
      let deleted = 0
      for (const row of components) {
        const key = `${row.namespace}/${row.name}`
        if (!selected[key]) continue
        try {
          if (row.kind === 'Deployment') {
            await deleteResource('deployments', row.name, row.namespace)
          } else {
            await deleteResource('daemonsets', row.name, row.namespace)
          }
          deleted++
        } catch (e) {
          toast.error(`${row.name}: ${translateError(e, t)}`)
        }
      }
      if (deleted > 0) {
        toast.success(
          t('metrics.deleteSuccess', '已删除 {{count}} 个组件', { count: deleted })
        )
        setSelected({})
        setDeleteDialogOpen(false)
        queryClient.invalidateQueries({ queryKey: ['deployments'] })
        queryClient.invalidateQueries({ queryKey: ['daemonsets'] })
      }
    } catch (err) {
      toast.error(translateError(err, t))
    } finally {
      setIsDeleting(false)
    }
  }

  if (components.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
        <IconChartBar className="h-12 w-12 text-muted-foreground" />
        <p className="mt-4 text-sm text-muted-foreground">
          {t('metrics.installHint', 'Click Install to deploy the metrics stack in your cluster')}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {selectedCount > 0 && (
          <Button
            variant="destructive"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <IconTrash className="mr-2 h-4 w-4" />
            {t('common.delete')} ({selectedCount})
          </Button>
        )}
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('metrics.deleteConfirmTitle', '确认删除')}</DialogTitle>
            <DialogDescription>
              {t('metrics.deleteConfirmDesc', '将删除选中的 {{count}} 个 Metrics 组件', {
                count: selectedCount,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteSelected}
              disabled={isDeleting}
            >
              {isDeleting ? t('common.deleting') : t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {prometheusDomain && (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {t('metrics.prometheusDomain', 'Prometheus 服务域名')}
              </p>
              <p className="mt-1 font-mono text-sm">{prometheusDomain}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard
                  .writeText(prometheusDomain)
                  .then(() => toast.success(t('common.copied')))
                  .catch(() => toast.error(t('metrics.copyFailed', '复制失败')))
              }}
            >
              <IconCopy className="mr-2 h-4 w-4" />
              {t('metrics.copy', '复制')}
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={
                    selectedCount === components.length && components.length > 0
                  }
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead>{t('metrics.component', '组件')}</TableHead>
              <TableHead>{t('common.namespace')}</TableHead>
              <TableHead>{t('metrics.kind', '类型')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead>{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {components.map((row) => {
              const key = `${row.namespace}/${row.name}`
              return (
                <TableRow key={key}>
                  <TableCell>
                    <Checkbox
                      checked={!!selected[key]}
                      onCheckedChange={() => toggleSelect(key)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                  <Link
                    to={`/${row.kind.toLowerCase()}s/${row.namespace}/${row.name}`}
                    className="text-blue-500 hover:underline"
                  >
                    {row.name}
                  </Link>
                </TableCell>
                <TableCell>{row.namespace}</TableCell>
                <TableCell>{row.kind}</TableCell>
                <TableCell>
                  <StatusBadge
                    ready={row.ready}
                    desired={row.desired}
                    isLoading={isLoading}
                  />
                </TableCell>
                <TableCell>
                  <Button variant="outline" size="sm" asChild>
                    <Link
                      to={`/${row.kind.toLowerCase()}s/${row.namespace}/${row.name}`}
                    >
                      {t('metrics.viewDetail', '查看详情')}
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
