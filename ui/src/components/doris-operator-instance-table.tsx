import { useMemo, useState } from 'react'
import {
  IconCircleCheckFilled,
  IconLoader,
  IconSettings,
  IconTrash,
} from '@tabler/icons-react'
import { Deployment } from 'kubernetes-types/apps/v1'
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

const DORIS_OPERATOR_LABEL_SELECTOR = 'app.kubernetes.io/part-of=doris-operator'

const DORIS_OPERATOR_CRDS = [
  'dorisclusters.doris.selectdb.com',
  'dorisdisaggregatedclusters.disaggregated.cluster.doris.com',
] as const

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

export function DorisOperatorInstanceTable() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const { data: deployments, isLoading } = useResources(
    'deployments',
    '_all',
    { labelSelector: DORIS_OPERATOR_LABEL_SELECTOR }
  )

  const operators = useMemo((): Deployment[] => {
    const items = Array.isArray(deployments) ? deployments : []
    return items.filter(
      (d: Deployment) =>
        d.metadata?.labels?.['app.kubernetes.io/part-of'] === 'doris-operator'
    )
  }, [deployments])

  const selectedCount = useMemo(
    () => Object.values(selected).filter(Boolean).length,
    [selected]
  )

  const toggleSelect = (key: string) => {
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const toggleSelectAll = () => {
    if (selectedCount === operators.length) {
      setSelected({})
    } else {
      const next: Record<string, boolean> = {}
      operators.forEach((d) => {
        const ns = d.metadata?.namespace ?? ''
        const name = d.metadata?.name ?? ''
        next[`${ns}/${name}`] = true
      })
      setSelected(next)
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedCount === 0) return
    setIsDeleting(true)
    try {
      let deleted = 0
      for (const d of operators) {
        const ns = d.metadata?.namespace ?? ''
        const name = d.metadata?.name ?? ''
        const key = `${ns}/${name}`
        if (!selected[key]) continue
        try {
          await deleteResource('deployments', name, ns)
          deleted++
        } catch (e) {
          toast.error(`${name}: ${translateError(e, t)}`)
        }
      }
      if (deleted > 0) {
        for (const crdName of DORIS_OPERATOR_CRDS) {
          try {
            await deleteResource('crds', crdName, undefined)
          } catch (e) {
            toast.error(`${crdName}: ${translateError(e, t)}`)
          }
        }
        toast.success(
          t('doris.operator.deleteSuccess', 'Deleted {{count}} Doris Operator(s)', {
            count: deleted,
          })
        )
        setSelected({})
        setDeleteDialogOpen(false)
        queryClient.invalidateQueries({ queryKey: ['deployments'] })
        queryClient.invalidateQueries({ queryKey: ['crds'] })
      }
    } catch (err) {
      toast.error(translateError(err, t))
    } finally {
      setIsDeleting(false)
    }
  }

  if (operators.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
        <IconSettings className="h-12 w-12 text-muted-foreground" />
        <p className="mt-4 text-sm text-muted-foreground">
          {t(
            'doris.operator.installHint',
            'Click Install to deploy Doris Operator in your cluster'
          )}
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
            <DialogTitle>
              {t('doris.operator.deleteConfirmTitle', 'Confirm Delete')}
            </DialogTitle>
            <DialogDescription>
              {t('doris.operator.deleteConfirmDesc', 'Delete selected {{count}} Doris Operator(s)?', {
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

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={
                    selectedCount === operators.length && operators.length > 0
                  }
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead>{t('common.name')}</TableHead>
              <TableHead>{t('common.namespace')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead>{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {operators.map((d) => {
              const ns = d.metadata?.namespace ?? ''
              const name = d.metadata?.name ?? ''
              const key = `${ns}/${name}`
              const ready = d.status?.readyReplicas ?? 0
              const desired = d.status?.replicas ?? 0
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
                      to={`/deployments/${ns}/${name}`}
                      className="text-blue-500 hover:underline"
                    >
                      {name}
                    </Link>
                  </TableCell>
                  <TableCell>{ns}</TableCell>
                  <TableCell>
                    <StatusBadge
                      ready={ready}
                      desired={desired}
                      isLoading={isLoading}
                    />
                  </TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/deployments/${ns}/${name}`}>
                        {t('doris.operator.viewDetail', 'View Detail')}
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
