import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import directoryLoader from '../src/directory-loader.factory';
import { icu } from '../src/icu-validator.factory';

const roots: string[] = [];
async function fixture(data: Record<string, unknown>) {
  const root = await mkdtemp(join(tmpdir(), 'directory-loader-arb-'));
  roots.push(root);
  for (const [file, value] of Object.entries(data))
    await Bun.write(join(root, file), JSON.stringify(value));
  return root;
}
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

function messages(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !key.startsWith('@'))
      .map(([key, item]) => [key, messages(item)]),
  );
}

test('one root catalogue produces nested JSON/literals and flat ARB with metadata', async () => {
  const output = await fixture({});
  const root = resolve('integration/messages');
  await directoryLoader(root)
    .map(messages)
    .validate(icu({ referenceLocale: 'en', locales: ['en', 'tr'] }))
    .types()
    .split()
    .write(join(output, 'next'));
  await directoryLoader(root)
    .exclude('**/web.yaml')
    .arb()
    .write(join(output, 'arb'));
  const en = await Bun.file(join(output, 'arb/en.arb')).json();
  const next = await Bun.file(join(output, 'next/en.json')).json();
  expect(en).toEqual({
    '@@locale': 'en',
    home_greeting: next.home.greeting,
    '@home_greeting': {
      description: 'Greet the signed-in person',
      placeholders: { name: { type: 'String', example: 'Ada' } },
    },
    home_items: next.home.items,
    '@home_items': { placeholders: { count: { type: 'int' } } },
    home_choice: next.home.choice,
    '@home_choice': { placeholders: { role: { type: 'String' } } },
  });
  expect(next.web.rich).toContain('<link>');
  expect(await Bun.file(join(output, 'next/en.d.json.ts')).text()).toContain(
    'Hello {name}',
  );
  expect(await Bun.file(join(output, 'arb/index.ts')).exists()).toBe(false);
});

test('ARB shares unchanged writes, stale cleanup, mode switching and prepublication validation', async () => {
  const root = await fixture({
    'en.json': { title: 'Hello' },
    'tr.json': { title: 'Merhaba' },
  });
  const output = join(root, 'generated');
  const loader = directoryLoader(root).arb();
  await loader.write(output);
  const file = join(output, 'en.arb');
  const time = (await stat(file)).mtimeMs;
  const manifest = join(output, '.directory-loader.outputs.json');
  const originalManifest = await Bun.file(manifest).text();
  await loader.write(output);
  expect((await stat(file)).mtimeMs).toBe(time);
  await Bun.write(join(root, 'tr.json'), '{"broken":false}');
  await Bun.write(join(root, 'en.json'), '{"title":"Changed"}');
  await expect(loader.write(output)).rejects.toThrow('tr.json: tr.broken');
  expect((await Bun.file(file).json()).title).toBe('Hello');
  expect(await Bun.file(manifest).text()).toBe(originalManifest);
  await Bun.write(join(output, 'unowned.arb'), '{}');
  await rm(join(root, 'tr.json'));
  await loader.write(output);
  expect(await Bun.file(join(output, 'tr.arb')).exists()).toBe(false);
  expect(await Bun.file(join(output, 'unowned.arb')).exists()).toBe(true);
  await directoryLoader(root).split().types().write(output);
  expect(await Bun.file(file).exists()).toBe(false);
  await directoryLoader(root).arb().write(output);
  expect(await Bun.file(join(output, 'index.ts')).exists()).toBe(false);
  expect(await Bun.file(join(output, 'en.json')).exists()).toBe(false);
  await expect(
    directoryLoader(root).arb().types().write(output),
  ).rejects.toThrow('types()');
  await Bun.write(manifest, '["../en.arb"]');
  await expect(loader.write(output)).rejects.toThrow('Invalid output manifest');
});

