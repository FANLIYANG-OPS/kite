import { useState } from 'react'
import { IconPlus } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { usePageTitle } from '@/hooks/use-page-title'
import { Button } from '@/components/ui/button'
import { ElasticsearchCreateDialog } from '@/components/elasticsearch-create-dialog'
import { ElasticsearchInstanceTable } from '@/components/elasticsearch-instance-table'

export function ElasticsearchPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  usePageTitle(t('nav.elasticsearch'))

  const handleCreateSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['services'] })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {t('nav.elasticsearch', 'Elasticsearch')}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {t(
              'elasticsearch.pageDescription',
              'Create and manage Elasticsearch clusters (with Kibana) in the cluster'
            )}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <IconPlus className="mr-2 h-4 w-4" />
          {t('elasticsearch.create', 'Create Elasticsearch')}
        </Button>
      </div>

      <ElasticsearchInstanceTable />

      <ElasticsearchCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={handleCreateSuccess}
      />
    </div>
  )
}

