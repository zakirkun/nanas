import { describe, expect, it } from 'vitest';
import { validateObjectKey } from './objectKey';

describe('validateObjectKey', () => {
  it('rejects empty keys', () => {
    expect(validateObjectKey('')).toMatch(/required/);
  });
  it('rejects keys with leading slash', () => {
    expect(validateObjectKey('/leading')).toMatch(/may not start with/);
  });
  it('rejects ".." traversal segments', () => {
    expect(validateObjectKey('a/../b')).toMatch(/'\.\.'/);
    expect(validateObjectKey('../boot')).toMatch(/'\.\.'/);
    expect(validateObjectKey('end/..')).toMatch(/'\.\.'/);
  });
  it('rejects control characters', () => {
    expect(validateObjectKey('foo\nbar')).toMatch(/control/);
    expect(validateObjectKey('hi\x00there')).toMatch(/control/);
  });
  it('accepts realistic keys', () => {
    expect(validateObjectKey('documents/report.pdf')).toBeNull();
    expect(validateObjectKey('artifacts/abc/0.1.0.tar.gz')).toBeNull();
    expect(validateObjectKey('a..b')).toBeNull();
    expect(validateObjectKey('._hidden')).toBeNull();
  });
  it('rejects keys longer than 1024 chars', () => {
    expect(validateObjectKey('a'.repeat(1025))).toMatch(/too long/);
  });
});
