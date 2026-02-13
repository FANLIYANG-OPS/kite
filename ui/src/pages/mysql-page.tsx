import { useState } from 'react'
import { IconPlus } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { usePageTitle } from '@/hooks/use-page-title'
import { Button } from '@/components/ui/button'
import { MysqlCreateDialog } from '@/components/mysql-create-dialog'
import { MysqlInstanceTable } from '@/components/mysql-instance-table'

export function MysqlPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  usePageTitle(t('nav.mysql'))

  const handleCreateSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['statefulsets'] })
    queryClient.invalidateQueries({ queryKey: ['services'] })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('nav.mysql')}</h1>
          <p className="mt-2 text-muted-foreground">
            {t('mysql.pageDescription', 'Create and manage MySQL instances in the cluster')}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <IconPlus className="mr-2 h-4 w-4" />
          {t('mysql.create', 'Create MySQL')}
        </Button>
      </div>

      <MysqlInstanceTable />

      <MysqlCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={handleCreateSuccess}
      />
    </div>
  )
}
