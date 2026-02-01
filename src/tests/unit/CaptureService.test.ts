import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CaptureService } from '../../core/capture/CaptureService.js';
import type { NotesPort } from '../../ports/NotesPort.js';
import type { LLMPort } from '../../ports/LLMPort.js';
import type { IncomingMessage } from '../../ports/MessagePort.js';
import type { PendingCaptureRepository } from '../../persistence/repositories/PendingCaptureRepository.js';

describe('CaptureService', () => {
  const prompt = `{"category":"Areas/Health","confidence":0.9,"title":"Health Note"}`;
  const linkSummaryPrompt = '{{CONTENT}}';
  let notesPort: NotesPort;
  let llmPort: LLMPort;
  let pendingRepo: PendingCaptureRepository;

  beforeEach(() => {
    notesPort = {
      getCategories: vi.fn().mockResolvedValue([
        { path: 'Areas/Health', name: 'Health', tags: [] },
        { path: 'Projects/Side', name: 'Side', tags: [] },
      ]),
      createNote: vi.fn().mockResolvedValue({ path: 'Areas/Health/Health Note.md' }),
      appendToDaily: vi.fn().mockResolvedValue(undefined),
      appendToPending: vi.fn().mockResolvedValue(undefined),
      searchNotes: vi.fn().mockResolvedValue([]),
      getTasks: vi.fn().mockResolvedValue([]),
    };
    llmPort = {
      generateText: vi.fn().mockResolvedValue({ text: prompt }),
      generateVision: vi.fn().mockResolvedValue({ text: '' }),
    };
    pendingRepo = {
      create: vi.fn().mockReturnValue({
        id: 1,
        content: 'test',
        createdAt: Date.now(),
      }),
      getUnresolved: vi.fn().mockReturnValue([]),
      resolve: vi.fn(),
    } as unknown as PendingCaptureRepository;
  });

  function createMessage(text: string): IncomingMessage {
    return {
      id: 'msg-1',
      from: '123',
      text,
      timestamp: new Date(),
      hasMedia: false,
    };
  }

  it('creates a note when category is provided', async () => {
    const service = new CaptureService(notesPort, llmPort, pendingRepo, prompt, linkSummaryPrompt);
    const outcome = await service.handleCapture(createMessage('/c Note content @Areas/Health #tag'));

    expect(outcome.status).toBe('created');
    expect(notesPort.createNote).toHaveBeenCalled();
  });

  it('appends to daily when tagged', async () => {
    const service = new CaptureService(notesPort, llmPort, pendingRepo, prompt, linkSummaryPrompt);
    const outcome = await service.handleCapture(createMessage('/c Quick thought #daily'));

    expect(outcome.status).toBe('appended');
    expect(notesPort.appendToDaily).toHaveBeenCalled();
  });

  it('uses LLM suggestion when no category provided', async () => {
    const service = new CaptureService(notesPort, llmPort, pendingRepo, prompt, linkSummaryPrompt);
    // Content must be > 160 chars to avoid being appended to daily note
    const longContent =
      'Zone 2 training article and notes on heart rate variability and how to structure weekly volume for endurance. This sentence is long enough to exceed the daily append length limit.';
    const content = longContent.length > 160 ? longContent : longContent + ' x'.repeat(80);
    const outcome = await service.handleCapture(createMessage(`/c ${content}`));

    expect(outcome.status).toBe('created');
    expect(notesPort.createNote).toHaveBeenCalled();
  });

  it('stores pending capture if LLM confidence is low', async () => {
    const categoryResponse = '{"category":"Areas/Health","confidence":0.4}';
    const summaryResponse = 'A note about pending categorization.';
    llmPort.generateText = vi
      .fn()
      .mockResolvedValueOnce({ text: categoryResponse })
      .mockResolvedValueOnce({ text: summaryResponse });
    // Content must be > 160 chars to avoid being appended to daily note
    const longContent =
      'Random note that is long enough to skip daily append so we hit the category suggestion path and end up pending. This exceeds the length limit.';
    const content = longContent.length > 160 ? longContent : longContent + ' x'.repeat(80);
    const service = new CaptureService(notesPort, llmPort, pendingRepo, prompt, linkSummaryPrompt);
    const outcome = await service.handleCapture(createMessage(`/c ${content}`));

    expect(outcome.status).toBe('pending');
    expect(pendingRepo.create).toHaveBeenCalled();
    const expectedEnriched = `${content}\n\n${summaryResponse}`;
    expect(notesPort.appendToPending).toHaveBeenCalledWith(expectedEnriched, {
      suggestedCategory: 'Areas/Health',
      confidence: 0.4,
    });
  });

  it('enriches content with LLM summary when it contains a link', async () => {
    const contentWithLink = 'https://example.com/article @Areas/Health';
    llmPort.generateText = vi.fn().mockResolvedValue({
      text: 'A brief summary of the linked article.',
    });
    const service = new CaptureService(notesPort, llmPort, pendingRepo, prompt, linkSummaryPrompt);
    const outcome = await service.handleCapture(createMessage(`/c ${contentWithLink}`));

    expect(outcome.status).toBe('created');
    const expectedContent =
      'https://example.com/article\n\nA brief summary of the linked article.';
    expect(notesPort.createNote).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expectedContent,
      })
    );
  });
});
