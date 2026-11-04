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
