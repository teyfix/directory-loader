import { isDeepStrictEqual } from 'node:util';
import { deepmergeCustom } from 'deepmerge-ts';

export type Override = {
  path: readonly string[];
  previous: string;
  source: string;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value))
  );
}

export function createMerger(warn: (event: Override) => void) {
  const sources: { file: string; value: Record<string, unknown> }[] = [];
  return (
    target: Record<string, unknown>,
    incoming: Record<string, unknown>,
    source: string,
  ) => {
    const merge = deepmergeCustom<
      Record<string, unknown>,
      Record<never, never>,
      { path: string[] }
    >({
      mergeArrays: false,
      metaDataUpdater: (parent, info) => ({
        path: [
          ...(parent?.path ?? []),
          ...(info.key === undefined ? [] : [String(info.key)]),
        ],
      }),
      filterValues: (values, meta) => {
        if (
          meta &&
          values.length > 1 &&
          !values.every(isRecord) &&
          !isDeepStrictEqual(values[0], values.at(-1))
        ) {
          const previous = sources.findLast(
            ({ value }) =>
              meta.path.reduce<unknown>(
                (node, key) =>
                  isRecord(node) && Object.hasOwn(node, key)
                    ? node[key]
                    : undefined,
                value,
              ) !== undefined,
          );
          if (previous)
            warn({ path: meta.path, previous: previous.file, source });
        }
        return values;
      },
    });
    const result = merge(target, incoming);
    sources.push({ file: source, value: incoming });
    return result;
  };
}
