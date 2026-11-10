#!/usr/bin/env bun
import { createCLI, defineCommand, option } from '@bunli/core';
import { z } from 'zod';
import { version } from '../package.json';
import directoryLoader from './directory-loader.factory';
import { runPipeline } from './pipeline-runner.utils';
import { watch } from './watch-command.utils';

export async function main(args = Bun.argv.slice(2)): Promise<void> {
  const cli = await createCLI({
    name: 'directory-loader',
    version,
    description: 'Compose structured files using paths as namespaces.',
  });
  cli.command(
    defineCommand({
      name: 'load',
      description:
        'Merge matching files; optionally emit JSON and literal declarations.',
      options: {
        root: option(z.string().default('.'), {
          description: 'Directory containing the input patterns',
        }),
        output: option(z.string().optional(), {
          short: 'o',
          description: 'JSON file, or directory with --split',
        }),
        types: option(z.boolean().default(false), {
          argumentKind: 'flag',
          description: 'Emit literal TypeScript declarations',
        }),
        split: option(z.boolean().default(false), {
          argumentKind: 'flag',
          description: 'Emit a JSON file per top-level key',
        }),
        watch: option(z.boolean().default(false), {
          short: 'w',
          argumentKind: 'flag',
          description: 'Rerun through watchexec on matching changes',
        }),
      },
      handler: async ({ flags, positional, signal }) => {
        const patterns = positional.length ? positional : ['**/*'];
        if (!flags.output && (flags.types || flags.split))
          throw new Error('--types and --split require --output');
        if (flags.watch) {
          process.exitCode = await watch(patterns, flags, signal);
          return;
        }
        const loader = directoryLoader(flags.root).files(...patterns);
        if (flags.types) loader.types();
        if (flags.split) loader.split();
        if (flags.output) await loader.write(flags.output);
        else console.log(JSON.stringify(await loader.load(), null, 2));
      },
    }),
  );
  cli.command(
    defineCommand({
      name: 'run',
      description:
        'Run a YAML config or TypeScript pipeline; defaults to .directory-loader.yaml.',
      options: {
        watch: option(z.boolean().default(false), {
          short: 'w',
          argumentKind: 'flag',
          description: 'Rerun the pipeline through watchexec',
        }),
      },
      handler: async ({ positional, flags, signal }) => {
        const file =
          z.array(z.string()).max(1).parse(positional)[0] ??
          '.directory-loader.yaml';
        await runPipeline(file, flags.watch, signal);
      },
    }),
  );
  await cli.run(args);
}

if (import.meta.main) await main();
