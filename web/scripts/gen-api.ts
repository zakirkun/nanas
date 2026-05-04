#!/usr/bin/env tsx
/**
 * Generates `src/api/types.ts` from the repository-level `openapi.yaml`.
 * Run via `pnpm gen:api`. Re-run whenever the OpenAPI spec changes.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SPEC = resolve(ROOT, '..', 'openapi.yaml');
const OUT = resolve(ROOT, 'src', 'api', 'types.ts');

async function main() {
  const ast = await openapiTS(new URL(`file://${SPEC.replace(/\\/g, '/')}`), {
    alphabetize: true,
    enum: true,
  });
  const contents =
    '/* eslint-disable */\n' +
    '/**\n' +
    ' * AUTO-GENERATED — do not edit. Regenerate with `pnpm gen:api`.\n' +
    ` * Source: ${SPEC.replace(/\\/g, '/')}\n` +
    ' */\n' +
    astToString(ast);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, contents, 'utf8');
  console.log(`[gen:api] wrote ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
