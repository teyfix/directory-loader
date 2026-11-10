import { dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type DirectoryLoader from './directory-loader.class';
import { configSchema, configure } from './pipeline-config.factory';
import { watchFiles } from './watch-command.utils';

export async function runPipeline(
  file: string,
  watch: boolean,
  signal: AbortSignal,
): Promise<void> {
  const script = resolve(file);
  const cwd = dirname(script);
  const previous = process.cwd();
  let loader: Pick<DirectoryLoader, 'watchPlan'> | undefined;
  let failure: { error: unknown } | undefined;
  process.chdir(cwd);
  try {
    let execution:
      | (Promise<unknown> & { loader: Pick<DirectoryLoader, 'watchPlan'> })
      | undefined;
    if (/\.ya?ml$/i.test(script)) {
      try {
        const config = configSchema.parse(
          Bun.YAML.parse(await Bun.file(script).text()),
        );
        const source = relative(resolve(cwd, config.root), script).replaceAll(
          '\\',
          '/',
        );
        execution = configure(
          {
            ...config,
            exclude: [
              ...(config.exclude ?? []),
              source.replace(/[*?[\]{}]/g, '\\$&'),
            ],
          },
          cwd,
        );
      } catch (error) {
        throw new Error(
          `Invalid pipeline config: ${script}: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
    } else {
      const pipeline = await import(pathToFileURL(script).href);
      execution =
        typeof pipeline.default === 'function'
          ? pipeline.default()
          : pipeline.default;
    }
    if (typeof execution?.loader?.watchPlan === 'function')
      loader = execution.loader;
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
      'Watch requires a valid YAML config or a default export of a load(), write() or writeAll() execution',
    );
  if (failure) console.error(failure.error);
  // shortcut: inputs are discovered once; restart watch after changing pipeline source roots.
  const plan = loader.watchPlan();
  process.exitCode = await watchFiles({
    inputs: [script, ...plan.inputs],
    excluded: plan.excluded.filter(
      (pattern) => !new Bun.Glob(pattern).match(script),
    ),
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
