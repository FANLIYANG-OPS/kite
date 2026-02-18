import { useMemo, useState } from 'react'
import {
  IconCircleCheckFilled,
  IconCopy,
  IconLoader,
  IconRefresh,
  IconTrash,
} from '@tabler/icons-react'
import { createColumnHelper } from '@tanstack/react-table'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { apiClient } from '@/lib/api-client'
import { deleteResource, fetchResources } from '@/lib/api'
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

const DORIS_CRD = 'dorisclusters.doris.selectdb.com'
const DEFAULT_NODE_PORT = 30883

interface DorisClusterItem {
  metadata?: {
    name?: string
    namespace?: string
    creationTimestamp?: string
    labels?: Record<string, string>
  }
  status?: {
    feStatus?: string
    beStatus?: string
  }
}

export function DorisInstanceTable() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const {
    data: dorisData,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['dorisclusters', DORIS_CRD],
    queryFn: async () => {
      const res = await apiClient.get<{ items?: DorisClusterItem[] }>(
        `/${DORIS_CRD}/_all`
      )
      return res
    },
  })

  const { data: services } = useQuery({
    queryKey: ['services', '_all'],
    queryFn: async () => {
      const res = await apiClient.get<{ items?: Array<{ metadata?: { name?: string; namespace?: string }; spec?: { ports?: Array<{ nodePort?: number }>; type?: string } }> }>(
        '/services/_all'
      )
      return res
    },
  })

  const dorisInstances = useMemo(() => {
    const items = dorisData?.items ?? []
    return Array.isArray(items) ? items : []
  }, [dorisData])

  const nodePortMap = useMemo(() => {
    const map = new Map<string, number>()
    const svcItems = services?.items ?? []
    dorisInstances.forEach((dc) => {
      const ns = dc.metadata?.namespace ?? ''
      const name = dc.metadata?.name ?? 'doris'
      const key = `${ns}/${name}`
      const svc = svcItems.find(
        (s) =>
          s.metadata?.namespace === ns &&
          s.metadata?.name === `${name}-nodeport-service` &&
          s.spec?.type === 'NodePort'
      )
      const port = svc?.spec?.ports?.[0]?.nodePort ?? DEFAULT_NODE_PORT
      map.set(key, port)
    })
    return map
  }, [services, dorisInstances])

  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const columnHelper = createColumnHelper<DorisClusterItem>()
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
        cell: ({ row }) => {
          const name = row.original.metadata?.name ?? ''
          const ns = row.original.metadata?.namespace ?? ''
          return (
            <Link
              to={`/crds/${DORIS_CRD}/${ns}/${name}`}
              className="font-medium text-blue-500 hover:underline"
            >
              {name}
            </Link>
          )
        },
      }),
      columnHelper.accessor('metadata.namespace', {
        header: t('common.namespace'),
        cell: ({ getValue }) => getValue() ?? '-',
      }),
      columnHelper.display({
        id: 'status',
        header: t('common.status'),
        cell: ({ row }) => {
          const status = row.original.status as Record<string, string> | undefined
          const feStatus = status?.feStatus ?? status?.ferStatus
          const beStatus = status?.beStatus ?? status?.berStatus
          const isReady =
            (feStatus === 'running' || feStatus === 'Running') &&
            (beStatus === 'running' || beStatus === 'Running')
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
        id: 'nodePort',
        header: t('doris.nodePort', 'External Port'),
        cell: ({ row }) => {
          const ns = row.original.metadata?.namespace ?? ''
          const name = row.original.metadata?.name ?? 'doris'
          const port = nodePortMap.get(`${ns}/${name}`) ?? DEFAULT_NODE_PORT
          return <span className="font-mono">{port}</span>
        },
      }),
      columnHelper.display({
        id: 'domain',
        header: t('doris.domain', 'Domain'),
        cell: ({ row }) => {
          const ns = row.original.metadata?.namespace ?? ''
          const name = row.original.metadata?.name ?? 'doris'
          const domain = `${name}.${ns}.svc.cluster.local:9030`
          const handleCopy = () => {
            navigator.clipboard.writeText(domain).then(() => {
              toast.success(t('common.copied'))
            }).catch(() => {
              toast.error(t('doris.copyFailed', 'Copy failed'))
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
        cell: ({ row }) => {
          const ns = row.original.metadata?.namespace ?? ''
          const name = row.original.metadata?.name ?? ''
          return (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/crds/${DORIS_CRD}/${ns}/${name}`}>
                {t('doris.viewDetail', 'View Detail')}
              </Link>
            </Button>
          )
        },
      }),
    ],
    [columnHelper, nodePortMap, t]
  )

  const table = useReactTable({
    data: dorisInstances,
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
        const dc = row.original
        const name = dc.metadata?.name ?? 'doris'
        const namespace = dc.metadata?.namespace ?? ''
        if (!namespace) continue
        try {
          await apiClient.delete(
            `/${DORIS_CRD}/${namespace}/${name}`
          )
        } catch (e) {
          toast.error(`${name}/${namespace}: ${translateError(e, t)}`)
          continue
        }
        try {
          await deleteResource('services', `${name}-nodeport-service`, namespace)
        } catch {
          // ignore
        }
        try {
          await deleteResource('configmaps', name, namespace)
        } catch {
          // ignore
        }
        try {
          const pvcRes = await fetchResources<{ items?: Array<{ metadata?: { name?: string } }> }>(
            'persistentvolumeclaims',
            namespace
          )
          const pvcItems = pvcRes?.items ?? []
          const dorisPvcs = pvcItems.filter(
            (p) =>
              p.metadata?.name &&
              (p.metadata.name.includes(`${name}-fe`) ||
                p.metadata.name.includes(`${name}-be`))
          )
          for (const pvc of dorisPvcs) {
            const pvcName = pvc.metadata!.name!
            try {
              await deleteResource('persistentvolumeclaims', pvcName, namespace)
            } catch {
              // ignore
            }
          }
        } catch {
          // ignore
        }
      }
      toast.success(
        t('doris.deleteSuccess', 'Deleted {{count}} Doris instance(s)', {
          count: selectedCount,
        })
      )
      setRowSelection({})
      setDeleteDialogOpen(false)
      queryClient.invalidateQueries({ queryKey: ['dorisclusters'] })
      queryClient.invalidateQueries({ queryKey: ['services'] })
      queryClient.invalidateQueries({ queryKey: ['configmaps'] })
      queryClient.invalidateQueries({ queryKey: ['persistentvolumeclaims'] })
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
            <DialogTitle>{t('doris.deleteConfirmTitle', 'Confirm Delete')}</DialogTitle>
            <DialogDescription>
              {t('doris.deleteConfirmDesc', 'This will delete {{count}} selected Doris instance(s) and their associated Services and ConfigMaps', {
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
                  {t('doris.noInstances', 'No Doris instances. Click the button above to create one.')}
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
      {dorisInstances.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {t('doris.totalInstances', '{{count}} instance(s) total', {
              count: dorisInstances.length,
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
