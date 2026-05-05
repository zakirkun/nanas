import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom';
import { RequireAuth, RequirePlatformRole, RedirectIfAuthed } from '@/auth/guards';
import { AppShell } from '@/components/layout/AppShell';

import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { ProjectsListPage } from '@/features/projects/ProjectsListPage';
import { ProjectDetailLayout } from '@/features/projects/ProjectDetailLayout';
import { ProjectOverviewTab } from '@/features/projects/ProjectOverviewTab';
import { ProjectMembersTab } from '@/features/projects/ProjectMembersTab';
import { ProjectApiKeysTab } from '@/features/projects/ProjectApiKeysTab';
import { ProjectSettingsTab } from '@/features/projects/ProjectSettingsTab';

import { DatabaseLayout } from '@/features/database/DatabaseLayout';
import { MigratePage } from '@/features/database/MigratePage';
import { QueryConsolePage } from '@/features/database/QueryConsolePage';
import { TablesCatalogPage } from '@/features/database/TablesCatalogPage';
import { TablesBrowserPage } from '@/features/database/TablesBrowserPage';
import { GraphQLPlaygroundPage } from '@/features/database/GraphQLPlaygroundPage';
import { DatabasesPage } from '@/features/database/DatabasesPage';

import { StorageBrowserPage } from '@/features/storage/StorageBrowserPage';

import { FunctionListPage } from '@/features/functions/FunctionListPage';
import { FunctionDetailLayout } from '@/features/functions/FunctionDetailLayout';
import { EditorTab } from '@/features/functions/EditorTab';
import { VersionsTab } from '@/features/functions/VersionsTab';
import { BuildsTab } from '@/features/functions/BuildsTab';
import { DeploymentsTab } from '@/features/functions/DeploymentsTab';
import { InvokeTab } from '@/features/functions/InvokeTab';
import { EntrypointTab } from '@/features/functions/EntrypointTab';

import { TriggersListPage } from '@/features/triggers/TriggersListPage';
import { DLQPage } from '@/features/triggers/DLQPage';
import { CDCSubscriptionsPage } from '@/features/triggers/CDCSubscriptionsPage';

import { ObservabilityLayout } from '@/features/observability/ObservabilityLayout';
import { LogsViewerPage } from '@/features/observability/LogsViewerPage';
import { MetricsPage } from '@/features/observability/MetricsPage';
import { TracesPage } from '@/features/observability/TracesPage';
import { AuditLogPage } from '@/features/observability/AuditLogPage';

import { RealtimeStreamPage } from '@/features/realtime/RealtimeStreamPage';

import { MarketplaceListPage } from '@/features/marketplace/MarketplaceListPage';
import { MarketplaceDetailPage } from '@/features/marketplace/MarketplaceDetailPage';
import { IntegrationsPage } from '@/features/integrations/IntegrationsPage';

import { AdminUsersPage } from '@/features/admin/AdminUsersPage';
import { AdminProjectsPage } from '@/features/admin/AdminProjectsPage';

const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/app" replace /> },
  {
    path: '/login',
    element: (
      <RedirectIfAuthed>
        <LoginPage />
      </RedirectIfAuthed>
    ),
  },
  {
    path: '/register',
    element: (
      <RedirectIfAuthed>
        <RegisterPage />
      </RedirectIfAuthed>
    ),
  },
  {
    path: '/app',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="projects" replace /> },
      { path: 'projects', element: <ProjectsListPage /> },
      {
        path: 'projects/:pid',
        element: <ProjectDetailLayout />,
        children: [
          { index: true, element: <ProjectOverviewTab /> },
          { path: 'members', element: <ProjectMembersTab /> },
          { path: 'keys', element: <ProjectApiKeysTab /> },
          { path: 'settings', element: <ProjectSettingsTab /> },
        ],
      },
      {
        path: 'projects/:pid/database',
        element: <DatabaseLayout />,
        children: [
          { index: true, element: <Navigate to="query" replace /> },
          { path: 'migrate', element: <MigratePage /> },
          { path: 'query', element: <QueryConsolePage /> },
          { path: 'catalog', element: <TablesCatalogPage /> },
          { path: 'databases', element: <DatabasesPage /> },
          { path: 'tables', element: <TablesBrowserPage /> },
          { path: 'graphql', element: <GraphQLPlaygroundPage /> },
        ],
      },
      { path: 'projects/:pid/storage', element: <StorageBrowserPage /> },
      { path: 'projects/:pid/integrations', element: <IntegrationsPage /> },
      { path: 'projects/:pid/integrations', element: <IntegrationsPage /> },
      { path: 'projects/:pid/functions', element: <FunctionListPage /> },
      {
        path: 'projects/:pid/functions/:fid',
        element: <FunctionDetailLayout />,
        children: [
          { index: true, element: <Navigate to="editor" replace /> },
          { path: 'editor', element: <EditorTab /> },
          { path: 'versions', element: <VersionsTab /> },
          { path: 'builds', element: <BuildsTab /> },
          { path: 'deployments', element: <DeploymentsTab /> },
          { path: 'invoke', element: <InvokeTab /> },
          { path: 'entrypoint', element: <EntrypointTab /> },
        ],
      },
      { path: 'projects/:pid/triggers', element: <TriggersListPage /> },
      { path: 'projects/:pid/triggers/dlq', element: <DLQPage /> },
      { path: 'projects/:pid/triggers/cdc', element: <CDCSubscriptionsPage /> },
      { path: 'projects/:pid/realtime', element: <RealtimeStreamPage /> },
      {
        path: 'projects/:pid/observability',
        element: <ObservabilityLayout />,
        children: [
          { index: true, element: <Navigate to="logs" replace /> },
          { path: 'logs', element: <LogsViewerPage /> },
          { path: 'traces', element: <TracesPage /> },
          { path: 'metrics', element: <MetricsPage /> },
        ],
      },
      { path: 'projects/:pid/audit', element: <AuditLogPage /> },
      { path: 'marketplace', element: <MarketplaceListPage /> },
      { path: 'marketplace/:slug', element: <MarketplaceDetailPage /> },
      {
        path: 'admin/users',
        element: (
          <RequirePlatformRole role="staff">
            <AdminUsersPage />
          </RequirePlatformRole>
        ),
      },
      {
        path: 'admin/projects',
        element: (
          <RequirePlatformRole role="staff">
            <AdminProjectsPage />
          </RequirePlatformRole>
        ),
      },
    ],
  },
  { path: '*', element: <Navigate to="/app" replace /> },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
