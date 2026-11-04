import DirectoryLoader from './directory-loader.class';

export default function directoryLoader(
  ...segments: string[]
): DirectoryLoader {
  return new DirectoryLoader(segments);
}

export { type Codec, codecs, type Parser } from './codecs.registry';
export type { Source } from './directory-loader.class';
export type { Override } from './merge.utils';
export { DirectoryLoader };
