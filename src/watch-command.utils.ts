import { relative, resolve } from 'node:path';
import { globPattern, watchRoot } from './path-pattern.utils';

type WatchFlags = {
  root: string;
  output?: string;
  types: boolean;
  split: boolean;
};

export async function watchFiles(options: {
  inputs: readonly string[];
  excluded: readonly string[];
  command: readonly string[];
  cwd: string;
  signal: AbortSignal;
}): Promise<number> {
  if (!Bun.which('watchexec'))
    throw new Error('--watch requires watchexec on PATH');
  const roots = [...new Set(options.inputs.map(watchRoot))];
  const command = [
    'watchexec',
    '--on-busy-update',
    'queue',
    '--shell=none',
    ...roots.flatMap((root) => ['--watch', root]),
    ...options.inputs.flatMap((pattern) => [
      '--filter',
      relative(options.cwd, pattern),
    ]),
    ...options.excluded.flatMap((pattern) => ['--ignore', pattern]),
    '--ignore',
    '**/*.d.json.ts',
    '--ignore',
    '**/*.outputs.json',
    '--ignore',
    '**/.directory-loader.outputs.json',
    '--ignore',
    '**/*.tmp',
  ];
  command.push('--', ...options.command);
  const child = Bun.spawn(command, {
    cwd: options.cwd,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
    signal: options.signal,
  });
  return await child.exited;
}

export async function watch(
  patterns: string[],
  flags: WatchFlags,
  signal: AbortSignal,
): Promise<number> {
  const cwd = resolve(flags.root);
  const inputs = patterns.map((pattern) => resolve(cwd, globPattern(pattern)));
  const output = flags.output ? resolve(flags.output) : undefined;
  if (output && inputs.some((pattern) => watchRoot(pattern) === output))
    throw new Error('Output must not be a watch root');
  const command = [
    process.execPath,
    resolve(Bun.argv[1] ?? import.meta.path),
    'load',
    '--root',
    cwd,
  ];
  if (output) command.push('--output', output);
  if (flags.types) command.push('--types');
  if (flags.split) command.push('--split');
  command.push('--', ...patterns);
  return watchFiles({
    inputs,
    excluded: output ? [output, `${output}.*`] : [],
    command,
    cwd,
    signal,
  });
}
