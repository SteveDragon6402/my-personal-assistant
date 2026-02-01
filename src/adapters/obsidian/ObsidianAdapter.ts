import { mkdir, readdir, readFile, appendFile, writeFile, stat } from 'node:fs/promises';
import { join, extname, basename, dirname, relative } from 'node:path';
import type { NotesPort, NoteCategory, Task, NoteContent, NoteListItem } from '../../ports/NotesPort.js';
import type { Config } from '../../config/index.js';
import { createLogger } from '../../utils/logger.js';
import { NotesError } from '../../utils/errors.js';
import { parseCategories } from './categoryParser.js';

const TASK_REGEX = /^-\s+\[( |x|X)\]\s+(.*)$/;

export class ObsidianAdapter implements NotesPort {
  private readonly logger = createLogger({ adapter: 'ObsidianAdapter' });
  private readonly vaultPath: string;
  private readonly dailyFolder: string;
  private readonly pendingFolder: string;

  constructor(config: Config) {
    if (!config.obsidianVaultPath) {
      throw new NotesError('OBSIDIAN_VAULT_PATH is not configured');
    }
    this.vaultPath = config.obsidianVaultPath;
    this.dailyFolder = config.obsidianDailyFolder ?? 'Daily';
    this.pendingFolder = config.obsidianPendingFolder ?? 'Pending';
  }

