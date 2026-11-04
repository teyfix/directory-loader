import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import DirectoryLoader from './directory-loader.class';
import { watchFiles } from './watch-command.utils';

export async function runPipeline(
  file: string,
  watch: boolean,
  signal: AbortSignal,
): Promise<void> {
  const script = resolve(file);
  const cwd = dirname(script);
  const previous = process.cwd();
  let loader: DirectoryLoader | undefined;
  let failure: { error: unknown } | undefined;
  process.chdir(cwd);
  try {
    const pipeline = await import(pathToFileURL(script).href);
    const execution =
      typeof pipeline.default === 'function'
        ? pipeline.default()
        : pipeline.default;
    if (execution?.loader instanceof DirectoryLoader) loader = execution.loader;
    await execution;
  } catch (error) {
    failure = { error };
  } finally {
    process.chdir(previous);
  }
  if (!watch) {
    if (failure) throw failure.error;
    return;
  }
  if (!loader)
    throw new Error(
      'Watch requires a default export of the load() or write() execution',
    );
  if (failure) console.error(failure.error);
  // shortcut: inputs are discovered once; restart watch after changing pipeline source roots.
  const plan = loader.watchPlan();
  process.exitCode = await watchFiles({
    inputs: [script, ...plan.inputs],
    excluded: plan.excluded,
    command: [
      process.execPath,
      resolve(Bun.argv[1] ?? import.meta.path),
      'run',
      script,
    ],
    cwd,
    signal,
  });
}
