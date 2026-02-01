import { describe, it, expect } from 'vitest';
import { IntentClassifier } from '../../core/assistant/IntentClassifier.js';
import type { IncomingMessage } from '../../ports/MessagePort.js';

describe('IntentClassifier', () => {
  const classifier = new IntentClassifier();

  function createMessage(text: string): IncomingMessage {
    return {
      id: 'test-1',
      from: '1234567890',
      text,
      timestamp: new Date(),
      hasMedia: false,
    };
  }

  describe('capture intent', () => {
    it('should classify /capture command', async () => {
      const result = await classifier.classify(createMessage('/capture This is a note'));
      expect(result.intent).toBe('capture');
      expect(result.confidence).toBe(1.0);
      expect(result.entities?.content).toBe('This is a note');
    });

    it('should classify /c command', async () => {
      const result = await classifier.classify(createMessage('/c Quick note'));
      expect(result.intent).toBe('capture');
      expect(result.confidence).toBe(1.0);
      expect(result.entities?.content).toBe('Quick note');
    });

    it('should classify "save this" intent', async () => {
      const result = await classifier.classify(createMessage('save this for later'));
      expect(result.intent).toBe('capture');
      expect(result.confidence).toBe(0.7);
    });
  });

  describe('meal intent', () => {
    it('should classify /meal command', async () => {
      const result = await classifier.classify(createMessage('/meal'));
      expect(result.intent).toBe('meal');
      expect(result.confidence).toBe(1.0);
    });

    it('should classify /meals command', async () => {
      const result = await classifier.classify(createMessage('/meals today'));
      expect(result.intent).toBe('meal');
      expect(result.confidence).toBe(1.0);
    });
  });

  describe('planning intent', () => {
    it('should classify "what should I do"', async () => {
      const result = await classifier.classify(createMessage('what should I do this evening?'));
      expect(result.intent).toBe('planning');
      expect(result.confidence).toBe(0.7);
    });
  });

  describe('reflection intent', () => {
    it('should classify sleep-related questions', async () => {
      const result = await classifier.classify(createMessage('how did I sleep?'));
      expect(result.intent).toBe('reflection');
      expect(result.confidence).toBe(0.7);
    });
  });

  describe('settings intent', () => {
    it('should classify /settings command', async () => {
      const result = await classifier.classify(createMessage('/settings'));
      expect(result.intent).toBe('settings');
      expect(result.confidence).toBe(1.0);
    });

    it('should classify "settings" text', async () => {
      const result = await classifier.classify(createMessage('settings'));
      expect(result.intent).toBe('settings');
      expect(result.confidence).toBe(1.0);
    });
  });

  describe('general intent', () => {
    it('should default to general for unknown messages', async () => {
      const result = await classifier.classify(createMessage('hello there'));
      expect(result.intent).toBe('general');
      expect(result.confidence).toBe(0.5);
    });
  });
});
