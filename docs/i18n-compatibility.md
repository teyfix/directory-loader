---
title: I18n compatibility audit
summary: Explain which native catalogue values directory-loader preserves and which runtime-specific formats and validation it leaves to consumers.
---

# I18n compatibility audit

The generic loader assembles native values and exports JSON. It does not replace an i18n runtime or convert between message dialects. The findings below combine upstream source inspection on 2026-11-04 with local preservation tests; complete application integrations were not executed.

|Consumer|Compatible behavior|Boundary or conflict|
|-|-|-|
|[next-intl](https://github.com/amannn/next-intl/blob/main/packages/next-intl/src/plugin/declaration/createMessagesDeclaration.tsx)|Nested messages and unchanged ICU strings; literal declarations retain argument inference. Split by top-level locale to produce the usual per-locale JSON.|Load the selected locale, not the entire locale wrapper. Keys containing dots, arbitrary arrays and non-string leaves are generic data, not necessarily valid next-intl messages. Opt into ICU syntax/key/argument/tag checks with `.validate(icu(...))`; the generic loader applies none by default.|
|[i18next/react-i18next](https://github.com/i18next/i18next-icu#readme)|Nested resources, native interpolation strings, suffix keys and plural objects remain unchanged. Generated literals can feed i18next resource types.|Configure the expected language/namespace wrapper. ICU needs the appropriate plugin; JSON encoding alone does not translate `{{name}}`, ICU syntax, or plural structures. Argument typing depends on the installed i18next version and type configuration.|
|[Paraglide](https://github.com/opral/paraglide-js/blob/main/docs/file-formats.md)|Parsed strings and structured variant values remain unchanged for a consumer adapter.|Requires the configured inlang plugin's format and path contract. This loader does not flatten keys or convert ICU to another message representation. Paraglide owns generated functions and code splitting.|
|[Flutter gen_l10n](https://docs.flutter.dev/ui/internationalization)|ARB uses the JSON codec; `@@locale`, `@message`, placeholder metadata and ICU text survive loading.|gen_l10n requires flat ARB resources and Dart-compatible identifiers, not the loader's default directory wrapper. Map or select the appropriate object, then emit the required ARB through the consumer's pipeline. The built-in writer emits JSON filenames only; it does not generate Dart.|
|[Flutter Slang](https://github.com/slang-i18n/slang#readme)|JSON/YAML hierarchy, plural records, arrays and metadata can be preserved.|Slang has its own interpolation, plural and rich-text conventions; arbitrary ICU strings are not interchangeable. Slang owns typed Dart generation.|
|[easy_localization](https://github.com/aissat/easy_localization#readme)|Native nested JSON resources can be assembled.|Its interpolation/plural format and key generation differ from ICU and fully typed argument APIs.|

## Merge and codec consequences

More specific source files override broader contributions with warnings. Objects merge recursively; arrays are replaced rather than concatenated or merged by index. A scalar/object shape change replaces the previous value and warns. The core infers no locale completeness from the presence of files: without a required-locale validator, deleting a locale removes its generated output rather than reporting missing translations. A consumer requiring mandatory locales can pass them to the optional ICU validator or supply its own `.validate()` callback.

Path segments are preserved, including hyphens, numeric strings and literal dots in parsed object keys. A callback can map physical layout such as `components/open-dialog` to a runtime namespace such as `openDialog`. The loader does not infer that mapping; compose `redirectPaths`, `stripSegments` and `recaseSegments` when the application supplies it. Alphabetic bracket tokens in patterns are reserved wildcard aliases, so native glob character classes with the same spelling are not available.

Bun-native codecs replace the old `yaml` and `jsonc-parser` dependencies. `.json` is now strict JSON; comments and trailing commas belong in `.jsonc` or `.json5`. Codec behavior for YAML scalar resolution and XML mapping is Bun's behavior, not a compatibility promise with the previous parsers. Only strings and structure are transported: dates, non-finite JSON5 numbers, custom classes or custom parser values may have different representations when passed through native JSON serialization. Consumers needing those values should use `.load()` or transform them explicitly before export.

The earlier package's `lodash.merge` merged array indices; arrays now replace. Legacy internal imports from `src/utils/DirectoryLoader` and the `Loader` class are replaced by the package's public factory, `DirectoryLoader`, and `Codec` exports. The scoped package is Bun-only and exposes TypeScript source for Git installation; npm/pnpm/Yarn can fetch it, but that does not establish a Node.js runtime contract.

## Verification and limits

Local tests exercise the requested broad-file/deep-file merge and source warnings, native codecs, custom codecs/transforms/path mapping, i18n string and ARB metadata preservation, JSON/literal declarations, obsolete-output cleanup, invalid-input failure, and the real Bunli CLI. Bunli 0.9.1 validates recognized options but silently ignores unknown flags; the loader does not add a second argument parser. Generated `.d.json.ts` declarations require `allowArbitraryExtensions: true` in the consumer TypeScript configuration. The optional `@teyfix/directory-loader/icu` validator owns string-only ICU syntax, key, typed argument and rich-tag parity checks when configured. It does not convert message formats or validate ARB metadata. Generated indexes import catalogues eagerly; direct JSON imports preserve lazy loading choices. Full framework integrations remain outside these generic preservation and validation tests. Existing application schemas should only be removed after their required checks have an owner; structural type generation by itself still does not validate ICU syntax or locale parity.
