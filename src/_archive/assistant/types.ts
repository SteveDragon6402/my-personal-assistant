import type { IncomingMessage } from '../../ports/MessagePort.js';

export type Intent =
  | 'capture'
  | 'meal'
  | 'planning'
  | 'query'
  | 'reflection'
  | 'settings'
  | 'sleep_ingest'
  | 'digest'
  | 'general'
  | 'unknown';

export interface IntentClassification {
  intent: Intent;
  confidence: number;
  entities?: Record<string, string>;
}

/** Classifier that can be rule-based or LLM-based. AssistantService awaits classify(). */
export interface IntentClassifierPort {
  classify(message: IncomingMessage): Promise<IntentClassification>;
}
