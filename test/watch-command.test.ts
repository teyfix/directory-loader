import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const available = Boolean(Bun.which('watchexec'));

test.skipIf(!available)(
  'watchexec performs initial compilation and handles additions, changes and deletions',
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'directory-loader-watch-'));
    const output = join(root, 'generated');
    await Bun.write(join(root, 'en.yaml'), 'title: Initial');
    const child = Bun.spawn(
      [
        process.execPath,
        resolve('src/directory-loader.cli.ts'),
        'load',
        '[lang].yaml',
        '--root',
        root,
        '--output',
        output,
        '--split',
        '--types',
        '--watch',
      ],
      { stdout: 'ignore', stderr: 'pipe' },
    );
    const errors = new Response(child.stderr).text();
    async function until(check: () => Promise<boolean>) {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        if (await check()) return;
        if (child.exitCode !== null)
          throw new Error(`Watcher exited: ${await errors}`);
        await Bun.sleep(40);
      }
      throw new Error('Timed out waiting for watched output');
    }
    try {
      const english = join(output, 'en.json');
      await until(() => Bun.file(english).exists());
      expect(await Bun.file(english).json()).toEqual({ title: 'Initial' });
      await Bun.write(join(root, 'en.yaml'), 'title: Changed');
      await until(
        async () => (await Bun.file(english).json()).title === 'Changed',
      );
      await Bun.write(join(root, 'tr.yaml'), 'title: Turkish');
      const turkish = join(output, 'tr.json');
      await until(() => Bun.file(turkish).exists());
      expect(await Bun.file(turkish).json()).toEqual({ title: 'Turkish' });
      await rm(join(root, 'tr.yaml'));
      await until(async () => !(await Bun.file(turkish).exists()));
    } finally {
      child.kill('SIGINT');
      await child.exited;
      await errors;
      await rm(root, { recursive: true, force: true });
    }
  },
  20000,
);

test.skipIf(!available)(
  'pipeline watch recovers from validation failure and reruns custom transforms after source and pipeline edits',
  async () => {
    const root = await mkdtemp(
      join(tmpdir(), 'directory-loader-script-watch-'),
    );
    const script = join(root, 'messages.compile.ts');
    const factory = resolve('src/directory-loader.factory.ts');
    const validator = resolve('src/icu-validator.factory.ts');
    const pipeline = (prefix: string) => `
import directoryLoader, {stripSegments} from ${JSON.stringify(factory)};
import {icu} from ${JSON.stringify(validator)};
export default directoryLoader('messages').files('[lang]/**/*.yaml')
  .path(stripSegments('components')).map(() => ({title: ${JSON.stringify(prefix)}}))
  .validate(icu({referenceLocale:'en',locales:['en','tr']}))
  .types().split().write('generated');
`;
    await Bun.write(
      join(root, 'messages/en/components/home.yaml'),
      'title: valid',
    );
    await Bun.write(script, pipeline('First'));
    const child = Bun.spawn(
      [
        process.execPath,
        resolve('src/directory-loader.cli.ts'),
        'run',
        script,
        '--watch',
      ],
      { stdout: 'ignore', stderr: 'pipe' },
    );
    let stderr = '';
    const errors = (async () => {
      const reader = child.stderr.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        stderr += new TextDecoder().decode(value);
      }
    })();
    async function until(check: () => Promise<boolean>) {
      const deadline = Date.now() + 6000;
      while (Date.now() < deadline) {
        if (await check()) return;
        if (child.exitCode !== null)
          throw new Error(`Watcher exited: ${stderr}`);
        await Bun.sleep(40);
      }
      throw new Error(`Timed out waiting for pipeline output: ${stderr}`);
    }
    try {
      await until(async () =>
        stderr.includes('tr.: expected a message object'),
      );
      await Bun.write(
        join(root, 'messages/tr/components/home.yaml'),
        'title: valid',
      );
      const output = join(root, 'generated/en.json');
      await until(() => Bun.file(output).exists());
      expect(await Bun.file(output).json()).toEqual({
        home: { title: 'First' },
      });
      await Bun.write(script, pipeline('After edit'));
      await until(
        async () => (await Bun.file(output).json()).home.title === 'After edit',
      );
      await Bun.write(
        join(root, 'messages/en/components/extra.yaml'),
        'title: extra',
      );
      await Bun.write(
        join(root, 'messages/tr/components/extra.yaml'),
        'title: extra',
      );
      await until(async () => Boolean((await Bun.file(output).json()).extra));
      expect((await Bun.file(output).json()).extra).toEqual({
        title: 'After edit',
      });
      expect(await Bun.file(join(root, 'generated/index.ts')).exists()).toBe(
        true,
      );
    } finally {
      child.kill('SIGINT');
      await child.exited;
      await errors;
      await rm(root, { recursive: true, force: true });
    }
  },
  25000,
);
