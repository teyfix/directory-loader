import DirectoryLoader from './directory-loader.class';

export default function directoryLoader(
  ...segments: string[]
): DirectoryLoader {
  return new DirectoryLoader(segments);
}

export { type Codec, codecs, type Parser } from './codecs.registry';
export type { Execution, Source, Validator } from './directory-loader.class';
export type { Override } from './merge.utils';
export { type Outputs, writeAll } from './multi-output.utils';
export type { PathTransform } from './path-transform.utils';
export {
  recaseSegments,
  redirectPaths,
  stripSegments,
} from './path-transform.utils';
export { DirectoryLoader };
