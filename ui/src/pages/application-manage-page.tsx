import { useTranslation } from 'react-i18next'

import { usePageTitle } from '@/hooks/use-page-title'

interface ApplicationManagePageProps {
  appKey: 'mysql' | 'redis'
}

export function ApplicationManagePage({ appKey }: ApplicationManagePageProps) {
  const { t } = useTranslation()
  const title = t(`nav.${appKey}`)
  usePageTitle(title)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-2 text-muted-foreground">
          {t('applications.comingSoon')}
        </p>
      </div>
    </div>
  )
}
