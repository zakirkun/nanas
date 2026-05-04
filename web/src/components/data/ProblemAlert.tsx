import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ProblemError, problemMessage } from '@/api/problem';

interface ProblemAlertProps {
  error: unknown;
  title?: string;
}

export function ProblemAlert({ error, title }: ProblemAlertProps) {
  if (!error) return null;
  const message = problemMessage(error);
  const code = error instanceof ProblemError ? error.body.code : null;
  const fields = error instanceof ProblemError ? error.fieldErrors : [];
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{title ?? code ?? 'Error'}</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        {fields.length > 0 ? (
          <ul className="mt-2 list-disc pl-5 text-xs">
            {fields.map((f, i) => (
              <li key={`${f.field}-${i}`}>
                <span className="font-mono">{f.field ?? '?'}</span>
                {': '}
                {f.message?.en ?? f.message?.id ?? ''}
              </li>
            ))}
          </ul>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