  async getCategories(): Promise<NoteCategory[]> {
    const logger = this.logger.child({ method: 'getCategories' });
    logger.info('Loading Obsidian categories');

    try {
      const parsed = await parseCategories(this.vaultPath);
      return parsed.map((category) => ({
        path: category.path,
        name: category.name,
        tags: category.tags,
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to load categories');
      throw new NotesError('Failed to load categories', { cause: error });
    }
  }

  async createNote(params: {
    title: string;
    content: string;
    category: string;
    tags: string[];
  }): Promise<{ path: string }> {
    const logger = this.logger.child({ method: 'createNote', category: params.category });
    const categoryPath = join(this.vaultPath, params.category);
    const sanitizedTitle = sanitizeFilename(params.title || 'Untitled');
    const filePath = await ensureUniquePath(join(categoryPath, `${sanitizedTitle}.md`));

    const body = buildNoteContent(params.title, params.content, params.tags);

    try {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, body, 'utf8');
      const relativePath = relative(this.vaultPath, filePath);
      logger.info({ relativePath }, 'Created note');
      return { path: relativePath };
    } catch (error) {
      logger.error({ error }, 'Failed to create note');
      throw new NotesError('Failed to create note', { cause: error });
    }
  }

  async appendToDaily(content: string): Promise<void> {
    const logger = this.logger.child({ method: 'appendToDaily' });
    const date = new Date().toISOString().split('T')[0];
    if (!date) {
      throw new NotesError('Failed to format date for daily note');
    }
    const dailyPath = join(this.vaultPath, this.dailyFolder, `${date}.md`);

    // Split original content from summary (separated by \n\n)
    const parts = content.trim().split(/\n\n/);
    const originalContent = parts[0] ?? '';
    const summary = parts.slice(1).join('\n\n');

    // Format: bullet with original, then blockquote for summary
    let entry = `\n\n- ${originalContent}`;
    if (summary) {
      // Indent summary as a blockquote under the bullet
      const quotedSummary = summary
        .split('\n')
        .map((line) => `  > ${line}`)
        .join('\n');
      entry += `\n${quotedSummary}`;
    }

    try {
      await mkdir(dirname(dailyPath), { recursive: true });
      await appendFile(dailyPath, entry, 'utf8');
      logger.info(
        { dailyPath: relative(this.vaultPath, dailyPath), contentLength: content.length, entryLength: entry.length },
        'Appended to daily note'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to append to daily note');
      throw new NotesError('Failed to append to daily note', { cause: error });
    }
  }

  async appendToPending(
    content: string,
    meta?: { suggestedCategory?: string; confidence?: number }
  ): Promise<void> {
    const logger = this.logger.child({ method: 'appendToPending' });
    const date = new Date().toISOString().split('T')[0];
    if (!date) {
      throw new NotesError('Failed to format date for pending note');
    }
    const pendingPath = join(this.vaultPath, this.pendingFolder, `${date}.md`);
    const suffix =
      meta?.suggestedCategory != null
        ? ` _(suggested: ${meta.suggestedCategory}${typeof meta.confidence === 'number' ? `, ${Math.round(meta.confidence * 100)}%` : ''})_`
        : '';
    const entry = `\n\n- ${content.trim()}${suffix}`;

    try {
      await mkdir(dirname(pendingPath), { recursive: true });
      await appendFile(pendingPath, entry, 'utf8');
      logger.info(
        { pendingPath: relative(this.vaultPath, pendingPath) },
        'Appended to pending note'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to append to pending note');
      throw new NotesError('Failed to append to pending note', { cause: error });
    }
  }

  async searchNotes(query: string): Promise<Array<{ title: string; excerpt: string; path: string }>> {
    const logger = this.logger.child({ method: 'searchNotes', query });
    if (!query.trim()) {
      return [];
    }

    try {
      const files = await this.walkMarkdownFiles(this.vaultPath);
      const results: Array<{ title: string; excerpt: string; path: string }> = [];
      const lowerQuery = query.toLowerCase();

      for (const filePath of files) {
        const content = await readFile(filePath, 'utf8');
        const lowerContent = content.toLowerCase();
        const index = lowerContent.indexOf(lowerQuery);
        if (index === -1) {
          continue;
        }
        const excerpt = extractExcerpt(content, index, query.length);
        results.push({
          title: basename(filePath, '.md'),
          excerpt,
          path: relative(this.vaultPath, filePath),
        });
      }

      logger.info({ results: results.length }, 'Search completed');
      return results;
    } catch (error) {
      logger.error({ error }, 'Failed to search notes');
      throw new NotesError('Failed to search notes', { cause: error });
    }
  }

  async getTasks(filter?: { status?: 'open' | 'done'; project?: string }): Promise<Task[]> {
    const logger = this.logger.child({ method: 'getTasks' });
    try {
      const files = await this.walkMarkdownFiles(this.vaultPath);
      const tasks: Task[] = [];

      for (const filePath of files) {
        if (filter?.project && !filePath.includes(filter.project)) {
          continue;
        }
        const content = await readFile(filePath, 'utf8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i += 1) {
          const line = lines[i];
          if (!line) {
            continue;
          }
          const match = line.match(TASK_REGEX);
          if (!match) {
            continue;
          }
          const status = match[1]?.toLowerCase() === 'x' ? 'done' : 'open';
          if (filter?.status && status !== filter.status) {
            continue;
          }
          const title = match[2]?.trim() ?? '';
          if (!title) {
            continue;
          }
          tasks.push({
            id: `${basename(filePath)}:${i + 1}`,
            title,
            status,
            path: relative(this.vaultPath, filePath),
            project: filter?.project,
          });
        }
      }

      logger.info({ tasks: tasks.length }, 'Tasks loaded');
      return tasks;
    } catch (error) {
      logger.error({ error }, 'Failed to load tasks');
      throw new NotesError('Failed to load tasks', { cause: error });
    }
  }

  async readNote(notePath: string): Promise<NoteContent | null> {
    const logger = this.logger.child({ method: 'readNote', path: notePath });
    const fullPath = join(this.vaultPath, notePath);

    try {
      const content = await readFile(fullPath, 'utf8');
      const title = basename(notePath, '.md');
      logger.info({ contentLength: content.length }, 'Read note');
      return {
        title,
        content,
        path: notePath,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.warn('Note not found');
        return null;
      }
      logger.error({ error }, 'Failed to read note');
      throw new NotesError('Failed to read note', { cause: error });
    }
  }

  async readDailyNote(date?: string): Promise<NoteContent | null> {
    const targetDate = date ?? new Date().toISOString().split('T')[0];
    if (!targetDate) {
      throw new NotesError('Failed to format date for daily note');
    }
    const dailyPath = join(this.dailyFolder, `${targetDate}.md`);
    return this.readNote(dailyPath);
  }

  async listNotes(folder?: string): Promise<NoteListItem[]> {
    const logger = this.logger.child({ method: 'listNotes', folder });
    const targetDir = folder ? join(this.vaultPath, folder) : this.vaultPath;

    try {
      const files = await this.walkMarkdownFiles(targetDir);
      const notes: NoteListItem[] = [];

      for (const filePath of files) {
        try {
          const fileStat = await stat(filePath);
          notes.push({
            title: basename(filePath, '.md'),
            path: relative(this.vaultPath, filePath),
            modifiedAt: fileStat.mtime,
          });
        } catch {
          // Skip files we can't stat
          notes.push({
            title: basename(filePath, '.md'),
            path: relative(this.vaultPath, filePath),
          });
        }
      }

      // Sort by most recently modified first
      notes.sort((a, b) => {
        if (!a.modifiedAt || !b.modifiedAt) return 0;
        return b.modifiedAt.getTime() - a.modifiedAt.getTime();
      });

      logger.info({ count: notes.length }, 'Listed notes');
      return notes;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.warn('Folder not found');
        return [];
      }
      logger.error({ error }, 'Failed to list notes');
      throw new NotesError('Failed to list notes', { cause: error });
    }
  }

  async updateNote(notePath: string, content: string): Promise<void> {
    const logger = this.logger.child({ method: 'updateNote', path: notePath });
    const fullPath = join(this.vaultPath, notePath);

    try {
      // Check if file exists first
      await readFile(fullPath, 'utf8');
      
      // Write the updated content
      await writeFile(fullPath, content, 'utf8');
      logger.info({ contentLength: content.length }, 'Updated note');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotesError(`Note not found: ${notePath}`);
      }
      logger.error({ error }, 'Failed to update note');
      throw new NotesError('Failed to update note', { cause: error });
    }
  }

  private async walkMarkdownFiles(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        continue;
      }
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        const nested = await this.walkMarkdownFiles(fullPath);
        files.push(...nested);
      } else if (extname(entry.name).toLowerCase() === '.md') {
        files.push(fullPath);
      }
    }

    return files;
  }
}

function sanitizeFilename(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '-').trim();
}

async function ensureUniquePath(filePath: string): Promise<string> {
  try {
    await readFile(filePath, 'utf8');
    const ext = extname(filePath);
    const base = filePath.slice(0, -ext.length);
    return `${base}-${Date.now()}${ext}`;
  } catch {
    return filePath;
  }
}

function buildNoteContent(title: string, content: string, tags: string[]): string {
  const normalizedTags = tags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => `#${tag}`);

  const tagLine = normalizedTags.length > 0 ? `\n\n${normalizedTags.join(' ')}` : '';
  return `# ${title}\n\n${content.trim()}${tagLine}\n`;
}

function extractExcerpt(content: string, index: number, length: number): string {
  const start = Math.max(0, index - 80);
  const end = Math.min(content.length, index + length + 80);
  return content.slice(start, end).replace(/\s+/g, ' ').trim();
}
