export interface IncomingMessage {
  id: string;
  from: string; // Telegram chat ID
  text: string;
  timestamp: Date;
  hasMedia: boolean;
  mediaUrl?: string;
  mediaType?: string;
  /** Set when message is forwarded (e.g. sender name or app name) */
  forwardedFrom?: string;
}

export interface MessagePort {
  sendMessage(to: string, text: string): Promise<void>;
  onMessage(handler: (message: IncomingMessage) => Promise<void>): void;
  /** Resolve a media file ID to a URL (e.g. for LLM vision). Optional; not all adapters support it. */
  getMediaUrl?(fileId: string): Promise<string>;
}
