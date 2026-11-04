import {
  type MessageFormatElement,
  parse,
  TYPE,
} from '@formatjs/icu-messageformat-parser';
import type { Validator } from './directory-loader.class';
import { isRecord } from './merge.utils';

type Signature = [string, string[]][];

function signature(elements: MessageFormatElement[]): Signature {
  const argumentsByName = new Map<string, Set<string>>();
  function visit(items: MessageFormatElement[]) {
    for (const element of items) {
      if (element.type === TYPE.literal || element.type === TYPE.pound)
        continue;
      const key = `${element.type === TYPE.tag ? 'tag' : 'argument'}:${element.value}`;
      const kinds = argumentsByName.get(key) ?? new Set<string>();
      const kind =
        element.type === TYPE.argument
          ? 'value'
          : element.type === TYPE.number || element.type === TYPE.plural
            ? 'number'
            : element.type === TYPE.date || element.type === TYPE.time
              ? 'date'
              : element.type === TYPE.tag
                ? 'rich'
                : 'string';
      kinds.add(kind);
      argumentsByName.set(key, kinds);
      if (element.type === TYPE.tag) visit(element.children);
      if (element.type === TYPE.plural || element.type === TYPE.select)
        for (const option of Object.values(element.options))
          visit(option.value);
    }
  }
  visit(elements);
  return [...argumentsByName]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, kinds]) => {
      if (kinds.delete('value') && !kinds.size) kinds.add('string');
      return [key, [...kinds].sort()];
    });
}

function messages(
  value: unknown,
  locale: string,
  path: string[] = [],
): Map<string, Signature> {
  if (!isRecord(value))
    throw new Error(`${locale}.${path.join('.')}: expected a message object`);
  const result = new Map<string, Signature>();
  for (const [key, item] of Object.entries(value)) {
    const segments = [...path, key];
    if (typeof item === 'string') {
      try {
        result.set(JSON.stringify(segments), signature(parse(item)));
      } catch (error) {
        throw new Error(
          `${locale}.${segments.join('.')}: invalid ICU message`,
          { cause: error },
        );
      }
    } else {
      for (const [nested, parsed] of messages(item, locale, segments))
        result.set(nested, parsed);
    }
  }
  return result;
}

/** Validate nested ICU catalogues; locale-specific plural categories may differ. */
export function icu(options: {
  referenceLocale: string;
  locales?: readonly string[];
}): Validator {
  return (data) => {
    const reference = messages(
      data[options.referenceLocale],
      options.referenceLocale,
    );
    const expected = [...reference.keys()].sort();
    for (const locale of options.locales ?? Object.keys(data)) {
      if (locale === options.referenceLocale) continue;
      const candidate = messages(data[locale], locale);
      if (!Bun.deepEquals([...candidate.keys()].sort(), expected))
        throw new Error(
          `${locale}: message keys differ from ${options.referenceLocale}`,
        );
      for (const [key, arguments_] of reference) {
        if (!Bun.deepEquals(candidate.get(key), arguments_))
          throw new Error(
            `${locale}.${JSON.parse(key).join('.')}: ICU arguments or rich tags differ from ${options.referenceLocale}`,
          );
      }
    }
  };
}
