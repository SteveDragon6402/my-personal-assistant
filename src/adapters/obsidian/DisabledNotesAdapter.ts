import type {
  NotesPort,
  NoteCategory,
  Task,
  PendingCaptureMeta,
  NoteContent,
  NoteListItem,
} from '../../ports/NotesPort.js';
import { createLogger } from '../../utils/logger.js';
import { NotesError } from '../../utils/errors.js';

export class DisabledNotesAdapter implements NotesPort {
  private readonly logger = createLogger({ adapter: 'DisabledNotesAdapter' });

  async getCategories(): Promise<NoteCategory[]> {
    this.logger.warn('Obsidian adapter is disabled; returning no categories');
    return [];
  }

  async createNote(): Promise<{ path: string }> {
    this.logger.warn('Obsidian adapter is disabled; cannot create note');
    throw new NotesError('Obsidian adapter is disabled');
  }

  async appendToDaily(): Promise<void> {
    this.logger.warn('Obsidian adapter is disabled; cannot append to daily note');
    throw new NotesError('Obsidian adapter is disabled');
  }

  async appendToPending(_content: string, _meta?: PendingCaptureMeta): Promise<void> {
    // No-op when Obsidian is disabled; pending is still stored in DB
  }

  async searchNotes(): Promise<Array<{ title: string; excerpt: string; path: string }>> {
    this.logger.warn('Obsidian adapter is disabled; returning no search results');
    return [];
  }

  async getTasks(): Promise<Task[]> {
    this.logger.warn('Obsidian adapter is disabled; returning no tasks');
    return [];
  }

  async readNote(): Promise<NoteContent | null> {
    this.logger.warn('Obsidian adapter is disabled; cannot read note');
    return null;
  }

  async readDailyNote(): Promise<NoteContent | null> {
    this.logger.warn('Obsidian adapter is disabled; cannot read daily note');
    return null;
  }

  async listNotes(): Promise<NoteListItem[]> {
    this.logger.warn('Obsidian adapter is disabled; returning no notes');
    return [];
  }

  async updateNote(): Promise<void> {
    this.logger.warn('Obsidian adapter is disabled; cannot update note');
    throw new NotesError('Obsidian adapter is disabled');
  }
}
