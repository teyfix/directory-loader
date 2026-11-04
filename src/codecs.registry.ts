export type Parser = (source: string) => unknown | Promise<unknown>;
export type Codec = { ext: readonly string[]; parser: { parse: Parser } };

export const codecs: readonly Codec[] = [
  { ext: ['json', 'arb'], parser: JSON },
  { ext: ['yaml', 'yml'], parser: Bun.YAML },
  { ext: ['json5'], parser: Bun.JSON5 },
  { ext: ['jsonc'], parser: Bun.JSONC },
  { ext: ['toml'], parser: Bun.TOML },
  { ext: ['jsonl', 'ndjson'], parser: Bun.JSONL },
  { ext: ['xml'], parser: Bun.XML },
];
