import { useMemo } from 'react';
import CodeMirror, { type Extension } from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import { json } from '@codemirror/lang-json';
import { javascript } from '@codemirror/lang-javascript';
import { cn } from '@/lib/utils';

export type CodeLanguage = 'sql' | 'json' | 'javascript' | 'plain';

interface CodeEditorProps {
  value: string;
  onChange?: (next: string) => void;
  language?: CodeLanguage;
  minHeight?: string;
  className?: string;
  readOnly?: boolean;
  placeholder?: string;
}

export function CodeEditor({
  value,
  onChange,
  language = 'plain',
  minHeight = '160px',
  className,
  readOnly,
  placeholder,
}: CodeEditorProps) {
  const extensions = useMemo<Extension[]>(() => {
    switch (language) {
      case 'sql':
        return [sql()];
      case 'json':
        return [json()];
      case 'javascript':
        return [javascript({ typescript: true })];
      default:
        return [];
    }
  }, [language]);

  const theme = typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light';

  return (
    <div className={cn('overflow-hidden', className)}>
      <CodeMirror
        value={value}
        height="auto"
        minHeight={minHeight}
        extensions={extensions}
        onChange={(v) => onChange?.(v)}
        readOnly={readOnly}
        placeholder={placeholder}
        theme={theme}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLine: !readOnly,
          foldGutter: false,
          highlightSelectionMatches: true,
        }}
      />
    </div>
  );
}
