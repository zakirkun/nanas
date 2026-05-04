import { useEffect, useState, type ReactNode } from 'react';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster, toast } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ProblemError, problemMessage } from '@/api/problem';

type Theme = 'light' | 'dark' | 'system';

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const resolved =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme;
  root.classList.toggle('dark', resolved === 'dark');
}

function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'system';
    return (localStorage.getItem('nanas.theme') as Theme | null) ?? 'system';
  });
  useEffect(() => {
    applyTheme(theme);
    if (typeof window !== 'undefined') localStorage.setItem('nanas.theme', theme);
  }, [theme]);
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (theme === 'system') applyTheme('system');
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [theme]);
  return [theme, setTheme] as const;
}

export const ThemeContext = (() => {
  const noop = () => undefined;
  return { current: { theme: 'system' as Theme, setTheme: noop as (t: Theme) => void } };
})();

export function AppProviders({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useTheme();
  ThemeContext.current = { theme, setTheme };

  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (failureCount, error) => {
              if (error instanceof ProblemError && error.status >= 400 && error.status < 500) {
                return false;
              }
              return failureCount < 2;
            },
            refetchOnWindowFocus: false,
          },
          mutations: {
            onError: (err) => toast.error(problemMessage(err)),
          },
        },
        queryCache: new QueryCache({
          onError: (err) => {
            if (err instanceof ProblemError && err.status === 401) return;
            toast.error(problemMessage(err));
          },
        }),
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={150}>
        {children}
        <Toaster position="top-right" richColors closeButton />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
