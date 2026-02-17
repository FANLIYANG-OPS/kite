import { createBrowserRouter } from 'react-router-dom'

import App from './App'
import { InitCheckRoute } from './components/init-check-route'
import { ProtectedRoute } from './components/protected-route'
import { getSubPath } from './lib/subpath'
import { CRListPage } from './pages/cr-list-page'
import { KafkaPage } from './pages/kafka-page'
import { InitializationPage } from './pages/initialization'
import { LoginPage } from './pages/login'
import { MetricsPage } from './pages/metrics-page'
import { MinioPage } from './pages/minio-page'
import { MysqlPage } from './pages/mysql-page'
import { NacosPage } from './pages/nacos-page'
import { NifiPage } from './pages/nifi-page'
import { Overview } from './pages/overview'
import { RedisPage } from './pages/redis-page'
import { ResourceDetail } from './pages/resource-detail'
import { ResourceList } from './pages/resource-list'
import { SettingsPage } from './pages/settings'
import { ZookeeperPage } from './pages/zookeeper-page'

const subPath = getSubPath()

export const router = createBrowserRouter(
  [
    {
      path: '/setup',
      element: <InitializationPage />,
    },
    {
      path: '/login',
      element: (
        <InitCheckRoute>
          <LoginPage />
        </InitCheckRoute>
      ),
    },
    {
      path: '/',
      element: (
        <InitCheckRoute>
          <ProtectedRoute>
            <App />
          </ProtectedRoute>
        </InitCheckRoute>
      ),
      children: [
        {
          index: true,
          element: <Overview />,
        },
        {
          path: 'dashboard',
          element: <Overview />,
        },
        {
          path: 'settings',
          element: <SettingsPage />,
        },
        {
          path: 'applications/mysql',
          element: <MysqlPage />,
        },
        {
          path: 'applications/redis',
          element: <RedisPage />,
        },
        {
          path: 'applications/metrics',
          element: <MetricsPage />,
        },
        {
          path: 'applications/zookeeper',
          element: <ZookeeperPage />,
        },
        {
          path: 'applications/nifi',
          element: <NifiPage />,
        },
        {
          path: 'applications/nacos',
          element: <NacosPage />,
        },
        {
          path: 'applications/minio',
          element: <MinioPage />,
        },
        {
          path: 'applications/kafka',
          element: <KafkaPage />,
        },
        {
          path: 'crds/:crd',
          element: <CRListPage />,
        },
        {
          path: 'crds/:resource/:namespace/:name',
          element: <ResourceDetail />,
        },
        {
          path: 'crds/:resource/:name',
          element: <ResourceDetail />,
        },
        {
          path: ':resource/:name',
          element: <ResourceDetail />,
        },
        {
          path: ':resource',
          element: <ResourceList />,
        },
        {
          path: ':resource/:namespace/:name',
          element: <ResourceDetail />,
        },
      ],
    },
  ],
  {
    basename: subPath,
  }
)
