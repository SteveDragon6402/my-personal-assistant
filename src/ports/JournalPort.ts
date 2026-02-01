export interface JournalEntry {
  id: string;
  date: string; // ISO date
  content: string;
  tags: string[];
}

export interface JournalPort {
  createEntry(content: string, tags?: string[]): Promise<JournalEntry>;
  getEntries(startDate: string, endDate: string): Promise<JournalEntry[]>;
}
