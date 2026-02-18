import { useResources } from '@/lib/api'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function NamespaceSelector({
  selectedNamespace,
  handleNamespaceChange,
  showAll = false,
  extraOptions = [],
}: {
  selectedNamespace?: string
  handleNamespaceChange: (namespace: string) => void
  showAll?: boolean
  extraOptions?: string[]
}) {
  const { data, isLoading } = useResources('namespaces')

  const existingNames = new Set(
    data?.map((n) => n.metadata?.name).filter(Boolean) || []
  )
  const sortedNamespaces = data?.sort((a, b) => {
    const nameA = a.metadata?.name?.toLowerCase() || ''
    const nameB = b.metadata?.name?.toLowerCase() || ''
    return nameA.localeCompare(nameB)
  }) || [{ metadata: { name: 'default' } }]
  const extraNames = extraOptions.filter((n) => !existingNames.has(n))
  const allNames = [...extraNames, ...sortedNamespaces.map((n) => n.metadata?.name).filter(Boolean) as string[]]

  return (
    <Select value={selectedNamespace} onValueChange={handleNamespaceChange}>
      <SelectTrigger className="max-w-48">
        <SelectValue placeholder="Select a namespace" />
      </SelectTrigger>
      <SelectContent>
        {isLoading && (
          <SelectItem disabled value="_loading">
            Loading namespaces...
          </SelectItem>
        )}
        {showAll && (
          <SelectItem key="all" value="_all">
            All Namespaces
          </SelectItem>
        )}
        {allNames?.map((name) => (
          <SelectItem key={name} value={name}>
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
