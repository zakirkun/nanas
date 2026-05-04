import i18n from 'i18next';

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

export class ProblemError extends Error {
  status: number;
  body: ProblemBody;
  fieldErrors: ProblemFieldError[];

  constructor(status: number, body: ProblemBody) {
    const lang = (i18n.language || 'en').toLowerCase().startsWith('id') ? 'id' : 'en';
    const fallback = body.message_preferred ?? body.message?.[lang] ?? body.message?.en ?? body.code;
    super(fallback);
    this.name = 'ProblemError';
    this.status = status;
    this.body = body;
    this.fieldErrors = body.errors ?? [];
  }

  /** Returns the field-level message for `field` if any, falling back to the global message. */
  fieldMessage(field: string): string | undefined {
    const e = this.fieldErrors.find((f) => f.field === field);
    if (!e?.message) return undefined;
    const lang = (i18n.language || 'en').toLowerCase().startsWith('id') ? 'id' : 'en';
    return e.message[lang] ?? e.message.en ?? e.message.id;
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
