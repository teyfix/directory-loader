import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import directoryLoader, {
  type Override,
} from '../src/directory-loader.factory';

const roots: string[] = [];
async function fixture(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), 'directory-loader-'));
  roots.push(root);
  for (const [path, content] of Object.entries(files))
    await Bun.write(join(root, path), content);
  return root;
}
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

test('broad files merge before deeper files, warning only for changed values', async () => {
  const root = await fixture({
    'en/home.yaml':
      'meta:\n  title: Home\n  description: Welcome\nlinks: [first, second]\n',
    'en/home/meta.json5': '{ title: "Homepage", description: "Welcome" }',
    'en/home/links.json': '["only"]',
  });
  const warnings: Override[] = [];
  const result = await directoryLoader(root)
    .files(
      '[lang]/**/*.yaml',
      '[lang]/**/*.json5',
      '[lang]/**/*.json',
      '[lang]/**/*',
    )
    .onOverride((event) => warnings.push(event))
    .openFiles(1)
    .load();
  expect(result).toEqual({
    en: {
      home: {
        meta: { title: 'Homepage', description: 'Welcome' },
        links: ['only'],
      },
    },
  });
  expect(warnings).toEqual([
    {
      path: ['en', 'home', 'links'],
      previous: 'en/home.yaml',
      source: 'en/home/links.json',
    },
    {
      path: ['en', 'home', 'meta', 'title'],
      previous: 'en/home.yaml',
      source: 'en/home/meta.json5',
    },
  ]);
});

test('native codecs parse to values; transforms and path mapping remain chained', async () => {
  const root = await fixture({
    'a.json': '{"value":1}',
    'b.json5': '{value:2,}',
    'c.jsonc': '{// comment\n"value":3}',
    'd.toml': 'value=4',
    'e.yaml': 'value: 5',
    'f.jsonl': '{"value":6}\n{"value":7}',
    'g.xml': '<value>8</value>',
    'h.txt': 'custom',
  });
  const data = await directoryLoader(root)
    .add('txt', (source) => source.toUpperCase())
    .path(({ path }) => ['data', ...path])
    .map((value) => value)
    .load();
  expect(data).toEqual({
    data: {
      a: { value: 1 },
      b: { value: 2 },
      c: { value: 3 },
      d: { value: 4 },
      e: { value: 5 },
      f: [{ value: 6 }, { value: 7 }],
      g: { value: '8' },
      h: 'CUSTOM',
    },
  });
  expect(
    await directoryLoader(root)
      .clear()
      .add({ ext: ['yaml'], parser: Bun.YAML })
      .load(),
  ).toEqual({ e: { value: 5 } });
  expect(
    await directoryLoader(root).remove('yml').files('*.yaml').load(),
  ).toEqual({});
});

test('i18n strings, plural structures, arrays, ARB metadata and literal dotted keys survive', async () => {
  const messages = {
    '@@locale': 'en',
    '@greeting': { placeholders: { name: { type: 'String' } } },
    greeting: 'Hello {name}',
    count: '{count, plural, one {# item} other {# items}}',
    i18next: 'Hello {{name}}',
    rich: 'Click <link>here</link>',
    nested: { one: 'One', other: 'Many' },
    values: ['a', 'b'],
    'literal.dot': 'kept',
  };
  const root = await fixture({ 'en/home.arb': JSON.stringify(messages) });
  expect(await directoryLoader(root).load()).toEqual({
    en: { home: messages },
  });
});

test('split JSON and literal declarations stay current without rewriting unchanged output', async () => {
  const root = await fixture({
    'en/home.yaml': 'title: Hello {name}',
    'tr/home.yaml': 'title: Merhaba {name}',
  });
  const output = join(root, 'generated');
  const loader = directoryLoader(root).types().split();
  await loader.write(output);
  const time = (await stat(join(output, 'en.json'))).mtimeMs;
  await loader.write(output);
  expect((await stat(join(output, 'en.json'))).mtimeMs).toBe(time);
  expect(await Bun.file(join(output, 'en.d.json.ts')).text()).toContain(
    '"title": "Hello {name}"',
  );
  await Bun.write(join(output, 'unowned.txt'), 'keep');
  await rm(join(root, 'tr/home.yaml'));
  await loader.write(output);
  expect(await Bun.file(join(output, 'tr.json')).exists()).toBe(false);
  expect(await Bun.file(join(output, 'tr.d.json.ts')).exists()).toBe(false);
  expect(await Bun.file(join(output, 'unowned.txt')).text()).toBe('keep');
  await directoryLoader(root).split().write(output);
  expect(await Bun.file(join(output, 'en.d.json.ts')).exists()).toBe(false);
});

test('invalid input fails before replacing successful output', async () => {
  const root = await fixture({ 'en.json': '{"title":"valid"}' });
  const output = join(root, 'output.json');
  const loader = directoryLoader(root);
  await loader.write(output);
  const original = await Bun.file(output).text();
  await Bun.write(join(root, 'en.json'), '{invalid');
  await expect(loader.write(output)).rejects.toThrow('Cannot load en.json');
  expect(await Bun.file(output).text()).toBe(original);
  expect(() => directoryLoader(root).openFiles(0)).toThrow();
});

test('CLI uses Bunli help, forwards patterns and returns failure status', async () => {
  const root = await fixture({
    'en.yaml': 'title: Home',
    'tr.yaml': 'title: Ana sayfa',
  });
  const cli = resolve('src/directory-loader.cli.ts');
  const run = async (...args: string[]) => {
    const child = Bun.spawn([process.execPath, cli, 'load', ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    return {
      code: await child.exited,
      out: await new Response(child.stdout).text(),
      err: await new Response(child.stderr).text(),
    };
  };
  expect((await run('--help')).out).toContain('--watch');
  const output = join(root, 'out.json');
  const success = await run(
    '--root',
    root,
    '--output',
    output,
    '--types',
    '--',
    '[lang].yaml',
  );
  expect(success.code).toBe(0);
  expect(await Bun.file(output).json()).toEqual({
    en: { title: 'Home' },
    tr: { title: 'Ana sayfa' },
  });
  const failed = await run('--types=maybe', '--root', root);
  expect(failed.code).not.toBe(0);
  await Bun.write(join(root, 'en.yaml'), 'title: [unterminated');
  expect((await run('--root', root, '--', '[lang].yaml')).code).not.toBe(0);
});
