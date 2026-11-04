import { isAbsolute, relative, resolve, sep } from 'node:path';

/** Named captures select files; path mapping remains a separate pipeline step. */
export function globPattern(pattern: string): string {
  return pattern.replace(/\[[a-zA-Z][\w-]*\]/g, '*');
}

export function relativePath(root: string, path: string): string {
  const result = relative(root, path);
  if (result === '..' || result.startsWith(`..${sep}`) || isAbsolute(result))
    throw new Error(`${path} is outside ${root}`);
  return result.split(sep).join('/');
}

export function watchRoot(pattern: string): string {
  const parts = globPattern(pattern).split('/');
  const dynamic = parts.findIndex((part) => /[*?{[]/.test(part));
  return resolve(
    (dynamic < 0 ? parts.slice(0, -1) : parts.slice(0, dynamic)).join('/') ||
      '.',
  );
}
