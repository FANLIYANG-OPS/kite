import { useState } from 'react'
import { IconPlus } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { usePageTitle } from '@/hooks/use-page-title'
import { Button } from '@/components/ui/button'
import { RocketmqCreateDialog } from '@/components/rocketmq-create-dialog'
import { RocketmqInstanceTable } from '@/components/rocketmq-instance-table'

export function RocketmqPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  usePageTitle(t('nav.rocketmq'))

  const handleCreateSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['statefulsets'] })
    queryClient.invalidateQueries({ queryKey: ['services'] })
    queryClient.invalidateQueries({ queryKey: ['configmaps'] })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('nav.rocketmq', 'RocketMQ')}</h1>
          <p className="mt-2 text-muted-foreground">
            {t(
              'rocketmq.pageDescription',
              'Create and manage RocketMQ clusters with NameServer and Broker'
            )}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <IconPlus className="mr-2 h-4 w-4" />
          {t('rocketmq.create', 'Create RocketMQ')}
        </Button>
      </div>

      <RocketmqInstanceTable />

      <RocketmqCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={handleCreateSuccess}
      />
    </div>
  )
}
