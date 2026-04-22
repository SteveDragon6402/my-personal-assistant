import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgenticAssistant, type AgenticAssistantDependencies } from '../../core/agent/AgenticAssistant.js';
import type { MessagePort, IncomingMessage } from '../../ports/MessagePort.js';
import type { LLMPort, ToolUseResponse } from '../../ports/LLMPort.js';
import type { NotesPort } from '../../ports/NotesPort.js';
import type { EmailPort } from '../../ports/EmailPort.js';
import type { SleepDataPort } from '../../ports/SleepDataPort.js';
import type { MessageHistoryRepository } from '../../persistence/repositories/MessageHistoryRepository.js';
import type { MealRepository } from '../../persistence/repositories/MealRepository.js';
import type { HealthProfileRepository } from '../../persistence/repositories/HealthProfileRepository.js';
import type { SleepLogRepository } from '../../persistence/repositories/SleepLogRepository.js';
import type { UserPreferencesRepository } from '../../persistence/repositories/UserPreferencesRepository.js';

describe('AgenticAssistant', () => {
  let deps: AgenticAssistantDependencies;
  let messageHandler: (message: IncomingMessage) => Promise<void>;

  beforeEach(() => {
    const mockLLMResponse: ToolUseResponse = {
      stopReason: 'end_turn',
      text: 'Hello! How can I help you today?',
      contentBlocks: [{ type: 'text', text: 'Hello! How can I help you today?' }],
      usage: { inputTokens: 100, outputTokens: 50 },
    };

    deps = {
      messagePort: {
        onMessage: vi.fn((handler) => {
          messageHandler = handler;
        }),
        sendMessage: vi.fn().mockResolvedValue(undefined),
        getMediaUrl: vi.fn().mockResolvedValue('https://example.com/image.jpg'),
      } as unknown as MessagePort,
      llmPort: {
        generateText: vi.fn().mockResolvedValue({ text: 'test' }),
        generateVision: vi.fn().mockResolvedValue({ text: 'test' }),
        generateWithTools: vi.fn().mockResolvedValue(mockLLMResponse),
      } as unknown as LLMPort,
      notesPort: {
        createNote: vi.fn().mockResolvedValue({ path: 'test.md' }),
        appendToDaily: vi.fn().mockResolvedValue(undefined),
        searchNotes: vi.fn().mockResolvedValue([]),
        getTasks: vi.fn().mockResolvedValue([]),
        getCategories: vi.fn().mockResolvedValue([]),
        readNote: vi.fn().mockResolvedValue(null),
        readDailyNote: vi.fn().mockResolvedValue(null),
        listNotes: vi.fn().mockResolvedValue([]),
        updateNote: vi.fn().mockResolvedValue(undefined),
      } as unknown as NotesPort,
      emailPort: {
        getUnreadNewsletters: vi.fn().mockResolvedValue([]),
      } as unknown as EmailPort,
      sleepDataPort: {
        getLastNight: vi.fn().mockResolvedValue(null),
        getRange: vi.fn().mockResolvedValue([]),
      } as unknown as SleepDataPort,
      sleepLogRepository: {
        create: vi.fn().mockReturnValue({ id: 1 }),
        delete: vi.fn().mockReturnValue(true),
        deleteLast: vi.fn().mockReturnValue(null),
        update: vi.fn().mockReturnValue(null),
      } as unknown as SleepLogRepository,
      mealRepository: {
        create: vi.fn().mockReturnValue({ id: 1, description: 'test' }),
        getByDate: vi.fn().mockReturnValue([]),
        getByDateRange: vi.fn().mockReturnValue([]),
        delete: vi.fn().mockReturnValue(true),
        deleteLast: vi.fn().mockReturnValue(null),
        update: vi.fn().mockReturnValue(null),
      } as unknown as MealRepository,
      healthProfileRepository: {
        get: vi.fn().mockReturnValue(null),
        upsert: vi.fn().mockReturnValue({}),
      } as unknown as HealthProfileRepository,
      userPreferencesRepository: {
        get: vi.fn().mockReturnValue(null),
        getOrDefault: vi.fn().mockReturnValue({ timezone: 'UTC' }),
        upsert: vi.fn().mockReturnValue({}),
      } as unknown as UserPreferencesRepository,
      messageHistoryRepository: {
        save: vi.fn(),
        saveAssistantResponse: vi.fn(),
        getConversation: vi.fn().mockReturnValue([]),
        getRecent: vi.fn().mockReturnValue([]),
      } as unknown as MessageHistoryRepository,
      systemPrompt: 'You are a helpful assistant.',
    };

    new AgenticAssistant(deps);
  });

  it('should register message handler on construction', () => {
    expect(deps.messagePort.onMessage).toHaveBeenCalled();
    expect(messageHandler).toBeDefined();
  });

  it('should process text message and send response', async () => {
    const message: IncomingMessage = {
      id: 'msg-1',
      from: '123456',
      text: 'Hello',
      timestamp: new Date(),
      hasMedia: false,
    };

    await messageHandler(message);

    expect(deps.messageHistoryRepository.save).toHaveBeenCalledWith(message);
    expect(deps.llmPort.generateWithTools).toHaveBeenCalled();
    expect(deps.messagePort.sendMessage).toHaveBeenCalledWith(
      '123456',
      'Hello! How can I help you today?'
    );
    expect(deps.messageHistoryRepository.saveAssistantResponse).toHaveBeenCalledWith(
      '123456',
      'Hello! How can I help you today?'
    );
  });

  it('should include conversation context in LLM request', async () => {
    vi.mocked(deps.messageHistoryRepository.getConversation).mockReturnValue([
      { role: 'user', content: 'Previous message', timestamp: new Date() },
      { role: 'assistant', content: 'Previous response', timestamp: new Date() },
    ]);

    const message: IncomingMessage = {
      id: 'msg-2',
      from: '123456',
      text: 'New message',
      timestamp: new Date(),
      hasMedia: false,
    };

    await messageHandler(message);

    const llmCall = vi.mocked(deps.llmPort.generateWithTools).mock.calls[0]![0];
    expect(llmCall.messages).toHaveLength(3); // 2 history + 1 current
    expect(llmCall.messages[0]).toEqual({ role: 'user', content: 'Previous message' });
    expect(llmCall.messages[1]).toEqual({ role: 'assistant', content: 'Previous response' });
    expect(llmCall.messages[2]).toEqual({ role: 'user', content: 'New message' });
  });

  it('should handle tool use loop', async () => {
    const toolUseResponse: ToolUseResponse = {
      stopReason: 'tool_use',
      toolCalls: [
        { id: 'tool-1', name: 'get_current_date', input: {} },
      ],
      contentBlocks: [
        { type: 'tool_use', id: 'tool-1', name: 'get_current_date', input: {} },
      ],
      usage: { inputTokens: 100, outputTokens: 50 },
    };

    const finalResponse: ToolUseResponse = {
      stopReason: 'end_turn',
      text: 'Today is February 20, 2026.',
      contentBlocks: [{ type: 'text', text: 'Today is February 20, 2026.' }],
      usage: { inputTokens: 150, outputTokens: 30 },
    };

    vi.mocked(deps.llmPort.generateWithTools)
      .mockResolvedValueOnce(toolUseResponse)
      .mockResolvedValueOnce(finalResponse);

    const message: IncomingMessage = {
      id: 'msg-3',
      from: '123456',
      text: 'What day is it?',
      timestamp: new Date(),
      hasMedia: false,
    };

    await messageHandler(message);

    expect(deps.llmPort.generateWithTools).toHaveBeenCalledTimes(2);
    expect(deps.messagePort.sendMessage).toHaveBeenCalledWith(
      '123456',
      'Today is February 20, 2026.'
    );
  });

  it('should handle photo messages', async () => {
    const message: IncomingMessage = {
      id: 'msg-4',
      from: '123456',
      text: 'What is this?',
      timestamp: new Date(),
      hasMedia: true,
      mediaType: 'photo',
      mediaUrl: 'file-id-123',
    };

    await messageHandler(message);

    expect(deps.messagePort.getMediaUrl).toHaveBeenCalledWith('file-id-123');
    
    const llmCall = vi.mocked(deps.llmPort.generateWithTools).mock.calls[0]![0];
    const lastMessage = llmCall.messages[llmCall.messages.length - 1];
    expect(Array.isArray(lastMessage?.content)).toBe(true);
    
    const content = lastMessage?.content as Array<{ type: string }>;
    expect(content.some((c) => c.type === 'image')).toBe(true);
    expect(content.some((c) => c.type === 'text')).toBe(true);
  });

  it('should send error message on failure', async () => {
    vi.mocked(deps.llmPort.generateWithTools).mockRejectedValue(new Error('LLM error'));

    const message: IncomingMessage = {
      id: 'msg-5',
      from: '123456',
      text: 'Hello',
      timestamp: new Date(),
      hasMedia: false,
    };

    await messageHandler(message);

    expect(deps.messagePort.sendMessage).toHaveBeenCalledWith(
      '123456',
      expect.stringContaining('error')
    );
  });
});
