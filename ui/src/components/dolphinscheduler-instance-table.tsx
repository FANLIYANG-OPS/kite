import { useMemo, useState } from 'react'
import { IconCircleCheckFilled, IconLoader, IconRefresh, IconTrash } from '@tabler/icons-react'
import { Deployment } from 'kubernetes-types/apps/v1'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { deleteResource, useResources } from '@/lib/api'
import { formatDate, translateError } from '@/lib/utils'
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
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Input } from '@/components/ui/input'

const DS_LABEL_SELECTOR = 'app.kubernetes.io/component=dolphinscheduler'

function StatusBadge({ ready, desired }: { ready: number; desired: number }) {
  const { t } = useTranslation()
  const isReady = ready === desired && desired > 0
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

export function DolphinschedulerInstanceTable() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const {
    data: deployments,
    isLoading,
    refetch,
  } = useResources('deployments', '_all', {
    labelSelector: DS_LABEL_SELECTOR,
  })

  const instances = useMemo((): Deployment[] => {
    const items = Array.isArray(deployments) ? deployments : []
    return items.filter(
      (d: Deployment) =>
        d.metadata?.labels?.['app.kubernetes.io/component'] === 'dolphinscheduler'
    )
  }, [deployments])

  const [rowSelection, setRowSelection] = useState({})
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const columns = useMemo(
    () => [
      {
        id: 'select',
        header: ({ table }: any) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && 'indeterminate')
            }
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(!!value)
            }
          />
        ),
        cell: ({ row }: any) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
          />
        ),
      },
      {
        id: 'name',
        header: t('common.name'),
        cell: ({ row }: any) => (
          <Link
            to={`/deployments/${row.original.metadata!.namespace}/${row.original.metadata!.name}`}
            className="font-medium text-blue-500 hover:underline"
          >
            {row.original.metadata!.name}
          </Link>
        ),
      },
      {
        id: 'namespace',
        header: t('common.namespace'),
        cell: ({ row }: any) => row.original.metadata?.namespace ?? '-',
      },
      {
        id: 'status',
        header: t('common.status'),
        cell: ({ row }: any) => {
          const ready = row.original.status?.readyReplicas ?? 0
          const desired = row.original.status?.replicas ?? 0
          return <StatusBadge ready={ready} desired={desired} />
        },
      },
      {
        id: 'nodeport',
        header: t('dolphinscheduler.nodePort', 'NodePort'),
        cell: () => <span className="font-mono text-sm">30886</span>,
      },
      {
        id: 'created',
        header: t('common.created'),
        cell: ({ row }: any) => (
          <span className="text-muted-foreground text-sm">
            {formatDate(row.original.metadata?.creationTimestamp || '')}
          </span>
        ),
      },
    ],
    [t]
  )

  const table = useReactTable({
    data: instances,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    state: { rowSelection },
    getRowId: (row: Deployment) =>
      `${row.metadata?.namespace ?? ''}/${row.metadata?.name ?? ''}`,
    initialState: {
      pagination: { pageSize: 10 },
    },
  })

  const selectedRows = table.getFilteredSelectedRowModel().rows
  const selectedCount = selectedRows.length

  const handleDeleteSelected = async () => {
    if (selectedCount === 0) return
    setIsDeleting(true)
    try {
      for (const row of selectedRows) {
        const d: Deployment = row.original
        const name = d.metadata?.name ?? ''
        const namespace = d.metadata?.namespace ?? ''
        if (!namespace || !name) continue
        try {
          await deleteResource('deployments', name, namespace)
        } catch (e) {
          toast.error(`${name}/${namespace}: ${translateError(e, t)}`)
          continue
        }
        try {
          await deleteResource('services', name, namespace)
        } catch {
          // ignore
        }
      }
      toast.success(
        t(
          'dolphinscheduler.deleteSuccess',
          'Deleted {{count}} DolphinScheduler instance(s)',
          { count: selectedCount }
        )
      )
      setRowSelection({})
      setDeleteDialogOpen(false)
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      queryClient.invalidateQueries({ queryKey: ['services'] })
    } catch (err) {
      toast.error(translateError(err, t))
    } finally {
      setIsDeleting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <IconLoader className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          placeholder={t('common.search')}
          value={(table.getState().globalFilter as string) ?? ''}
          onChange={(e) => table.setGlobalFilter(e.target.value)}
          className="max-w-sm"
        />
        <Button variant="outline" size="icon" onClick={() => refetch()}>
          <IconRefresh className="h-4 w-4" />
        </Button>
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
              {t('dolphinscheduler.deleteConfirmTitle', 'Confirm Delete')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'dolphinscheduler.deleteConfirmDesc',
                'This will delete {{count}} selected DolphinScheduler instance(s) and their associated Services',
                { count: selectedCount }
              )}
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

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {t(
                    'dolphinscheduler.noInstances',
                    'No DolphinScheduler instances. Click the button above to create one.'
                  )}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {instances.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {t(
              'dolphinscheduler.totalInstances',
              '{{count}} instance(s) total',
              { count: instances.length }
            )}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              {t('pagination.previous', 'Previous')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              {t('pagination.next', 'Next')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

