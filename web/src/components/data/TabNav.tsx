import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface TabItem {
  to: string;
  label: ReactNode;
  end?: boolean;
}

export function TabNav({ items }: { items: TabItem[] }) {
  return (
    <div className="border-b">
      <nav className="-mb-px flex flex-wrap gap-2">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'border-b-2 px-3 py-2 text-sm transition-colors',
                'border-transparent text-muted-foreground hover:text-foreground',
                isActive && 'border-primary text-foreground',
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
