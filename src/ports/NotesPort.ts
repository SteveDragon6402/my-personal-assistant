export interface NoteCategory {
  path: string; // e.g., "Areas/Health" or "Projects/SideProjects"
  name: string;
  tags: string[];
}

export interface Task {
  id: string;
  title: string;
  status: 'open' | 'done';
  project?: string;
  path: string;
}

export interface PendingCaptureMeta {
  suggestedCategory?: string;
  confidence?: number;
}

export interface NoteContent {
  title: string;
  content: string;
  path: string;
}

export interface NoteListItem {
  title: string;
  path: string;
  modifiedAt?: Date;
}

export interface NotesPort {
  getCategories(): Promise<NoteCategory[]>;
  createNote(params: {
    title: string;
    content: string;
    category: string;
    tags: string[];
  }): Promise<{ path: string }>;
  appendToDaily(content: string): Promise<void>;
  appendToPending(content: string, meta?: PendingCaptureMeta): Promise<void>;
  searchNotes(query: string): Promise<Array<{ title: string; excerpt: string; path: string }>>;
  getTasks(filter?: { status?: 'open' | 'done'; project?: string }): Promise<Task[]>;
  
  // New methods for full read/edit capabilities
  readNote(path: string): Promise<NoteContent | null>;
  readDailyNote(date?: string): Promise<NoteContent | null>;
  listNotes(folder?: string): Promise<NoteListItem[]>;
  updateNote(path: string, content: string): Promise<void>;
}
