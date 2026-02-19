import { useState } from 'react'
import { IconPlus } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { usePageTitle } from '@/hooks/use-page-title'
import { Button } from '@/components/ui/button'
import { DolphinschedulerCreateDialog } from '@/components/dolphinscheduler-create-dialog'
import { DolphinschedulerInstanceTable } from '@/components/dolphinscheduler-instance-table'

export function DolphinschedulerPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  usePageTitle(t('nav.dolphinscheduler'))

  const handleCreateSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['deployments'] })
    queryClient.invalidateQueries({ queryKey: ['services'] })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {t('nav.dolphinscheduler', 'DolphinScheduler')}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {t(
              'dolphinscheduler.pageDescription',
              'Create and manage DolphinScheduler instances in the cluster'
            )}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <IconPlus className="mr-2 h-4 w-4" />
          {t('dolphinscheduler.create', 'Create DolphinScheduler')}
        </Button>
      </div>

      <DolphinschedulerInstanceTable />

      <DolphinschedulerCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={handleCreateSuccess}
      />
    </div>
  )
}

