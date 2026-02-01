import type { Database } from 'better-sqlite3';
import { getDatabase } from '../database.js';
import type { IncomingMessage } from '../../ports/MessagePort.js';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export class MessageHistoryRepository {
  private readonly db: Database;

  constructor(db?: Database) {
    this.db = db || getDatabase();
  }

  save(message: IncomingMessage): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO messages (id, from_number, text, timestamp, has_media, media_url, media_type)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      message.id,
      message.from,
      message.text,
      message.timestamp.getTime(),
      message.hasMedia ? 1 : 0,
      message.mediaUrl ?? null,
      message.mediaType ?? null
    );
  }

  saveAssistantResponse(chatId: string, text: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO assistant_responses (chat_id, text, timestamp)
      VALUES (?, ?, ?)
    `);

    stmt.run(chatId, text, Date.now());
  }

  getRecent(from: string, limit = 10): IncomingMessage[] {
    const stmt = this.db.prepare(
      'SELECT * FROM messages WHERE from_number = ? ORDER BY timestamp DESC LIMIT ?'
    );
    const rows = stmt.all(from, limit) as Array<{
      id: string;
      from_number: string;
      text: string;
      timestamp: number;
      has_media: number;
      media_url: string | null;
      media_type: string | null;
    }>;

    return rows.map((row) => {
      const message: IncomingMessage = {
        id: row.id,
        from: row.from_number,
        text: row.text,
        timestamp: new Date(row.timestamp),
        hasMedia: row.has_media === 1,
      };
      if (row.media_url !== null) {
        message.mediaUrl = row.media_url;
      }
      if (row.media_type !== null) {
        message.mediaType = row.media_type;
      }
      return message;
    });
  }

  /**
   * Get conversation history for a chat, interleaving user messages and assistant responses
   * in chronological order (oldest first).
   */
  getConversation(chatId: string, limit = 20): ConversationMessage[] {
    // Get user messages
    const userStmt = this.db.prepare(
      'SELECT text, timestamp FROM messages WHERE from_number = ? ORDER BY timestamp DESC LIMIT ?'
    );
    const userRows = userStmt.all(chatId, limit) as Array<{
      text: string;
      timestamp: number;
    }>;

    // Get assistant responses
    const assistantStmt = this.db.prepare(
      'SELECT text, timestamp FROM assistant_responses WHERE chat_id = ? ORDER BY timestamp DESC LIMIT ?'
    );
    const assistantRows = assistantStmt.all(chatId, limit) as Array<{
      text: string;
      timestamp: number;
    }>;

    // Combine and sort by timestamp (oldest first for conversation flow)
    const allMessages: ConversationMessage[] = [
      ...userRows.map((row) => ({
        role: 'user' as const,
        content: row.text,
        timestamp: new Date(row.timestamp),
      })),
      ...assistantRows.map((row) => ({
        role: 'assistant' as const,
        content: row.text,
        timestamp: new Date(row.timestamp),
      })),
    ];

    // Sort by timestamp ascending (oldest first)
    allMessages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Return the most recent 'limit' messages
    return allMessages.slice(-limit);
  }

  getLatestSender(): string | null {
    const stmt = this.db.prepare(
      'SELECT from_number FROM messages ORDER BY timestamp DESC LIMIT 1'
    );
    const row = stmt.get() as { from_number: string } | undefined;
    return row?.from_number ?? null;
  }
}
