/** Mirrors backend miniox.ValidateObjectKey: no leading `/`, no `..`, no control chars, max 1024. */
export function validateObjectKey(key: string): string | null {
  if (!key) return 'Key required';
  if (key.length > 1024) return 'Key too long';
  if (key.startsWith('/')) return "Key may not start with '/'";
  if (/(^|\/)\.\.(\/|$)/.test(key)) return "Key may not contain '..'";
  if (/[\x00-\x1f\x7f]/.test(key)) return 'Key contains control characters';
  return null;
}
