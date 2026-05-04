import { describe, expect, it, beforeAll } from 'vitest';
import i18n from '@/i18n';
import { ProblemError, isProblem, problemMessage } from './problem';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

describe('isProblem', () => {
  it('accepts an object with a string code', () => {
    expect(isProblem({ code: 'X' })).toBe(true);
  });
  it('rejects null, undefined, and non-objects', () => {
    expect(isProblem(null)).toBe(false);
    expect(isProblem(undefined)).toBe(false);
    expect(isProblem('VALIDATION_ERROR')).toBe(false);
    expect(isProblem({ message: 'no code' })).toBe(false);
  });
});

describe('ProblemError', () => {
  it('uses message_preferred when present', () => {
    const err = new ProblemError(400, {
      code: 'VALIDATION_ERROR',
      message: { en: 'Validation failed.', id: 'Validasi gagal.' },
      message_preferred: 'Validation failed.',
    });
    expect(err.message).toBe('Validation failed.');
    expect(err.body.code).toBe('VALIDATION_ERROR');
    expect(err.status).toBe(400);
  });

  it('falls back to the locale message when message_preferred is absent', async () => {
    await i18n.changeLanguage('id');
    const err = new ProblemError(400, {
      code: 'X',
      message: { en: 'English', id: 'Indonesia' },
    });
    expect(err.message).toBe('Indonesia');
    await i18n.changeLanguage('en');
  });

  it('falls back to the code when no message is provided', () => {
    const err = new ProblemError(500, { code: 'INTERNAL_ERROR' });
    expect(err.message).toBe('INTERNAL_ERROR');
  });

  it('exposes field-level localised messages', () => {
    const err = new ProblemError(400, {
      code: 'VALIDATION_ERROR',
      errors: [
        { field: 'email', message: { en: 'Bad email', id: 'Email salah' } },
        { field: 'password', message: { en: 'Too short', id: 'Terlalu pendek' } },
      ],
    });
    expect(err.fieldMessage('email')).toBe('Bad email');
    expect(err.fieldMessage('password')).toBe('Too short');
    expect(err.fieldMessage('missing')).toBeUndefined();
  });
});

describe('problemMessage', () => {
  it('handles ProblemError, Error, and primitives', () => {
    expect(problemMessage(new ProblemError(400, { code: 'X', message: { en: 'fail' } }))).toBe(
      'fail',
    );
    expect(problemMessage(new Error('boom'))).toBe('boom');
    expect(problemMessage('plain')).toBe('plain');
  });
});
