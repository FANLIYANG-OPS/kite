import { useMemo, useState } from 'react'
import {
  IconCircleCheckFilled,
  IconCopy,
  IconLoader,
  IconRefresh,
  IconTrash,
} from '@tabler/icons-react'
import { createColumnHelper } from '@tanstack/react-table'
import { Deployment } from 'kubernetes-types/apps/v1'
import { Service } from 'kubernetes-types/core/v1'
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

const HORTONWORKS_LABEL_SELECTOR = 'app.kubernetes.io/component=hortonworks'

export function HortonworksInstanceTable() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const {
    data: deployments,
    isLoading,
    refetch,
  } = useResources('deployments', '_all', {
    labelSelector: HORTONWORKS_LABEL_SELECTOR,
  })

  const { data: services } = useResources('services', '_all', {
    labelSelector: HORTONWORKS_LABEL_SELECTOR,
  })

  const hortonworksInstances = useMemo(() => {
    const items = Array.isArray(deployments) ? deployments : []
    return items.filter(
      (d: Deployment) =>
        d.metadata?.labels?.['app.kubernetes.io/component'] === 'hortonworks'
    )
  }, [deployments])

  const nodePortMap = useMemo(() => {
    const map = new Map<string, number | null>()
    const svcItems = Array.isArray(services) ? services : []
    hortonworksInstances.forEach((d) => {
      const ns = d.metadata?.namespace ?? ''
      const instanceName = d.metadata?.name ?? 'hortonworks'
      const key = `${ns}/${instanceName}`
      const svc = svcItems.find(
        (s: Service) =>
          s.metadata?.namespace === ns &&
          s.metadata?.name === `${instanceName}-nodeport` &&
          s.spec?.type === 'NodePort'
      )
      const port = svc?.spec?.ports?.[0]?.nodePort
      map.set(key, port != null ? port : null)
    })
    return map
  }, [services, hortonworksInstances])

  const [rowSelection, setRowSelection] = useState({})
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const columnHelper = createColumnHelper<Deployment>()
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
            to={`/deployments/${row.original.metadata!.namespace}/${row.original.metadata!.name}`}
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
      columnHelper.display({
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
        id: 'nodeport',
        header: t('hortonworks.nodePort', 'NodePort'),
        cell: ({ row }) => {
          const ns = row.original.metadata?.namespace ?? ''
          const name = row.original.metadata?.name ?? 'hortonworks'
          const port = nodePortMap.get(`${ns}/${name}`)
          return (
            <span className="font-mono text-sm">
              {port != null ? port : '-'}
            </span>
          )
        },
      }),
      columnHelper.display({
        id: 'domain',
        header: t('hortonworks.domain', 'Schema Registry URL'),
        cell: ({ row }) => {
          const ns = row.original.metadata?.namespace ?? ''
          const name = row.original.metadata?.name ?? 'hortonworks'
          const domain = `${name}.${ns}.svc.cluster.local:9090`
          const handleCopy = () => {
            navigator.clipboard
              .writeText(domain)
              .then(() => toast.success(t('common.copied')))
              .catch(() =>
                toast.error(t('hortonworks.copyFailed', 'Copy failed'))
              )
          }
          return (
            <div className="flex items-center gap-1">
              <span
                className="font-mono text-sm truncate max-w-[220px]"
                title={domain}
              >
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
              to={`/deployments/${row.original.metadata!.namespace}/${row.original.metadata!.name}`}
            >
              {t('hortonworks.viewDetail', 'View Detail')}
            </Link>
          </Button>
        ),
      }),
    ],
    [columnHelper, t, nodePortMap]
  )

  const table = useReactTable({
    data: hortonworksInstances,
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
        const d = row.original
        const name = d.metadata?.name ?? 'hortonworks'
        const namespace = d.metadata?.namespace ?? ''
        if (!namespace) continue
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
        try {
          await deleteResource('services', `${name}-nodeport`, namespace)
        } catch {
          // ignore
        }
        try {
          await deleteResource('configmaps', name, namespace)
        } catch {
          // ignore
        }
      }
      toast.success(
        t('hortonworks.deleteSuccess', 'Deleted {{count}} Hortonworks instance(s)', {
          count: selectedCount,
        })
      )
      setRowSelection({})
      setDeleteDialogOpen(false)
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      queryClient.invalidateQueries({ queryKey: ['services'] })
      queryClient.invalidateQueries({ queryKey: ['configmaps'] })
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
              {t('hortonworks.deleteConfirmTitle', 'Confirm Delete')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'hortonworks.deleteConfirmDesc',
                'This will delete {{count}} selected Hortonworks instance(s) and their associated Services and ConfigMaps',
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
                    'hortonworks.noInstances',
                    'No Hortonworks instances. Click the button above to create one.'
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
      {hortonworksInstances.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {t('hortonworks.totalInstances', '{{count}} instance(s) total', {
              count: hortonworksInstances.length,
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
