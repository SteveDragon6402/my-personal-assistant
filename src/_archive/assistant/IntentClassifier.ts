import type { IntentClassification } from './types.js';
import type { IncomingMessage } from '../../ports/MessagePort.js';
import type { IntentClassifierPort } from './types.js';

export class IntentClassifier implements IntentClassifierPort {
  async classify(message: IncomingMessage): Promise<IntentClassification> {
    const text = message.text.toLowerCase().trim();
    const originalText = message.text.trim();

    // Explicit capture commands
    if (text === '/c' || text === '/capture' || text.startsWith('/capture ') || text.startsWith('/c ')) {
      return Promise.resolve({
        intent: 'capture',
        confidence: 1.0,
        entities: {
          content: originalText.replace(/^\/capture\s*|\/c\s*/i, ''),
        },
      });
    }

    // Meal tracking
    if (text.startsWith('/meal') || text.startsWith('/meals')) {
      return Promise.resolve({
        intent: 'meal',
        confidence: 1.0,
      });
    }

    // Settings
    if (text.startsWith('/settings') || text === 'settings') {
      return Promise.resolve({
        intent: 'settings',
        confidence: 1.0,
      });
    }

    // Sleep ingest: /sleep or /sleep <paste>
    if (text === '/sleep' || text.startsWith('/sleep ')) {
      return Promise.resolve({
        intent: 'sleep_ingest',
        confidence: 1.0,
        entities: {
          content: originalText.replace(/^\/sleep\s*/i, '').trim(),
        },
      });
    }

    // Manual digest trigger
    if (text === '/digest' || text.startsWith('/digest')) {
      return Promise.resolve({
        intent: 'digest',
        confidence: 1.0,
      });
    }

    // Forwarded sleep summary (e.g. from a sleep tracker app)
    const forwardedFrom = (message as { forwardedFrom?: string }).forwardedFrom ?? '';
    if (forwardedFrom && /eight|sleep|pod/i.test(forwardedFrom) && /\d+/.test(originalText)) {
      return Promise.resolve({
        intent: 'sleep_ingest',
        confidence: 0.9,
        entities: { content: originalText },
      });
    }

    // Simple keyword-based classification (fallback when LLM not used)
    if (
      text.includes('save this') ||
      text.includes('remember this') ||
      text.includes('capture this')
    ) {
      return Promise.resolve({
        intent: 'capture',
        confidence: 0.7,
        entities: {
          content: text,
        },
      });
    }

    if (
      text.includes('what should i do') ||
      text.includes('what to do') ||
      text.includes('plan')
    ) {
      return Promise.resolve({
        intent: 'planning',
        confidence: 0.7,
      });
    }

    if (text.includes('how did i sleep') || text.includes('sleep')) {
      return Promise.resolve({
        intent: 'reflection',
        confidence: 0.7,
      });
    }

    // Default to general
    return Promise.resolve({
      intent: 'general',
      confidence: 0.5,
    });
  }
}
