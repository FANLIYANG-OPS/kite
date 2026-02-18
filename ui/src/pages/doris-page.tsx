import { useState } from 'react'
import { IconPlus } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { usePageTitle } from '@/hooks/use-page-title'
import { Button } from '@/components/ui/button'
import { DorisCreateDialog } from '@/components/doris-create-dialog'
import { DorisInstanceTable } from '@/components/doris-instance-table'

export function DorisPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  usePageTitle(t('nav.doris'))

  const handleCreateSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['dorisclusters'] })
    queryClient.invalidateQueries({ queryKey: ['services'] })
    queryClient.invalidateQueries({ queryKey: ['configmaps'] })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('nav.doris')}</h1>
          <p className="mt-2 text-muted-foreground">
            {t('doris.pageDescription', 'Create and manage Doris clusters in the cluster')}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <IconPlus className="mr-2 h-4 w-4" />
          {t('doris.create', 'Create Doris')}
        </Button>
      </div>

      <DorisInstanceTable />

      <DorisCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={handleCreateSuccess}
      />
    </div>
  )
}
