import { useMemo, useState } from 'react'
import { IconLoader, IconRefresh, IconTrash } from '@tabler/icons-react'
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

const ELASTICSEARCH_LABEL_SELECTOR = 'app.kubernetes.io/component=elasticsearch'

export function ElasticsearchInstanceTable() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const {
    data: services,
    isLoading,
    refetch,
  } = useResources('services', '_all', {
    labelSelector: ELASTICSEARCH_LABEL_SELECTOR,
  })

  const esServices = useMemo(() => {
    const items = Array.isArray(services) ? services : []
    return items.filter(
      (s: Service) =>
        s.metadata?.labels?.['app.kubernetes.io/component'] === 'elasticsearch'
    )
  }, [services])

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
        cell: ({ row }: any) => {
          const ns = row.original.metadata?.namespace ?? ''
          const name = row.original.metadata?.name ?? ''
          return (
            <Link
              to={`/services/${ns}/${name}`}
              className="font-medium text-blue-500 hover:underline"
            >
              {name}
            </Link>
          )
        },
      },
      {
        id: 'namespace',
        header: t('common.namespace'),
        cell: ({ row }: any) => row.original.metadata?.namespace ?? '-',
      },
      {
        id: 'status',
        header: t('common.status'),
        cell: () => (
          <Badge variant="outline" className="text-muted-foreground px-1.5">
            <IconLoader className="h-3.5 w-3.5 animate-spin" />
            {t('common.loading')}
          </Badge>
        ),
      },
      {
        id: 'domain',
        header: t('elasticsearch.domain', 'Kibana URL'),
        cell: ({ row }: any) => {
          const ns = row.original.metadata?.namespace ?? ''
          const name = row.original.metadata?.name ?? ''
          const domain = `${name}.${ns}.svc.cluster.local:5601`
          return (
            <span className="font-mono text-sm" title={domain}>
              {domain}
            </span>
          )
        },
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
    data: esServices,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    state: { rowSelection },
    getRowId: (row: Service) =>
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
        const svc: Service = row.original
        const name = svc.metadata?.name ?? ''
        const namespace = svc.metadata?.namespace ?? ''
        if (!namespace || !name) continue

        try {
          await deleteResource('services', name, namespace)
        } catch (e) {
          toast.error(`${name}/${namespace}: ${translateError(e, t)}`)
        }
        // Best-effort delete of associated resources is omitted here because
        // elasticsearch CRs are managed via the operator CRD pages.
      }
      toast.success(
        t('elasticsearch.deleteSuccess', 'Deleted {{count}} Elasticsearch instance(s)', {
          count: selectedCount,
        })
      )
      setRowSelection({})
      setDeleteDialogOpen(false)
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
              {t('elasticsearch.deleteConfirmTitle', 'Confirm Delete')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'elasticsearch.deleteConfirmDesc',
                'This will delete {{count}} selected Elasticsearch instance(s) and their associated Kibana, Secret and Elasticsearch resources',
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
            <Button variant="destructive" onClick={handleDeleteSelected} disabled={isDeleting}>
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
                    'elasticsearch.noInstances',
                    'No Elasticsearch instances. Click the button above to create one.'
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
      {esServices.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {t('elasticsearch.totalInstances', '{{count}} instance(s) total', {
              count: esServices.length,
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

