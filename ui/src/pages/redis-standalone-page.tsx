import { useState } from 'react'
import { IconPlus } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { usePageTitle } from '@/hooks/use-page-title'
import { Button } from '@/components/ui/button'
import { RedisStandaloneCreateDialog } from '@/components/redis-standalone-create-dialog'
import { RedisStandaloneInstanceTable } from '@/components/redis-standalone-instance-table'

export function RedisStandalonePage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  usePageTitle(t('nav.redisStandalone'))

  const handleCreateSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['statefulsets'] })
    queryClient.invalidateQueries({ queryKey: ['services'] })
    queryClient.invalidateQueries({ queryKey: ['configmaps'] })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {t('nav.redisStandalone', 'Redis Standalone')}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {t(
              'redisStandalone.pageDescription',
              'Create and manage Redis Standalone instances in the cluster'
            )}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <IconPlus className="mr-2 h-4 w-4" />
          {t('redisStandalone.create', 'Create Redis Standalone')}
        </Button>
      </div>

      <RedisStandaloneInstanceTable />

      <RedisStandaloneCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={handleCreateSuccess}
      />
    </div>
  )
}
