import { useState } from 'react'
import { IconPlus } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { usePageTitle } from '@/hooks/use-page-title'
import { Button } from '@/components/ui/button'
import { HortonworksCreateDialog } from '@/components/hortonworks-create-dialog'
import { HortonworksInstanceTable } from '@/components/hortonworks-instance-table'

export function HortonworksPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  usePageTitle(t('nav.hortonworks'))

  const handleCreateSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['deployments'] })
    queryClient.invalidateQueries({ queryKey: ['services'] })
    queryClient.invalidateQueries({ queryKey: ['configmaps'] })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('nav.hortonworks', 'Hortonworks')}</h1>
          <p className="mt-2 text-muted-foreground">
            {t(
              'hortonworks.pageDescription',
              'Create and manage Hortonworks Schema Registry instances in the cluster'
            )}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <IconPlus className="mr-2 h-4 w-4" />
          {t('hortonworks.create', 'Create Hortonworks')}
        </Button>
      </div>

      <HortonworksInstanceTable />

      <HortonworksCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={handleCreateSuccess}
      />
    </div>
  )
}
