import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import directoryLoader, {
  recaseSegments,
  redirectPaths,
  stripSegments,
} from '../src/directory-loader.factory';
import { icu } from '../src/icu-validator.factory';

const roots: string[] = [];
async function fixture(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), 'directory-loader-pipeline-'));
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

test('path helpers compose, preserve locale prefixes and prefer specific redirects', async () => {
  const root = await fixture({
    'en-US/studio/page-composition/components/workbench.yaml': 'title: Pages',
  });
  const result = await directoryLoader(root)
    .path(stripSegments('components'))
    .path(
      redirectPaths({
        workbench: 'wrong',
        'studio/page-composition/workbench': 'studio/page-composition',
      }),
      recaseSegments('camel', 1),
    )
    .load();
  expect(result).toEqual({
    'en-US': { studio: { pageComposition: { title: 'Pages' } } },
  });
});

test('assembled validators run in sequence, await async validation and preserve previous output on failure', async () => {
  const root = await fixture({
    'en/home.yaml': 'title: Hello',
    'tr/home.yaml': 'title: Merhaba',
  });
  const output = join(root, 'generated');
  const seen: string[] = [];
  const loader = directoryLoader(root)
    .split()
    .types()
    .validate(async (data) => {
      await Bun.sleep(1);
      expect(data).toHaveProperty('en.home.title');
      seen.push('async');
    })
    .validate(icu({ referenceLocale: 'en', locales: ['en', 'tr'] }))
    .validate(() => {
      seen.push('last');
    });
  await loader.write(output);
  expect(seen).toEqual(['async', 'last']);
  const index = await import(pathToFileURL(join(output, 'index.ts')).href);
  expect(index.catalogues).toEqual({
    en: { home: { title: 'Hello' } },
    tr: { home: { title: 'Merhaba' } },
  });
  expect(await Bun.file(join(output, 'index.ts')).text()).toContain(
    'export type Messages',
  );
  await Bun.write(join(root, 'tr/home.yaml'), 'heading: Wrong key');
  await expect(loader.write(output)).rejects.toThrow('tr: message keys differ');
  expect(await Bun.file(join(output, 'tr.json')).json()).toEqual({
    home: { title: 'Merhaba' },
  });
});

test('ICU validator compares typed arguments and rich tags while allowing locale-specific plurals', () => {
  const validate = icu({ referenceLocale: 'en', locales: ['en', 'tr'] });
  expect(() =>
    validate({
      en: {
        count: '{count, plural, one {{count} thing} other {# things}}',
        rich: '<link>Hi {name}</link>',
      },
      tr: {
        count: '{count, plural, other {# şey}}',
        rich: '<link>Merhaba {name}</link>',
      },
    }),
  ).not.toThrow();
  expect(() =>
    validate({
      en: { title: '{value, number}' },
      tr: { title: '{value, date}' },
    }),
  ).toThrow('ICU arguments');
  expect(() =>
    validate({ en: { title: '{name}' }, tr: { title: '{other}' } }),
  ).toThrow('ICU arguments');
  expect(() =>
    validate({ en: { title: '<b>Hi</b>' }, tr: { title: '<i>Hi</i>' } }),
  ).toThrow('rich tags');
  expect(() =>
    validate({ en: { title: '{broken' }, tr: { title: 'Hello' } }),
  ).toThrow('en.title: invalid ICU');
  expect(() => validate({ en: { title: 'Hello' } })).toThrow('tr');
  expect(() => validate({ en: { title: 1 }, tr: { title: 'Hello' } })).toThrow(
    'expected a message object',
  );
});

test('run executes the exported pipeline relative to its file and returns validation errors', async () => {
  const root = await fixture({
    'messages/en/home.yaml': 'title: Hello {name}',
    'messages/tr/home.yaml': 'title: Merhaba {name}',
  });
  const factory = pathToFileURL(
    resolve('src/directory-loader.factory.ts'),
  ).href;
  const validator = pathToFileURL(resolve('src/icu-validator.factory.ts')).href;
  await Bun.write(
    join(root, 'messages.compile.ts'),
    `
import directoryLoader from ${JSON.stringify(factory)};
import { icu } from ${JSON.stringify(validator)};
export default directoryLoader('messages').types().split()
  .validate(icu({referenceLocale: 'en', locales: ['en','tr']})).write('generated');
`,
  );
  const run = async () => {
    const child = Bun.spawn(
      [
        process.execPath,
        resolve('src/directory-loader.cli.ts'),
        'run',
        join(root, 'messages.compile.ts'),
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    const output = new Response(child.stdout).text();
    const errors = new Response(child.stderr).text();
    return {
      code: await child.exited,
      output: await output,
      errors: await errors,
    };
  };
  expect((await run()).code).toBe(0);
  expect(await Bun.file(join(root, 'generated/en.json')).json()).toEqual({
    home: { title: 'Hello {name}' },
  });
  await Bun.write(
    join(root, 'messages/tr/home.yaml'),
    'title: Merhaba {other}',
  );
  expect((await run()).code).not.toBe(0);
});
