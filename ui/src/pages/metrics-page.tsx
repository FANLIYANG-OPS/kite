import { useState } from 'react'
import { IconPlus } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { usePageTitle } from '@/hooks/use-page-title'
import { Button } from '@/components/ui/button'
import { MetricsInstallDialog } from '@/components/metrics-install-dialog'
import { MetricsInstanceTable } from '@/components/metrics-instance-table'

export function MetricsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [installOpen, setInstallOpen] = useState(false)
  usePageTitle(t('nav.metrics'))

  const handleInstallSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['deployments'] })
    queryClient.invalidateQueries({ queryKey: ['daemonsets'] })
    queryClient.invalidateQueries({ queryKey: ['services'] })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('nav.metrics', 'Metrics')}</h1>
          <p className="mt-2 text-muted-foreground">
            {t('metrics.pageDescription', 'Install metrics-server, kube-state-metrics, node-exporter and Prometheus for cluster monitoring')}
          </p>
        </div>
        <Button onClick={() => setInstallOpen(true)}>
          <IconPlus className="mr-2 h-4 w-4" />
          {t('metrics.install', 'Install')}
        </Button>
      </div>

      <MetricsInstanceTable />

      <MetricsInstallDialog
        open={installOpen}
        onOpenChange={setInstallOpen}
        onSuccess={handleInstallSuccess}
      />
    </div>
  )
}
