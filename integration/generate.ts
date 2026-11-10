import { resolve } from 'node:path';
import directoryLoader from '../src/directory-loader.factory';
import { icu } from '../src/icu-validator.factory';

function messages(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !key.startsWith('@'))
      .map(([key, item]) => [key, messages(item)]),
  );
}

const root = resolve(import.meta.dir, 'messages');
await directoryLoader(root)
  .map(messages)
  .validate(icu({ referenceLocale: 'en', locales: ['en', 'tr'] }))
  .types()
  .split()
  .write(resolve(import.meta.dir, 'next/generated'));
await directoryLoader(root)
  .exclude('**/web.yaml')
  .arb()
  .write(resolve(import.meta.dir, 'flutter/lib/l10n'));
