import { resolve, sep } from 'node:path';
import type DirectoryLoader from './directory-loader.class';

export type Outputs = Record<
  string,
  { loader: DirectoryLoader; output: string }
>;

/** Prepare every target before publishing any; retain the same CLI watch contract. */
export function writeAll(outputs: Outputs) {
  const entries = Object.entries(outputs);
  const paths = entries.map(([, entry]) => resolve(entry.output));
  const execute = async () => {
    if (!entries.length) throw new Error('At least one output is required');
    if (
      new Set(entries.map(([, entry]) => entry.loader)).size !== entries.length
    )
      throw new Error('Each output requires a separate loader');
    for (let index = 0; index < paths.length; index++)
      for (const previous of paths.slice(0, index))
        if (
          paths[index] === previous ||
          paths[index].startsWith(`${previous}${sep}`) ||
          previous.startsWith(`${paths[index]}${sep}`)
        )
          throw new Error(
            `Overlapping output paths: ${previous} and ${paths[index]}`,
          );
    const results = await Promise.allSettled(
      entries.map(([, entry], index) =>
        entry.loader.prepare(paths[index], paths),
      ),
    );
    const prepared = results.map((result, index) => {
      if (result.status === 'rejected')
        throw new Error(
          `Cannot prepare output ${entries[index][0]}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
          { cause: result.reason },
        );
      return result.value;
    });
    const owners = new Map<string, string>();
    for (const [index, target] of prepared.entries())
      for (const file of new Set(target.files.map((file) => resolve(file)))) {
        const previous = owners.get(file);
        const name = entries[index][0];
        if (previous !== undefined)
          throw new Error(
            `Output ${file} is owned by both ${previous} and ${name}`,
          );
        owners.set(file, name);
      }
    for (const target of prepared) await target.publish();
    return Object.fromEntries(
      entries.map(([name], index) => [name, prepared[index].data]),
    );
  };
  return Object.assign(execute(), {
    loader: {
      watchPlan() {
        const plans = entries.map(([, entry]) => entry.loader.watchPlan());
        return {
          inputs: [...new Set(plans.flatMap((plan) => plan.inputs))],
          excluded: [...new Set(plans[0]?.excluded ?? [])].filter((pattern) =>
            plans.every((plan) => plan.excluded.includes(pattern)),
          ),
        };
      },
    },
  });
}
