import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

export interface ParsedCategory {
  path: string;
  name: string;
  tags: string[];
}

const DEFAULT_IGNORE_DIRS = new Set(['.obsidian', '.trash', '.git', 'node_modules']);

export async function parseCategories(
  vaultPath: string,
  options?: { maxDepth?: number; ignoreDirs?: string[] }
): Promise<ParsedCategory[]> {
  const maxDepth = options?.maxDepth ?? 3;
  const ignore = new Set(options?.ignoreDirs ?? []);
  DEFAULT_IGNORE_DIRS.forEach((dir) => ignore.add(dir));

  const results: ParsedCategory[] = [];

  async function walk(currentPath: string, relativePath: string, depth: number): Promise<void> {
    if (depth > maxDepth) {
      return;
    }

    const entries = await readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (entry.name.startsWith('.')) {
        continue;
      }
      if (ignore.has(entry.name)) {
        continue;
      }

      const nextRelative = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      results.push({
        path: nextRelative,
        name: entry.name,
        tags: [],
      });

      await walk(join(currentPath, entry.name), nextRelative, depth + 1);
    }
  }

  await walk(vaultPath, '', 1);
  return results;
}
