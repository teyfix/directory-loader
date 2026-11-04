import { camelCase, kebabCase, pascalCase, snakeCase } from 'change-case';
import type { Source } from './directory-loader.class';

export type PathTransform = (source: Source) => readonly string[];

export function stripSegments(...names: string[]): PathTransform {
  return ({ path }) => path.filter((segment) => !names.includes(segment));
}

export function recaseSegments(
  casing: 'camel' | 'kebab' | 'pascal' | 'snake',
  skip = 0,
): PathTransform {
  const transform = {
    camel: camelCase,
    kebab: kebabCase,
    pascal: pascalCase,
    snake: snakeCase,
  }[casing];
  return ({ path }) =>
    path.map((segment, index) => (index < skip ? segment : transform(segment)));
}

/** Redirect matching path suffixes while preserving prefixes such as locales. */
export function redirectPaths(
  mapping: Readonly<Record<string, string>>,
): PathTransform {
  const redirects = Object.entries(mapping)
    .map(([from, to]) => ({
      from: from.split('/'),
      to: to ? to.split('/') : [],
    }))
    .sort((a, b) => b.from.length - a.from.length);
  return ({ path }) => {
    const match = redirects.find(
      ({ from }) =>
        from.length <= path.length &&
        from.every(
          (segment, index) =>
            segment === path[path.length - from.length + index],
        ),
    );
    return match
      ? [...path.slice(0, path.length - match.from.length), ...match.to]
      : path;
  };
}
