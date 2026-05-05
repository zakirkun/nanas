import { describe, expect, it } from 'vitest';
import { ProblemError, pickProblemMessage } from './problem.js';

describe('pickProblemMessage', () => {
  it('prefers message_preferred', () => {
    expect(
      pickProblemMessage({ code: 'X', message_preferred: 'p', message: { en: 'e' } }, 'en'),
    ).toBe('p');
  });

  it('uses locale-aware message fallback', () => {
    expect(
      pickProblemMessage({ code: 'X', message: { en: 'hello', id: 'halo' } }, 'id'),
    ).toBe('halo');
    expect(pickProblemMessage({ code: 'X', message: { en: 'hello', id: 'halo' } }, 'en')).toBe(
      'hello',
    );
  });

  it('falls back to code', () => {
    expect(pickProblemMessage({ code: 'BAD' }, 'en')).toBe('BAD');
  });
});

describe('ProblemError', () => {
  it('surfaces field-level message with locale', () => {
    const err = new ProblemError(
      400,
      {
        code: 'VALIDATION_ERROR',
        message: { en: 'root' },
        errors: [{ field: 'email', message: { en: 'bad email', id: 'email salah' } }],
      },
      'id',
    );
    expect(err.fieldMessage('email')).toBe('email salah');
  });
});
