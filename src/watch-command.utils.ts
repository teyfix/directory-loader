import { relative, resolve } from 'node:path';
import { globPattern, watchRoot } from './path-pattern.utils';

type WatchFlags = {
  root: string;
  output?: string;
  types: boolean;
  split: boolean;
};

export async function watch(
  patterns: string[],
  flags: WatchFlags,
  signal: AbortSignal,
): Promise<number> {
  if (!Bun.which('watchexec'))
    throw new Error('--watch requires watchexec on PATH');
  const cwd = resolve(flags.root);
  const inputs = patterns.map((pattern) => resolve(cwd, globPattern(pattern)));
  const roots = [...new Set(inputs.map(watchRoot))];
  const output = flags.output ? resolve(flags.output) : undefined;
  if (output && roots.some((root) => root === output))
    throw new Error('Output must not be a watch root');
  const command = [
    'watchexec',
    '--on-busy-update',
    'queue',
    '--shell=none',
    ...roots.flatMap((root) => ['--watch', root]),
    ...inputs.flatMap((pattern) => ['--filter', relative(cwd, pattern)]),
  ];
  if (flags.output)
    command.push(
      '--ignore',
      resolve(flags.output),
      '--ignore',
      `${resolve(flags.output)}.*`,
    );
  command.push(
    '--ignore',
    '**/*.d.json.ts',
    '--ignore',
    '**/*.outputs.json',
    '--ignore',
    '**/.directory-loader.outputs.json',
    '--ignore',
    '**/*.tmp',
  );
  command.push(
    '--',
    process.execPath,
    resolve(Bun.argv[1] ?? import.meta.path),
    'load',
    '--root',
    cwd,
  );
  if (flags.output) command.push('--output', resolve(flags.output));
  if (flags.types) command.push('--types');
  if (flags.split) command.push('--split');
  command.push('--', ...patterns);
  const child = Bun.spawn(command, {
    cwd,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
    signal,
  });
  return await child.exited;
}
