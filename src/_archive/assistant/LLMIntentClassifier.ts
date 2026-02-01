import type { IncomingMessage } from '../../ports/MessagePort.js';
import type { LLMPort } from '../../ports/LLMPort.js';
import type { Intent, IntentClassification, IntentClassifierPort } from './types.js';
import { createLogger } from '../../utils/logger.js';

const VALID_INTENTS: Intent[] = [
  'capture',
  'meal',
  'planning',
  'query',
  'reflection',
  'settings',
  'sleep_ingest',
  'digest',
  'general',
  'unknown',
];

export class LLMIntentClassifier implements IntentClassifierPort {
  private readonly logger = createLogger({ classifier: 'LLMIntentClassifier' });

  constructor(
    private readonly llmPort: LLMPort,
    private readonly promptTemplate: string,
    private readonly fallback: IntentClassifierPort
  ) {}

  async classify(message: IncomingMessage): Promise<IntentClassification> {
    const logger = this.logger.child({ messageId: message.id });
    const messageText = message.text?.trim() ?? '';
    const forwardedFrom = message.forwardedFrom ?? '';
    const hasMedia = message.hasMedia ? 'yes' : 'no';

    const prompt = this.promptTemplate
      .replace('{{MESSAGE_TEXT}}', messageText || '(empty)')
      .replace('{{FORWARDED_FROM}}', forwardedFrom || '(none)')
      .replace('{{HAS_MEDIA}}', hasMedia);

    try {
      const response = await this.llmPort.generateText({
        prompt,
        maxTokens: 150,
        temperature: 0.1,
      });
      const raw = response.text?.trim();
      if (!raw) {
        logger.warn('Empty LLM response for intent');
        return this.fallback.classify(message);
      }
      const classification = this.parseClassification(raw, message);
      if (classification) {
        logger.info(
          { intent: classification.intent, confidence: classification.confidence },
          'LLM classified intent'
        );
        return classification;
      }
      logger.warn({ raw: raw.slice(0, 200) }, 'Failed to parse LLM intent response');
    } catch (error) {
      logger.warn({ error }, 'LLM intent classification failed, using fallback');
    }
    return this.fallback.classify(message);
  }

  private parseClassification(
    raw: string,
    _message: IncomingMessage
  ): IntentClassification | null {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try {
      const parsed = JSON.parse(jsonMatch[0]) as {
        intent?: string;
        confidence?: number;
        entities?: Record<string, string>;
      };
      const intent = parsed.intent?.toLowerCase().trim();
      if (!intent || !VALID_INTENTS.includes(intent as Intent)) return null;
      const confidence =
        typeof parsed.confidence === 'number'
          ? Math.min(1, Math.max(0, parsed.confidence))
          : 0.7;
      const entities =
        parsed.entities && typeof parsed.entities === 'object'
          ? (parsed.entities as Record<string, string>)
          : undefined;
      return {
        intent: intent as Intent,
        confidence,
        entities,
      };
    } catch {
      return null;
    }
  }
}
