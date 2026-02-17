import { useMemo, useState } from 'react'
import {
  IconCircleCheckFilled,
  IconCopy,
  IconLoader,
  IconRefresh,
  IconTrash,
} from '@tabler/icons-react'
import { createColumnHelper } from '@tanstack/react-table'
import { StatefulSet } from 'kubernetes-types/apps/v1'
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

const KAFKA_IMAGE_PREFIX = 'kafka'

export function KafkaInstanceTable() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const {
    data: statefulsets,
    isLoading,
    refetch,
  } = useResources('statefulsets', '_all')

  const kafkaInstances = useMemo(() => {
    const items = Array.isArray(statefulsets) ? statefulsets : []
    return items.filter((ss) => {
      const containers = ss.spec?.template?.spec?.containers ?? []
      const initContainers = ss.spec?.template?.spec?.initContainers ?? []
      const allContainers = [...containers, ...initContainers]
      return allContainers.some(
        (c) => c.image?.toLowerCase().includes(KAFKA_IMAGE_PREFIX)
      )
    })
  }, [statefulsets])

  const [rowSelection, setRowSelection] = useState({})
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const columnHelper = createColumnHelper<StatefulSet>()
  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'select',
        header: ({ table }) => (
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
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
          />
        ),
      }),
      columnHelper.accessor('metadata.name', {
        header: t('common.name'),
        cell: ({ row }) => (
          <Link
            to={`/statefulsets/${row.original.metadata!.namespace}/${row.original.metadata!.name}`}
            className="font-medium text-blue-500 hover:underline"
          >
            {row.original.metadata!.name}
          </Link>
        ),
      }),
      columnHelper.accessor('metadata.namespace', {
        header: t('common.namespace'),
        cell: ({ getValue }) => getValue() ?? '-',
      }),
      columnHelper.accessor((row) => row.status?.readyReplicas ?? 0, {
        id: 'status',
        header: t('common.status'),
        cell: ({ row }) => {
          const ready = row.original.status?.readyReplicas ?? 0
          const desired = row.original.status?.replicas ?? 0
          const isReady = ready === desired && desired > 0
          return (
            <Badge variant="outline" className="text-muted-foreground px-1.5">
              {isReady ? (
                <IconCircleCheckFilled className="fill-green-500 dark:fill-green-400" />
              ) : (
                <IconLoader className="animate-spin" />
              )}
              {isReady ? t('deployments.available') : t('common.loading')}
            </Badge>
          )
        },
      }),
      columnHelper.display({
        id: 'domain',
        header: t('kafka.domain', 'Domain'),
        cell: ({ row }) => {
          const ns = row.original.metadata?.namespace ?? ''
          const name = row.original.metadata?.name ?? 'kafka'
          const domain = `${name}.${ns}.svc.cluster.local:9092`
          const handleCopy = () => {
            navigator.clipboard.writeText(domain).then(() => {
              toast.success(t('common.copied'))
            }).catch(() => {
              toast.error(t('kafka.copyFailed', 'Copy failed'))
            })
          }
          return (
            <div className="flex items-center gap-1">
              <span className="font-mono text-sm truncate max-w-[200px]" title={domain}>
                {domain}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={handleCopy}
              >
                <IconCopy className="h-3.5 w-3.5" />
              </Button>
            </div>
          )
        },
      }),
      columnHelper.accessor('metadata.creationTimestamp', {
        header: t('common.created'),
        cell: ({ getValue }) => (
          <span className="text-muted-foreground text-sm">
            {formatDate(getValue() || '')}
          </span>
        ),
      }),
      columnHelper.display({
        id: 'actions',
        header: t('common.actions'),
        cell: ({ row }) => (
          <Button variant="outline" size="sm" asChild>
            <Link
              to={`/statefulsets/${row.original.metadata!.namespace}/${row.original.metadata!.name}`}
            >
              {t('kafka.viewDetail', 'View Detail')}
            </Link>
          </Button>
        ),
      }),
    ],
    [columnHelper, t]
  )

  const table = useReactTable({
    data: kafkaInstances,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    state: { rowSelection },
    getRowId: (row) =>
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
        const ss = row.original
        const name = ss.metadata?.name ?? 'kafka'
        const namespace = ss.metadata?.namespace ?? ''
        if (!namespace) continue
        try {
          await deleteResource('statefulsets', name, namespace)
        } catch (e) {
          toast.error(`${name}/${namespace}: ${translateError(e, t)}`)
          continue
        }
        try {
          await deleteResource('services', name, namespace)
        } catch {
          // ignore
        }
        try {
          await deleteResource('services', `${name}-headless`, namespace)
        } catch {
          // ignore
        }
        try {
          await deleteResource('configmaps', `${name}-scripts`, namespace)
        } catch {
          // ignore
        }
        try {
          await deleteResource('configmaps', `${name}-config`, namespace)
        } catch {
          // ignore
        }
        try {
          await deleteResource('secrets', `${name}-kraft-cluster-id`, namespace)
        } catch {
          // ignore
        }
      }
      toast.success(
        t('kafka.deleteSuccess', 'Deleted {{count}} Kafka instance(s)', {
          count: selectedCount,
        })
      )
      setRowSelection({})
      setDeleteDialogOpen(false)
      queryClient.invalidateQueries({ queryKey: ['statefulsets'] })
      queryClient.invalidateQueries({ queryKey: ['services'] })
      queryClient.invalidateQueries({ queryKey: ['configmaps'] })
      queryClient.invalidateQueries({ queryKey: ['secrets'] })
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
            <DialogTitle>{t('kafka.deleteConfirmTitle', 'Confirm Delete')}</DialogTitle>
            <DialogDescription>
              {t('kafka.deleteConfirmDesc', 'This will delete {{count}} selected Kafka instance(s) and their associated Services, ConfigMaps and Secrets', {
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
                  {t('kafka.noInstances', 'No Kafka instances. Click the button above to create one.')}
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
      {kafkaInstances.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {t('kafka.totalInstances', '{{count}} instance(s) total', {
              count: kafkaInstances.length,
            })}
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
