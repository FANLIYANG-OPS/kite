import { useState } from 'react'
import { IconPlus } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { usePageTitle } from '@/hooks/use-page-title'
import { Button } from '@/components/ui/button'
import { ElasticOperatorInstallDialog } from '@/components/elastic-operator-install-dialog'
import { ElasticOperatorInstanceTable } from '@/components/elastic-operator-instance-table'

export function ElasticOperatorPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [installOpen, setInstallOpen] = useState(false)
  usePageTitle(t('nav.elasticOperator'))

  const handleInstallSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['statefulsets'] })
    queryClient.invalidateQueries({ queryKey: ['crds'] })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('nav.elasticOperator', 'Elastic Operator')}</h1>
          <p className="mt-2 text-muted-foreground">
            {t(
              'elasticOperator.pageDescription',
              'Install and manage ECK (Elastic Cloud on Kubernetes) Operator'
            )}
          </p>
        </div>
        <Button onClick={() => setInstallOpen(true)}>
          <IconPlus className="mr-2 h-4 w-4" />
          {t('elasticOperator.install', 'Install Elastic Operator')}
        </Button>
      </div>

      <ElasticOperatorInstanceTable />

      <ElasticOperatorInstallDialog
        open={installOpen}
        onOpenChange={setInstallOpen}
        onSuccess={handleInstallSuccess}
      />
    </div>
  )
}
