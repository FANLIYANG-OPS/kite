import { useState } from 'react'
import { IconPlus } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { usePageTitle } from '@/hooks/use-page-title'
import { Button } from '@/components/ui/button'
import { ZookeeperCreateDialog } from '@/components/zookeeper-create-dialog'
import { ZookeeperInstanceTable } from '@/components/zookeeper-instance-table'

export function ZookeeperPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  usePageTitle(t('nav.zookeeper'))

  const handleCreateSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['statefulsets'] })
    queryClient.invalidateQueries({ queryKey: ['services'] })
    queryClient.invalidateQueries({ queryKey: ['configmaps'] })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('nav.zookeeper', 'Zookeeper')}</h1>
          <p className="mt-2 text-muted-foreground">
            {t('zookeeper.pageDescription', 'Create and manage Zookeeper clusters in the cluster')}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <IconPlus className="mr-2 h-4 w-4" />
          {t('zookeeper.create', 'Create Zookeeper')}
        </Button>
      </div>

      <ZookeeperInstanceTable />

      <ZookeeperCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={handleCreateSuccess}
      />
    </div>
  )
}
