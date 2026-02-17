import { useState } from 'react'
import { IconPlus } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { usePageTitle } from '@/hooks/use-page-title'
import { Button } from '@/components/ui/button'
import { KafkaCreateDialog } from '@/components/kafka-create-dialog'
import { KafkaInstanceTable } from '@/components/kafka-instance-table'

export function KafkaPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  usePageTitle(t('nav.kafka'))

  const handleCreateSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['statefulsets'] })
    queryClient.invalidateQueries({ queryKey: ['services'] })
    queryClient.invalidateQueries({ queryKey: ['configmaps'] })
    queryClient.invalidateQueries({ queryKey: ['secrets'] })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('nav.kafka')}</h1>
          <p className="mt-2 text-muted-foreground">
            {t('kafka.pageDescription', 'Create and manage Kafka clusters in the cluster')}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <IconPlus className="mr-2 h-4 w-4" />
          {t('kafka.create', 'Create Kafka')}
        </Button>
      </div>

      <KafkaInstanceTable />

      <KafkaCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={handleCreateSuccess}
      />
    </div>
  )
}