test.each([
  [{ bad: ['message'] }, 'expected a string'],
  [{ 'bad-key': 'message' }, 'invalid Dart identifier'],
  [{ 'literal.dot': 'message' }, 'invalid Dart identifier'],
  [{ '@missing': {} }, 'sibling string'],
  [{ '@@locale': 'tr', title: 'Hello' }, 'matching @@locale'],
  [{ title: 'Hello', '@title': null }, 'metadata object'],
  [{ title: 'Hello', '@title': { description: 1 } }, 'description'],
  [{ title: 'Hello', '@title': { unknown: true } }, 'supported metadata'],
  [{ title: 'Hello', '@title': { placeholders: [] } }, 'placeholders'],
  [{ title: '{name}' }, 'missing placeholder metadata'],
  [
    {
      title: 'Hello',
      '@title': { placeholders: { name: { type: 'String' } } },
    },
    'not used',
  ],
  [
    {
      title: '{name}',
      '@title': { placeholders: { name: { type: 'DateTime' } } },
    },
    'requires type',
  ],
  [
    {
      title: '{name}',
      '@title': { placeholders: { name: { type: 'String', example: 1 } } },
    },
    'string example',
  ],
  [
    {
      title: '{name, plural, other {{name}}}',
      '@title': { placeholders: { name: { type: 'String' } } },
    },
    'numeric type',
  ],
  [
    {
      title: '{name, select, other {Hi}}',
      '@title': { placeholders: { name: { type: 'int' } } },
    },
    'type String',
  ],
  [{ title: '<b>Hi</b>' }, 'unsupported ICU'],
  [{ title: '{{name}}' }, 'invalid ICU'],
  [
    {
      title: '{count, plural, other {# items}}',
      '@title': { placeholders: { count: { type: 'int' } } },
    },
    'unsupported ICU',
  ],
  [
    {
      title: '{count, plural, offset:1 other {{count} items}}',
      '@title': { placeholders: { count: { type: 'int' } } },
    },
    'offsets',
  ],
  [{ title: '{broken' }, 'invalid ICU'],
  [{ title: "Don't continue" }, 'apostrophes'],
  [
    {
      title: '{name, select, bad-key {Bad} other {Good}}',
      '@title': { placeholders: { name: { type: 'String' } } },
    },
    'invalid ICU',
  ],
  [
    {
      title: '{count, plural, =1.5 {Half} other {Other}}',
      '@title': { placeholders: { count: { type: 'int' } } },
    },
    'invalid ICU',
  ],
])(
  'invalid ARB input %j fails with source and path',
  async (value, diagnostic) => {
    const root = await fixture({ 'en/home.json': value });
    await expect(
      directoryLoader(root).arb().write(join(root, 'out')),
    ).rejects.toThrow(`en/home.json: en.home`);
    await expect(
      directoryLoader(root).arb().write(join(root, 'out')),
    ).rejects.toThrow(diagnostic);
  },
);

test.each(['class', 'localeName', 'Upper', '_private', '2bad'])(
  'rejects invalid flattened Dart member %s',
  async (name) => {
    const root = await fixture({ 'en.json': { [name]: 'Hello' } });
    await expect(
      directoryLoader(root).arb().write(join(root, 'out')),
    ).rejects.toThrow('invalid Dart identifier');
  },
);

test('flatten collisions name both sources and duplicate messages reject even equal values', async () => {
  const root = await fixture({
    'en.json': { home_title: 'A' },
    'en/home.json': { title: 'B' },
  });
  await expect(
    directoryLoader(root).arb().write(join(root, 'out')),
  ).rejects.toThrow('en.home_title (en.json)');
  await Bun.write(join(root, 'en.json'), '{"home":{"title":"B"}}');
  await expect(
    directoryLoader(root).arb().write(join(root, 'out')),
  ).rejects.toThrow(
    'en/home.json: en.home.title: duplicate ARB message from en.json',
  );
  // JSON keeps its existing override/composition contract.
  expect(await directoryLoader(root).load()).toEqual({
    en: { home: { title: 'B' } },
  });
});

test('ARB locales must agree on message keys and placeholder names/types', async () => {
  const root = await fixture({
    'en.json': {
      title: '{name}',
      '@title': { placeholders: { name: { type: 'String' } } },
    },
    'tr.json': {
      title: '{name}',
      '@title': { placeholders: { name: { type: 'int' } } },
    },
  });
  await expect(
    directoryLoader(root).arb().write(join(root, 'out')),
  ).rejects.toThrow(
    'tr.json: tr.title: ARB placeholder names or types differ from en',
  );
  await Bun.write(join(root, 'tr.json'), '{"heading":"Hello"}');
  await expect(
    directoryLoader(root).arb().write(join(root, 'out')),
  ).rejects.toThrow('tr.json: tr: ARB message keys differ from en');
});

test('the shared Next projection detects missing locales, arguments and rich tags', async () => {
  const loader = () =>
    directoryLoader(resolve('integration/messages')).map(messages);
  for (const greeting of ['Merhaba {other}', 'Merhaba <b>{name}</b>'])
    await expect(
      loader()
        .map((value, source) =>
          source.file === 'tr/home.yaml'
            ? { ...Object(value), greeting }
            : value,
        )
        .validate(icu({ referenceLocale: 'en', locales: ['en', 'tr'] }))
        .load(),
    ).rejects.toThrow('ICU arguments or rich tags differ');
  await expect(
    loader()
      .exclude('tr.yaml', 'tr/**')
      .validate(icu({ referenceLocale: 'en', locales: ['en', 'tr'] }))
      .load(),
  ).rejects.toThrow('tr');
});
