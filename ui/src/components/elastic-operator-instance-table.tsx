import { useMemo, useState } from 'react'
import { IconLoader, IconSettings, IconTrash } from '@tabler/icons-react'
import { StatefulSet } from 'kubernetes-types/apps/v1'
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

const ELASTIC_OPERATOR_LABEL_SELECTOR = 'app.kubernetes.io/component=elasticoperator'

function StatusBadge({ ready, desired }: { ready: number; desired: number }) {
  const { t } = useTranslation()
  const isReady = ready === desired && desired > 0
  return (
    <Badge variant="outline" className="text-muted-foreground px-1.5">
      {isReady ? (
        <span className="text-green-500 dark:text-green-400">●</span>
      ) : (
        <IconLoader className="h-3.5 w-3.5 animate-spin" />
      )}
      {isReady ? t('deployments.available') : t('common.loading')}
    </Badge>
  )
}

export function ElasticOperatorInstanceTable() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const { data: statefulsets, isLoading } = useResources('statefulsets', '_all', {
    labelSelector: ELASTIC_OPERATOR_LABEL_SELECTOR,
  })

  const operators = useMemo((): StatefulSet[] => {
    const items = Array.isArray(statefulsets) ? statefulsets : []
    return items.filter(
      (s: StatefulSet) =>
        s.metadata?.labels?.['app.kubernetes.io/component'] === 'elasticoperator'
    )
  }, [statefulsets])

  const selectedCount = useMemo(() => Object.values(selected).filter(Boolean).length, [selected])

  const toggleSelect = (key: string) => {
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const toggleSelectAll = () => {
    if (selectedCount === operators.length) setSelected({})
    else {
      const next: Record<string, boolean> = {}
      operators.forEach((s) => {
        const ns = s.metadata?.namespace ?? ''
        const name = s.metadata?.name ?? ''
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
      for (const s of operators) {
        const ns = s.metadata?.namespace ?? ''
        const name = s.metadata?.name ?? ''
        if (!selected[`${ns}/${name}`]) continue
        try {
          await deleteResource('statefulsets', name, ns)
          deleted++
        } catch (e) {
          toast.error(`${name}: ${translateError(e, t)}`)
        }
      }
      if (deleted > 0) {
        toast.success(
          t('elasticOperator.deleteSuccess', 'Deleted {{count}} Elastic Operator(s)', {
            count: deleted,
          })
        )
        setSelected({})
        setDeleteDialogOpen(false)
        queryClient.invalidateQueries({ queryKey: ['statefulsets'] })
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
          {t('elasticOperator.installHint', 'Click Install to deploy Elastic Operator (ECK) in your cluster')}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {selectedCount > 0 && (
        <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
          <IconTrash className="mr-2 h-4 w-4" />
          {t('common.delete')} ({selectedCount})
        </Button>
      )}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('elasticOperator.deleteConfirmTitle', 'Confirm Delete')}</DialogTitle>
            <DialogDescription>
              {t('elasticOperator.deleteConfirmDesc', 'Delete selected {{count}} Elastic Operator(s)?', {
                count: selectedCount,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={isDeleting}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDeleteSelected} disabled={isDeleting}>
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
                  checked={selectedCount === operators.length && operators.length > 0}
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
            {operators.map((s) => {
              const ns = s.metadata?.namespace ?? ''
              const name = s.metadata?.name ?? ''
              const key = `${ns}/${name}`
              return (
                <TableRow key={key}>
                  <TableCell>
                    <Checkbox checked={!!selected[key]} onCheckedChange={() => toggleSelect(key)} />
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link to={`/statefulsets/${ns}/${name}`} className="text-blue-500 hover:underline">
                      {name}
                    </Link>
                  </TableCell>
                  <TableCell>{ns}</TableCell>
                  <TableCell>
                    <StatusBadge
                      ready={s.status?.readyReplicas ?? 0}
                      desired={s.status?.replicas ?? 0}
                    />
                  </TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/statefulsets/${ns}/${name}`}>
                        {t('elasticOperator.viewDetail', 'View Detail')}
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
