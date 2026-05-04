import { Languages, Sun, Moon, Monitor } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { setLanguage, type SupportedLanguage } from '@/i18n';
import { ThemeContext } from '@/app/providers';

export function LangSwitch() {
  const { t, i18n } = useTranslation();
  const current: SupportedLanguage = i18n.language?.startsWith('id') ? 'id' : 'en';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('common.language')}>
          <Languages className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('common.language')}</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => setLanguage('en')} aria-checked={current === 'en'}>
          {t('common.english')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setLanguage('id')} aria-checked={current === 'id'}>
          {t('common.indonesian')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ThemeSwitch() {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('common.theme')}>
          <Sun className="h-4 w-4 dark:hidden" />
          <Moon className="hidden h-4 w-4 dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('common.theme')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => ThemeContext.current.setTheme('light')}>
          <Sun className="mr-2 h-4 w-4" /> {t('common.light')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => ThemeContext.current.setTheme('dark')}>
          <Moon className="mr-2 h-4 w-4" /> {t('common.dark')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => ThemeContext.current.setTheme('system')}>
          <Monitor className="mr-2 h-4 w-4" /> {t('common.system')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
