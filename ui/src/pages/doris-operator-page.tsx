import { useState } from 'react'
import { IconPlus } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { usePageTitle } from '@/hooks/use-page-title'
import { Button } from '@/components/ui/button'
import { DorisOperatorInstallDialog } from '@/components/doris-operator-install-dialog'
import { DorisOperatorInstanceTable } from '@/components/doris-operator-instance-table'

export function DorisOperatorPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [installOpen, setInstallOpen] = useState(false)
  usePageTitle(t('nav.dorisOperator'))

  const handleInstallSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['crds'] })
    queryClient.invalidateQueries({ queryKey: ['deployments'] })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('nav.dorisOperator', 'Doris Operator')}</h1>
          <p className="mt-2 text-muted-foreground">
            {t(
              'doris.operator.pageDescription',
              'Install and manage Doris Operator for Doris cluster lifecycle management'
            )}
          </p>
        </div>
        <Button onClick={() => setInstallOpen(true)}>
          <IconPlus className="mr-2 h-4 w-4" />
          {t('doris.operator.install', 'Install Doris Operator')}
        </Button>
      </div>

      <DorisOperatorInstanceTable />

      <DorisOperatorInstallDialog
        open={installOpen}
        onOpenChange={setInstallOpen}
        onSuccess={handleInstallSuccess}
      />
    </div>
  )
}
