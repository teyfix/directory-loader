import { resolve } from 'node:path';
import DirectoryLoader from './directory-loader.class';
import { icu, stripMessageMetadata } from './icu-validator.factory';
import { type Outputs, writeAll } from './multi-output.utils';
import {
  recaseSegments,
  redirectPaths,
  stripSegments,
} from './path-transform.utils';
import { configSchema } from './pipeline-config.schema';

export { configSchema, type PipelineConfig } from './pipeline-config.schema';

/** Interpret configuration through the same builders used by TypeScript pipelines. */
export function configure(input: unknown, base = process.cwd()) {
  const config = configSchema.parse(input);
  const outputs: Outputs = Object.create(null);
  for (const [name, target] of Object.entries(config.outputs)) {
    const loader = new DirectoryLoader([resolve(base, config.root)])
      .files(...(target.files ?? config.files ?? ['**/*']))
      .exclude(...(config.exclude ?? []), ...(target.exclude ?? []));
    for (const transform of [...(config.path ?? []), ...(target.path ?? [])]) {
      if ('strip' in transform) loader.path(stripSegments(...transform.strip));
      else if ('redirect' in transform)
        loader.path(redirectPaths(transform.redirect));
      else
        loader.path(
          recaseSegments(transform.recase.casing, transform.recase.skip),
        );
    }
    if ((target.metadata ?? config.metadata) === 'omit')
      loader.map(stripMessageMetadata);
    const validation = target.validation ?? config.validation;
    if (validation) {
      const validate = icu(validation.icu);
      loader.validate((data) => validate(stripMessageMetadata(data)));
    }
    if (target.format === 'arb') loader.arb();
    else {
      if ('directory' in target) loader.split();
      if (target.types) loader.types();
    }
    outputs[name] = {
      loader,
      output: resolve(
        base,
        'directory' in target ? target.directory : target.file,
      ),
    };
  }
  return writeAll(outputs);
}
