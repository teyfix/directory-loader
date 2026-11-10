import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import directoryLoader, { writeAll } from '../src/directory-loader.factory';
import { configSchema, configure } from '../src/pipeline-config.factory';

const roots: string[] = [];
async function fixture(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), 'directory-loader-config-'));
  roots.push(root);
  for (const [file, content] of Object.entries(files))
    await Bun.write(join(root, file), content);
  return root;
}
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
const cli = resolve('src/directory-loader.cli.ts');
async function run(root: string, ...args: string[]) {
  const child = Bun.spawn([process.execPath, cli, 'run', ...args], {
    cwd: root,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const out = new Response(child.stdout).text();
  const err = new Response(child.stderr).text();
  return { code: await child.exited, out: await out, err: await err };
}
const config = `
root: messages
files: ['[lang]/**/*.yaml']
validation:
  icu:
    referenceLocale: en
    locales: [en, tr]
outputs:
  web:
    format: json
    directory: generated/web
    types: true
    metadata: omit
  mobile:
    format: arb
    directory: generated/mobile
    exclude: ['**/web.yaml']
`;
const home = (message: string) => `title: '${message} {name}'
'@title':
  placeholders:
    name:
      type: String
`;

test('a config inside its own source root is excluded from data', async () => {
  const root = await fixture({
    'settings[local].yaml':
      'root: .\noutputs:\n  data:\n    format: json\n    directory: out',
    'en.yaml': 'title: Hello',
  });
  expect((await run(root, 'settings[local].yaml')).code).toBe(0);
  expect(await Bun.file(join(root, 'out/en.json')).json()).toEqual({
    title: 'Hello',
  });
  expect(await Bun.file(join(root, 'out/settings[local].json')).exists()).toBe(
    false,
  );
});

test('TypeScript multi-output pipelines retain callbacks and await every preparation', async () => {
  const root = await fixture({ 'messages/en.yaml': 'title: Hello' });
  const factory = resolve('src/directory-loader.factory.ts');
  await Bun.write(
    join(root, 'compile.ts'),
    `
import directoryLoader, {writeAll} from ${JSON.stringify(factory)};
export default writeAll({
  first: {loader: directoryLoader('messages').map(() => ({title: 'Custom'})).split(), output: 'first'},
  second: {loader: directoryLoader('messages').split(), output: 'second'},
});
`,
  );
  expect((await run(root, 'compile.ts')).code).toBe(0);
  expect(await Bun.file(join(root, 'first/en.json')).json()).toEqual({
    title: 'Custom',
  });
  let finished = false;
  await expect(
    writeAll({
      failing: {
        loader: directoryLoader(join(root, 'messages'))
          .validate(() => {
            throw new Error('Rejected');
          })
          .split(),
        output: join(root, 'first'),
      },
      delayed: {
        loader: directoryLoader(join(root, 'messages'))
          .validate(async () => {
            await Bun.sleep(30);
            finished = true;
          })
          .split(),
        output: join(root, 'second'),
      },
    }),
  ).rejects.toThrow('Cannot prepare output failing: Rejected');
  expect(finished).toBe(true);
});

test('default YAML config resolves paths from its own directory and emits both targets', async () => {
  const root = await fixture({
    '.directory-loader.yaml': config,
    'messages/en/home.yaml': home('Hello'),
    'messages/tr/home.yaml': home('Merhaba'),
    'messages/en/web.yaml': "rich: '<b>Hi</b>'",
    'messages/tr/web.yaml': "rich: '<b>Selam</b>'",
  });
  expect((await run(root)).code).toBe(0);
  const json = join(root, 'generated/web/en.json');
  const arb = join(root, 'generated/mobile/en.arb');
  expect(await Bun.file(json).json()).toEqual({
    home: { title: 'Hello {name}' },
    web: { rich: '<b>Hi</b>' },
  });
  expect(await Bun.file(arb).json()).toEqual({
    '@@locale': 'en',
    home_title: 'Hello {name}',
    '@home_title': { placeholders: { name: { type: 'String' } } },
  });
  expect(
    await Bun.file(join(root, 'generated/web/en.d.json.ts')).text(),
  ).toContain('Hello {name}');
  const time = (await stat(arb)).mtimeMs;
  expect((await run(tmpdir(), join(root, '.directory-loader.yaml'))).code).toBe(
    0,
  );
  expect((await stat(arb)).mtimeMs).toBe(time);
});

test('any target validation or manifest failure preserves every previous target', async () => {
  const root = await fixture({
    '.directory-loader.yaml': config,
    'messages/en/home.yaml': home('Hello'),
    'messages/tr/home.yaml': home('Merhaba'),
  });
  expect((await run(root)).code).toBe(0);
  const file = join(root, 'generated/web/en.json');
  const original = await Bun.file(file).text();
  await Bun.write(
    join(root, 'messages/en/home.yaml'),
    home('Changed').replace('type: String', 'type: DateTime'),
  );
  const failed = await run(root);
  expect(failed.code).not.toBe(0);
  expect(failed.err).toContain('placeholder requires type');
  expect(await Bun.file(file).text()).toBe(original);
  await Bun.write(join(root, 'messages/en/home.yaml'), home('Changed'));
  await Bun.write(
    join(root, 'generated/mobile/.directory-loader.outputs.json'),
    '["../escape.arb"]',
  );
  expect((await run(root)).code).not.toBe(0);
  expect(await Bun.file(file).text()).toBe(original);
});

test('config composes existing path helpers and supports aggregate JSON', async () => {
  const root = await fixture({
    'messages/en/components/my-page.yaml': 'title: Hello',
  });
  await configure(
    {
      root: 'messages',
      path: [
        { strip: ['components'] },
        { redirect: { 'my-page': 'home-page' } },
        { recase: { casing: 'camel', skip: 1 } },
      ],
      outputs: { aggregate: { format: 'json', file: 'all.json', types: true } },
    },
    root,
  );
  expect(await Bun.file(join(root, 'all.json')).json()).toEqual({
    en: { homePage: { title: 'Hello' } },
  });
  expect(await Bun.file(join(root, 'all.d.json.ts')).exists()).toBe(true);
});

test('strict config schema and editor schema reject unsupported combinations', async () => {
  const valid = {
    root: 'messages',
    outputs: { web: { format: 'json', directory: 'out' } },
  };
  for (const invalid of [
    { ...valid, typo: true },
    { ...valid, outputs: {} },
    { ...valid, files: [] },
    { ...valid, path: [{ eval: 'code' }] },
    {
      ...valid,
      outputs: { mobile: { format: 'arb', directory: 'out', types: true } },
    },
    {
      ...valid,
      outputs: { web: { format: 'json', directory: 'out', file: 'out.json' } },
    },
  ])
    expect(configSchema.safeParse(invalid).success).toBe(false);
  expect(await Bun.file(resolve('config.schema.json')).json()).toEqual(
    z.toJSONSchema(configSchema),
  );
  const root = await fixture({
    '.directory-loader.yaml': 'root: messages\noutputs: {}\ntypos: true',
  });
  const failed = await run(root);
  expect(failed.err).toContain('.directory-loader.yaml');
  expect(failed.err).toContain('typos');
});

test('coordinated builders reject overlapping ownership and exclude every owned target', async () => {
  const root = await fixture({ 'en.yaml': 'title: Hello' });
  const output = join(root, 'generated');
  await expect(
    writeAll({
      a: { loader: directoryLoader(root).split(), output },
      b: { loader: directoryLoader(root).arb(), output },
    }),
  ).rejects.toThrow('Overlapping output paths');
  const targets = () => ({
    a: { loader: directoryLoader(root).split(), output },
    b: { loader: directoryLoader(root).arb(), output: join(root, 'native') },
  });
  await writeAll(targets());
  await writeAll(targets());
  expect(await Bun.file(join(output, 'en.json')).json()).toEqual({
    title: 'Hello',
  });
  await rm(join(root, 'en.yaml'));
  await writeAll(targets());
  expect(await Bun.file(join(output, 'en.json')).exists()).toBe(false);
  expect(await Bun.file(join(root, 'native/en.arb')).exists()).toBe(false);
});

test('config watch handles target-specific inputs, validation recovery and config edits', async () => {
  const root = await fixture({
    '.directory-loader.yaml': config,
    'messages/en/home.yaml': home('Hello'),
    'messages/tr/home.yaml': home('Merhaba'),
    'messages/en/web.yaml': 'title: Web',
    'messages/tr/web.yaml': 'title: Web',
  });
  const child = Bun.spawn([process.execPath, cli, 'run', '--watch'], {
    cwd: root,
    stdout: 'ignore',
    stderr: 'pipe',
  });
  let stderr = '';
  const errors = (async () => {
    for await (const data of child.stderr)
      stderr += new TextDecoder().decode(data);
  })();
  const web = join(root, 'generated/web/en.json');
  const mobile = join(root, 'generated/mobile/en.arb');
  async function until(check: () => Promise<boolean>) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if (await check()) return;
      if (child.exitCode !== null) throw new Error(`Watcher exited: ${stderr}`);
      await Bun.sleep(40);
    }
    throw new Error(`Timed out: ${stderr}`);
  }
  try {
    await until(() => Bun.file(mobile).exists());
    await Bun.write(join(root, 'messages/en/web.yaml'), 'title: Edited');
    await until(
      async () => (await Bun.file(web).json()).web.title === 'Edited',
    );
    await Bun.write(
      join(root, 'messages/en/home.yaml'),
      home('Changed').replace('type: String', 'type: DateTime'),
    );
    await until(async () => stderr.includes('placeholder requires type'));
    expect((await Bun.file(web).json()).home.title).toBe('Hello {name}');
    expect((await Bun.file(mobile).json()).home_title).toBe('Hello {name}');
    await Bun.write(join(root, 'messages/en/home.yaml'), home('Recovered'));
    await until(
      async () =>
        (await Bun.file(mobile).json()).home_title === 'Recovered {name}',
    );
    await Bun.write(join(root, '.directory-loader.yaml'), 'outputs: [');
    await until(async () => stderr.includes('Invalid pipeline config:'));
    expect((await Bun.file(mobile).json()).home_title).toBe('Recovered {name}');
    await Bun.write(
      join(root, '.directory-loader.yaml'),
      config.replace('types: true', 'types: false'),
    );
    await until(
      async () =>
        !(await Bun.file(join(root, 'generated/web/en.d.json.ts')).exists()),
    );
    const time = (await stat(mobile)).mtimeMs;
    await Bun.sleep(500);
    expect((await stat(mobile)).mtimeMs).toBe(time);
  } finally {
    child.kill('SIGINT');
    await child.exited;
    await errors;
  }
}, 40000);
