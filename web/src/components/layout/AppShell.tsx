import { Outlet, useParams } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { BottomNav } from './BottomNav';

export function AppShell() {
  const { pid } = useParams();
  return (
    <div className="flex h-full min-h-screen flex-col md:flex-row">
      <Sidebar projectId={pid} />
      <div className="flex min-h-0 flex-1 flex-col">
        <Topbar projectId={pid} />
        <main className="flex-1 overflow-y-auto bg-background pb-16 md:pb-0">
          <div className="container max-w-screen-2xl py-6">
            <Outlet />
          </div>
        </main>
      </div>
      <BottomNav projectId={pid} />
    </div>
  );
}
