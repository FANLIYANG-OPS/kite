import { useState } from 'react'
import { IconPlus } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { usePageTitle } from '@/hooks/use-page-title'
import { Button } from '@/components/ui/button'
import { MinioCreateDialog } from '@/components/minio-create-dialog'
import { MinioInstanceTable } from '@/components/minio-instance-table'

export function MinioPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  usePageTitle(t('nav.minio'))

  const handleCreateSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['statefulsets'] })
    queryClient.invalidateQueries({ queryKey: ['services'] })
    queryClient.invalidateQueries({ queryKey: ['secrets'] })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('nav.minio')}</h1>
          <p className="mt-2 text-muted-foreground">
            {t('minio.pageDescription', 'Create and manage MinIO instances in the cluster')}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <IconPlus className="mr-2 h-4 w-4" />
          {t('minio.create', 'Create MinIO')}
        </Button>
      </div>

      <MinioInstanceTable />

      <MinioCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={handleCreateSuccess}
      />
    </div>
  )
}
