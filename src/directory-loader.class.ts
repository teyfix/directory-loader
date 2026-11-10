import { extname, relative, resolve } from 'node:path';
import { exportCatalogue } from './catalogue-export.utils';
import { type Codec, codecs, type Parser } from './codecs.registry';
import { createMerger, isRecord, type Override } from './merge.utils';
import { globPattern, relativePath } from './path-pattern.utils';
import type { PathTransform } from './path-transform.utils';

export type Source = { file: string; path: readonly string[] };
type Mapper = (value: unknown, source: Source) => unknown | Promise<unknown>;
export type Validator = (data: Record<string, unknown>) => void | Promise<void>;
export type Execution = Promise<Record<string, unknown>> & {
  loader: DirectoryLoader;
};

export default class DirectoryLoader {
  private readonly parsers = new Map<string, Parser>();
  private root?: string;
  private patterns: string[] = ['**/*'];
  private excluded: string[] = [];
  private maxFileLimit = Infinity;
  private openFilesLimit = 32;
  private readonly mappers: Mapper[] = [];
  private emitTypes = false;
  private splitOutput = false;
  private emitArb = false;
  private readonly sources = new Map<string, string>();
  private readonly mounts: PathTransform[] = [];
  private readonly validators: Validator[] = [];
  private warning = (event: Override) =>
    console.warn(
      `${event.source} overrides ${event.path.join('.')} from ${event.previous}`,
    );

  constructor(segments: string[] = []) {
    if (segments.length) this.dir(...segments);
    for (const codec of codecs) this.add(codec);
  }

  dir(...segments: string[]): this {
    this.root = resolve(...segments);
    return this;
  }

  files(...patterns: string[]): this {
    this.patterns = patterns;
    return this;
  }

  exclude(...patterns: string[]): this {
    this.excluded.push(...patterns);
    return this;
  }

  add(codec: Codec): this;
  add(
    extensions: string | readonly string[],
    parser: Parser | { parse: Parser },
  ): this;
  add(
    codec: Codec | string | readonly string[],
    parser?: Parser | { parse: Parser },
  ): this {
    if (typeof codec === 'object' && 'parser' in codec)
      return this.add(codec.ext, codec.parser);
    if (!parser) throw new Error('Parser is not defined');
    const parse =
      typeof parser === 'function' ? parser : parser.parse.bind(parser);
    const extensions = typeof codec === 'string' ? codec.split(/\s+/) : codec;
    for (const extension of extensions) {
      const key = extension.replace(/^\./, '').toLowerCase();
      if (!/^[a-z0-9]+$/.test(key))
        throw new Error(`Invalid extension: ${extension}`);
      this.parsers.set(key, parse);
    }
    return this;
  }

  remove(extension: string): this {
    const key = extension.replace(/^\./, '').toLowerCase();
    const parser = this.parsers.get(key);
    if (!parser)
      throw new Error(`Loader not found for extension: ${extension}`);
    for (const [ext, registered] of this.parsers)
      if (registered === parser) this.parsers.delete(ext);
    return this;
  }

  clear(): this {
    this.parsers.clear();
    return this;
  }

  map(mapper: Mapper): this {
    this.mappers.push(mapper);
    return this;
  }

  path(...mappers: PathTransform[]): this {
    this.mounts.push(...mappers);
    return this;
  }

  validate(validator: Validator): this {
    this.validators.push(validator);
    return this;
  }

  watchPlan(): { inputs: string[]; excluded: string[] } {
    if (!this.root) throw new Error('Root directory is not defined');
    const root = this.root;
    return {
      inputs: this.patterns.map((pattern) =>
        resolve(root, globPattern(pattern)),
      ),
      excluded: this.excluded.map((pattern) => resolve(root, pattern)),
    };
  }

  onOverride(handler: (event: Override) => void): this {
    this.warning = handler;
    return this;
  }

  types(): this {
    this.emitTypes = true;
    return this;
  }

  split(): this {
    this.splitOutput = true;
    return this;
  }

  arb(): this {
    this.emitArb = true;
    this.splitOutput = true;
    return this;
  }

  write(output: string): Execution {
    return Object.assign(this.writeOutput(output), { loader: this });
  }

