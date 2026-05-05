export type PreferredLocale = 'en' | 'id';

export interface ProblemMessage {
  id?: string;
  en?: string;
}

export interface ProblemFieldError {
  field?: string;
  message?: ProblemMessage;
}

export interface ProblemBody {
  type?: string;
  code: string;
  message?: ProblemMessage;
  message_preferred?: string;
  instance?: string;
  errors?: ProblemFieldError[];
}

function pickLocalizedMessage(message: ProblemMessage | undefined, preferred: PreferredLocale): string | undefined {
  if (!message) return undefined;
  if (preferred === 'id') return message.id ?? message.en;
  return message.en ?? message.id;
}

export function pickProblemMessage(body: ProblemBody, preferred: PreferredLocale): string {
  if (body.message_preferred) return body.message_preferred;
  const fromObj = pickLocalizedMessage(body.message, preferred);
  if (fromObj) return fromObj;
  return body.code;
}

export class ProblemError extends Error {
  status: number;
  body: ProblemBody;
  fieldErrors: ProblemFieldError[];
  readonly preferredLocale: PreferredLocale;

  constructor(status: number, body: ProblemBody, preferredLocale: PreferredLocale = 'en') {
    super(pickProblemMessage(body, preferredLocale));
    this.name = 'ProblemError';
    this.status = status;
    this.body = body;
    this.fieldErrors = body.errors ?? [];
    this.preferredLocale = preferredLocale;
  }

  fieldMessage(field: string): string | undefined {
    const e = this.fieldErrors.find((f) => f.field === field);
    return pickLocalizedMessage(e?.message, this.preferredLocale);
  }
}

export function isProblem(value: unknown): value is ProblemBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof (value as { code: unknown }).code === 'string'
  );
}

export function problemMessage(err: unknown): string {
  if (err instanceof ProblemError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
