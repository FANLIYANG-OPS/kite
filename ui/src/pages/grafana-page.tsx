import { useState } from 'react'
import { IconPlus } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { usePageTitle } from '@/hooks/use-page-title'
import { Button } from '@/components/ui/button'
import { GrafanaCreateDialog } from '@/components/grafana-create-dialog'
import { GrafanaInstanceTable } from '@/components/grafana-instance-table'

export function GrafanaPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  usePageTitle(t('nav.grafana'))

  const handleCreateSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['deployments'] })
    queryClient.invalidateQueries({ queryKey: ['services'] })
    queryClient.invalidateQueries({ queryKey: ['configmaps'] })
    queryClient.invalidateQueries({ queryKey: ['secrets'] })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('nav.grafana', 'Grafana')}</h1>
          <p className="mt-2 text-muted-foreground">
            {t(
              'grafana.pageDescription',
              'Create and manage Grafana instances for visualization and monitoring'
            )}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <IconPlus className="mr-2 h-4 w-4" />
          {t('grafana.create', 'Create Grafana')}
        </Button>
      </div>

      <GrafanaInstanceTable />

      <GrafanaCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={handleCreateSuccess}
      />
    </div>
  )
}
