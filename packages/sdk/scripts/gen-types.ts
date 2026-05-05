#!/usr/bin/env tsx
/**
 * Generates `src/gen/types.ts` from the repository-root `openapi.yaml`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SDK_ROOT = resolve(__dirname, '..');
const SPEC = resolve(SDK_ROOT, '..', '..', 'openapi.yaml');
const OUT = resolve(SDK_ROOT, 'src', 'gen', 'types.ts');

async function main(): Promise<void> {
  const ast = await openapiTS(new URL(`file://${SPEC.replace(/\\/g, '/')}`), {
    alphabetize: true,
    enum: true,
  });
  const contents =
    '/* eslint-disable */\n' +
    '/**\n' +
    ' * AUTO-GENERATED — do not edit. Regenerate with `pnpm run generate`.\n' +
    ` * Source: ${SPEC.replace(/\\/g, '/')}\n` +
    ' */\n' +
    astToString(ast);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, contents, 'utf8');
  console.log(`[@nanas/sdk gen-types] wrote ${OUT}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
