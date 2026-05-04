import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LogIn, KeyRound } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProblemAlert } from '@/components/data/ProblemAlert';
import { LangSwitch, ThemeSwitch } from '@/components/layout/LangSwitch';
import { api } from '@/api/client';
import { useSession } from '@/auth/session';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const setSession = useSession((s) => s.setSession);
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<'jwt' | 'api_key'>('jwt');
  const [apiKey, setApiKey] = useState('');

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: FormValues) => {
    setError(null);
    setSubmitting(true);
    try {
      const { data, error: err } = await api.POST('/auth/login', { body: values });
      if (err) throw err;
      const token = (data as { token?: string } | undefined)?.token;
      if (!token) throw new Error('No token returned');
      setSession({ token, mode: 'jwt' });
      const dest = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      navigate(dest && dest !== '/login' ? dest : '/app', { replace: true });
    } catch (e) {
      setError(e);
    } finally {
      setSubmitting(false);
    }
  };

  const useApiKey = () => {
    if (!apiKey.trim()) return;
    setSession({ token: apiKey.trim(), mode: 'api_key' });
    navigate('/app', { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-muted/30 to-primary/5 p-4">
      <div className="absolute right-4 top-4 flex gap-1">
        <ThemeSwitch />
        <LangSwitch />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">{t('auth.loginTitle')}</CardTitle>
          <CardDescription>
            {mode === 'jwt' ? t('auth.loginSubtitle') : t('auth.apiKeyHelper')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <ProblemAlert error={error} /> : null}
          {mode === 'jwt' ? (
            <form className="space-y-3" onSubmit={form.handleSubmit(onSubmit)} noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="email">{t('common.email')}</Label>
                <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
                {form.formState.errors.email ? (
                  <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">{t('common.password')}</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  {...form.register('password')}
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                <LogIn className="mr-2 h-4 w-4" />
                {t('auth.login')}
              </Button>
            </form>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="api-key">{t('auth.useApiKey')}</Label>
                <Input
                  id="api-key"
                  placeholder={t('auth.apiKeyPlaceholder')}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </div>
              <Button onClick={useApiKey} className="w-full" disabled={!apiKey.trim()}>
                <KeyRound className="mr-2 h-4 w-4" />
                {t('auth.login')}
              </Button>
            </div>
          )}
          <Button
            variant="link"
            size="sm"
            className="w-full"
            onClick={() => setMode(mode === 'jwt' ? 'api_key' : 'jwt')}
          >
            {mode === 'jwt' ? t('auth.useApiKey') : t('auth.useJwt')}
          </Button>
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            {t('auth.noAccount')}{' '}
            <Link to="/register" className="font-medium text-primary underline-offset-4 hover:underline">
              {t('auth.register')}
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
