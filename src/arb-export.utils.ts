import {
  type MessageFormatElement,
  parse,
  TYPE,
} from '@formatjs/icu-messageformat-parser';
import { isRecord } from './merge.utils';

const reserved = new Set(
  `abstract as assert async augment await base break case catch class const continue covariant default deferred do dynamic else enum export extends extension external factory false final finally for Function get hide if implements import in interface is late library mixin native new null of on operator part required rethrow return sealed set show static super switch sync this throw true try type typedef var void when while with yield localeName delegate localizationsDelegates supportedLocales hashCode runtimeType noSuchMethod toString`.split(
    ' ',
  ),
);

/** Validate and flatten the bounded ARB input contract before publication. */
export function arbCatalogues(
  data: Record<string, unknown>,
  source?: (path: string[]) => string | undefined,
): Map<string, Record<string, unknown>> {
  const result = new Map<string, Record<string, unknown>>();
  let reference:
    | { locale: string; signatures: Map<string, string> }
    | undefined;
  function fail(path: string[], reason: string): never {
    let file: string | undefined;
    for (let length = path.length; length >= 0 && !file; length--)
      file = source?.(path.slice(0, length));
    throw new Error(`${file ? `${file}: ` : ''}${path.join('.')}: ${reason}`);
  }
  const identifier = (name: string, path: string[]) => {
    if (!/^[a-z][a-zA-Z0-9_]*$/.test(name) || reserved.has(name))
      fail(path, `invalid Dart identifier ${JSON.stringify(name)}`);
  };
  for (const [locale, tree] of Object.entries(data)) {
    if (
      !/^[a-z]{2,3}(?:_[A-Z][a-z]{3})?(?:_(?:[A-Z]{2}|[0-9]{3}))?$/.test(locale)
    )
      fail([locale], 'expected a locale such as en, tr or zh_Hant_TW');
    const output: Record<string, unknown> = { '@@locale': locale };
    const paths = new Map<string, string[]>();
    const signatures = new Map<string, string>();
    const visit = (node: unknown, path: string[]) => {
      if (!isRecord(node)) fail(path, 'expected a message object');
      for (const [key, value] of Object.entries(node)) {
        const location = [...path, key];
        if (key.startsWith('@@')) {
          if (key !== '@@locale' || path.length !== 1 || value !== locale)
            fail(
              location,
              'only matching @@locale at the locale root is supported',
            );
          continue;
        }
        if (key.startsWith('@')) {
          if (typeof node[key.slice(1)] !== 'string')
            fail(location, 'metadata must name a sibling string message');
          continue;
        }
        if (!key.length) fail(location, 'empty namespace or message key');
        if (isRecord(value)) {
          visit(value, location);
          continue;
        }
        if (typeof value !== 'string')
          fail(location, 'expected a string message');
        if (value.replaceAll("''", '').includes("'"))
          fail(
            location,
            'single ASCII apostrophes have different ICU/Flutter escaping rules; use doubled apostrophes or typographic apostrophes',
          );
        const name = location.slice(1).join('_');
        identifier(name, location);
        const previous = paths.get(name);
        if (previous)
          fail(
            location,
            `flattened key ${name} collides with ${previous.join('.')} (${source?.(previous) ?? 'assembled catalogue'})`,
          );
        paths.set(name, location);
        const metadataPath = [...path, `@${key}`];
        const metadata = node[`@${key}`];
        if (metadata !== undefined) {
          if (!isRecord(metadata))
            fail(metadataPath, 'expected metadata object');
          for (const [attribute, item] of Object.entries(metadata)) {
            if (attribute === 'description' && typeof item === 'string')
              continue;
            if (attribute === 'placeholders' && isRecord(item)) continue;
            fail(
              [...metadataPath, attribute],
              'supported metadata: description (string), placeholders (object)',
            );
          }
        }
        const placeholders =
          isRecord(metadata) && isRecord(metadata.placeholders)
            ? metadata.placeholders
            : {};
        for (const [argument, attributes] of Object.entries(placeholders)) {
          const argumentPath = [...metadataPath, 'placeholders', argument];
          identifier(argument, argumentPath);
          if (
            !isRecord(attributes) ||
            typeof attributes.type !== 'string' ||
            !['String', 'int', 'double', 'num'].includes(attributes.type)
          )
            fail(
              argumentPath,
              'placeholder requires type String, int, double or num',
            );
          for (const [attribute, item] of Object.entries(attributes))
            if (
              attribute !== 'type' &&
              !(attribute === 'example' && typeof item === 'string')
            )
              fail(
                [...argumentPath, attribute],
                'only type and string example are supported',
              );
        }
        const arguments_ = new Set<string>();
        const inspect = (elements: MessageFormatElement[]) => {
          for (const element of elements) {
            if (element.type === TYPE.literal) continue;
            if (
              element.type !== TYPE.argument &&
              element.type !== TYPE.select &&
              element.type !== TYPE.plural
            )
              fail(
                location,
                'unsupported ICU syntax: use interpolation, cardinal plural or select; rich tags, # and formatters require a consumer-specific message',
              );
            const argument = element.value;
            identifier(argument, location);
            arguments_.add(argument);
            const attributes = placeholders[argument];
            if (!isRecord(attributes))
              fail(
                metadataPath,
                `missing placeholder metadata for ${argument}`,
              );
            if (element.type === TYPE.select && attributes.type !== 'String')
              fail(
                metadataPath,
                `select placeholder ${argument} must have type String`,
              );
            if (element.type === TYPE.plural) {
              if (element.offset || element.pluralType !== 'cardinal')
                fail(location, 'plural offsets and ordinals are unsupported');
              if (!['int', 'double', 'num'].includes(String(attributes.type)))
                fail(
                  metadataPath,
                  `plural placeholder ${argument} must have numeric type`,
                );
            }
            if (element.type === TYPE.select || element.type === TYPE.plural)
              for (const [selector, option] of Object.entries(
                element.options,
              )) {
                if (
                  !/^(?:[a-zA-Z_][a-zA-Z0-9_]*|[0-9]+|=[0-9]+)$/.test(selector)
                )
                  fail(
                    location,
                    `unsupported Flutter selector ${JSON.stringify(selector)}`,
                  );
                inspect(option.value);
              }
          }
        };
        let elements: MessageFormatElement[];
        try {
          elements = parse(value);
        } catch (error) {
          fail(
            location,
            `invalid ICU message: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        inspect(elements);
        for (const argument of Object.keys(placeholders))
          if (!arguments_.has(argument))
            fail(
              metadataPath,
              `placeholder ${argument} is not used by its message`,
            );
        signatures.set(
          name,
          JSON.stringify(
            Object.entries(placeholders)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([argument, attributes]) => [
                argument,
                isRecord(attributes) ? attributes.type : undefined,
              ]),
          ),
        );
        output[name] = value;
        if (metadata !== undefined) output[`@${name}`] = metadata;
      }
    };
    visit(tree, [locale]);
    if (reference) {
      if (
        !Bun.deepEquals(
          [...signatures.keys()].sort(),
          [...reference.signatures.keys()].sort(),
        )
      )
        fail([locale], `ARB message keys differ from ${reference.locale}`);
      for (const [name, signature] of signatures)
        if (signature !== reference.signatures.get(name))
          fail(
            paths.get(name) ?? [locale],
            `ARB placeholder names or types differ from ${reference.locale}`,
          );
    } else reference = { locale, signatures };
    result.set(locale, output);
  }
  return result;
}