  private async writeOutput(output: string): Promise<Record<string, unknown>> {
    if (this.emitArb && this.emitTypes)
      throw new Error(
        'arb() cannot be combined with types(); emit JSON separately',
      );
    if (this.root) {
      const path = relative(this.root, resolve(output)).replaceAll('\\', '/');
      if (!path) throw new Error('Output must not be the input directory');
      this.exclude(this.splitOutput ? `${path}/**` : path);
      if (!this.splitOutput)
        this.exclude(path.replace(/\.json$/, '.d.json.ts'));
      this.exclude('**/*.outputs.json', '**/.directory-loader.outputs.json');
    }
    const data = await this.load();
    await exportCatalogue(data, output, {
      types: this.emitTypes,
      split: this.splitOutput,
      arb: this.emitArb,
      source: (path) => this.sources.get(JSON.stringify(path)),
    });
    return data;
  }

  openFiles(limit: number): this {
    this.openFilesLimit = this.limit(limit);
    return this;
  }

  maxFiles(limit: number): this {
    this.maxFileLimit = this.limit(limit);
    return this;
  }

  private limit(value: number): number {
    if (value !== Infinity && (!Number.isInteger(value) || value < 1))
      throw new Error('File limits must be positive integers or Infinity');
    return value;
  }

  load(): Execution {
    return Object.assign(this.read(), { loader: this });
  }

  private async read(): Promise<Record<string, unknown>> {
    if (!this.root) throw new Error('Root directory is not defined');
    if (!this.parsers.size) throw new Error('No loader provided');
    const root = this.root;
    const files = new Set<string>();
    for (const pattern of this.patterns) {
      for await (const match of new Bun.Glob(globPattern(pattern)).scan({
        cwd: root,
        onlyFiles: true,
        absolute: true,
        throwErrorOnBrokenSymlink: true,
      })) {
        const file = relativePath(root, match);
        if (
          this.parsers.has(extname(file).slice(1).toLowerCase()) &&
          !this.excluded.some((pattern) => new Bun.Glob(pattern).match(file))
        )
          files.add(file);
      }
    }
    const sorted = [...files]
      .sort(
        (a, b) =>
          a.split('/').length - b.split('/').length ||
          (a < b ? -1 : a > b ? 1 : 0),
      )
      .slice(0, this.maxFileLimit);
    let result: Record<string, unknown> = {};
    this.sources.clear();
    const merge = createMerger(this.warning);
    for (let start = 0; start < sorted.length; start += this.openFilesLimit) {
      const batch = await Promise.all(
        sorted.slice(start, start + this.openFilesLimit).map(async (file) => {
          const ext = extname(file);
          const source = { file, path: file.slice(0, -ext.length).split('/') };
          try {
            const parser = this.parsers.get(ext.slice(1).toLowerCase());
            if (!parser) throw new Error(`Loader not found: ${ext}`);
            let value = await parser(
              await Bun.file(resolve(root, file)).text(),
            );
            for (const mapper of this.mappers)
              value = await mapper(value, source);
            let path = source.path;
            for (const mapper of this.mounts)
              path = [...mapper({ ...source, path })];
            if (path.some((key) => typeof key !== 'string' || !key.length))
              throw new Error('Mount paths must contain non-empty strings');
            const contribution = path.reduceRight<unknown>(
              (child, key) => ({ [key]: child }),
              value,
            );
            if (!isRecord(contribution))
              throw new Error('Root contributions must be objects');
            return { source, contribution };
          } catch (error) {
            throw new Error(`Cannot load ${file}`, { cause: error });
          }
        }),
      );
      for (const { source, contribution } of batch) {
        if (this.emitArb) {
          const remember = (value: unknown, path: string[]) => {
            const key = JSON.stringify(path);
            const previous = this.sources.get(key);
            if (
              previous &&
              typeof value === 'string' &&
              !path.some((key) => key.startsWith('@'))
            )
              throw new Error(
                `${source.file}: ${path.join('.')}: duplicate ARB message from ${previous}`,
              );
            this.sources.set(key, source.file);
            if (isRecord(value))
              for (const [key, child] of Object.entries(value))
                remember(child, [...path, key]);
          };
          remember(contribution, []);
        }
        result = merge(result, contribution, source.file);
      }
    }
    for (const validator of this.validators) await validator(result);
    return result;
  }
}
