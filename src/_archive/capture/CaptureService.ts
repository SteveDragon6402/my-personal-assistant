import type { IncomingMessage } from '../../ports/MessagePort.js';
import type { NotesPort, NoteCategory } from '../../ports/NotesPort.js';
import type { LLMPort } from '../../ports/LLMPort.js';
import { createLogger } from '../../utils/logger.js';
import type { PendingCaptureRepository } from '../../persistence/repositories/PendingCaptureRepository.js';
import type { CaptureInput, CaptureOutcome, CategorySuggestion } from './types.js';

const DAILY_TAGS = new Set(['daily', 'journal', 'log']);
const CATEGORY_CONFIDENCE_THRESHOLD = 0.8;
const URL_PATTERN = /https?:\/\/[^\s]+/gi;
const MAX_CONTENT_LENGTH = 12000; // Limit fetched content to avoid token overflow

export class CaptureService {
  private readonly logger = createLogger({ service: 'CaptureService' });
  private readonly dailyFolder: string;

  constructor(
    private readonly notesPort: NotesPort,
    private readonly llmPort: LLMPort,
    private readonly pendingCaptureRepository: PendingCaptureRepository,
    private readonly categoryPrompt: string,
    private readonly linkSummaryPrompt: string,
    dailyFolder = 'Daily'
  ) {
    this.dailyFolder = dailyFolder;
  }

  /** Fetch webpage content from a URL and extract readable text. */
  private async fetchUrlContent(url: string): Promise<string | null> {
    const logger = this.logger.child({ method: 'fetchUrlContent', url });
    try {
      logger.info('Fetching URL content');
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PersonalAssistantBot/1.0)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(15000), // 15s timeout
      });

      if (!response.ok) {
        logger.warn({ status: response.status }, 'Failed to fetch URL');
        return null;
      }

      const html = await response.text();
      const text = this.extractTextFromHtml(html);
      const truncated = text.slice(0, MAX_CONTENT_LENGTH);
      logger.info(
        { htmlLength: html.length, textLength: text.length, truncatedLength: truncated.length },
        'Extracted text from URL'
      );
      return truncated;
    } catch (error) {
      logger.warn({ error }, 'Failed to fetch URL content');
      return null;
    }
  }

  /** Extract readable text from HTML, removing scripts, styles, and tags. */
  private extractTextFromHtml(html: string): string {
    let text = html;
    // Remove script and style blocks
    text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ');
    text = text.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, ' ');
    // Remove HTML comments
    text = text.replace(/<!--[\s\S]*?-->/g, ' ');
    // Remove nav, header, footer, aside (often boilerplate)
    text = text.replace(/<(nav|header|footer|aside)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
    // Convert common block elements to newlines
    text = text.replace(/<\/(p|div|h[1-6]|li|tr|br|hr)[^>]*>/gi, '\n');
    text = text.replace(/<br\s*\/?>/gi, '\n');
    // Remove all remaining HTML tags
    text = text.replace(/<[^>]+>/g, ' ');
    // Decode common HTML entities
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");
    text = text.replace(/&mdash;/g, '—');
    text = text.replace(/&ndash;/g, '–');
    // Collapse whitespace
    text = text.replace(/[ \t]+/g, ' ');
    text = text.replace(/\n\s*\n/g, '\n\n');
    return text.trim();
  }

  /** Call LLM to add a short summary/quick note below every capture. */
  private async enrichContentWithSummary(content: string): Promise<string> {
    const trimmed = content.trim();
    if (!trimmed) return content;
    const logger = this.logger.child({ method: 'enrichContentWithSummary' });
    logger.info({ contentLength: trimmed.length }, 'Generating summary for capture');

    // Check for URLs and fetch their content
    const urls = trimmed.match(URL_PATTERN) ?? [];
    let fetchedContent = '';
    if (urls.length > 0) {
      logger.info({ urlCount: urls.length, firstUrl: urls[0] }, 'Detected URLs, fetching content');
      // Fetch first URL only (to avoid excessive requests)
      const urlContent = await this.fetchUrlContent(urls[0] as string);
      if (urlContent) {
        fetchedContent = `\n\n--- PAGE CONTENT ---\n${urlContent}\n--- END PAGE CONTENT ---`;
      }
    }

    try {
      const promptContent = fetchedContent ? `${trimmed}${fetchedContent}` : trimmed;
      const prompt = this.linkSummaryPrompt.replace('{{CONTENT}}', promptContent);
      const response = await this.llmPort.generateText({
        prompt,
        maxTokens: 350,
        temperature: 0.3,
      });
      const raw = response.text ?? '';
      logger.debug({ rawResponse: raw.slice(0, 200) }, 'LLM raw response');
      const summary = this.normalizeSummary(raw);
      if (!summary) {
        logger.warn(
          { rawLength: raw.length, rawPreview: raw.slice(0, 80) },
          'LLM returned no usable summary; saving content without summary'
        );
        return content;
      }
      const enriched = `${content}\n\n${summary}`;
      logger.info({ summaryLength: summary.length, enrichedLength: enriched.length }, 'Added summary to capture');
      return enriched;
    } catch (error) {
      logger.error({ error }, 'Summary generation failed; saving content without summary');
      return content;
    }
  }

  /** Strip common prefixes/quotes from LLM response. */
  private normalizeSummary(raw: string): string {
    let s = raw.trim();
    if (!s) return '';
    const prefixes = [
      /^summary:\s*/i,
      /^executive\s+summary:\s*/i,
      /^here'?s?\s+(?:a\s+|an\s+)?(?:executive\s+)?summary:?\s*/i,
      /^"\s*/,
      /^\s*"\s*/,
      /^'\s*/,
    ];
    for (const re of prefixes) {
      s = s.replace(re, '').trim();
    }
    if (s.endsWith('"')) s = s.slice(0, -1).trim();
    if (s.endsWith("'")) s = s.slice(0, -1).trim();
    return s;
  }

  async handleCapture(message: IncomingMessage): Promise<CaptureOutcome> {
    const logger = this.logger.child({ messageId: message.id, from: message.from });
    const input = this.parseCaptureInput(message.text);

    if (!input.content) {
      logger.warn('Empty capture content');
      return {
        status: 'pending',
      };
    }

    const tags = input.tags.map((tag) => tag.toLowerCase());
    const shouldAppendDaily = this.shouldAppendToDaily(input, tags);

    if (shouldAppendDaily) {
      try {
        logger.info('Short capture → generating summary then appending to daily');
        const enrichedContent = await this.enrichContentWithSummary(input.content);
        logger.info(
          { originalLength: input.content.length, enrichedLength: enrichedContent.length },
          'Writing to daily note'
        );
        await this.notesPort.appendToDaily(enrichedContent);
        const dailyPath = this.getDailyPath();
        return { status: 'appended', path: dailyPath };
      } catch (error) {
        logger.error({ error }, 'Failed to append to daily note');
      }
    }

    let category = input.categoryHint;
    let suggestion: CategorySuggestion | null = null;
    let enrichedContent: string;

    if (!category) {
      const categories = await this.notesPort.getCategories();
      [suggestion, enrichedContent] = await Promise.all([
        this.suggestCategory(input, categories),
        this.enrichContentWithSummary(input.content),
      ]);
      if (suggestion && suggestion.confidence >= CATEGORY_CONFIDENCE_THRESHOLD) {
        category = suggestion.category;
      }
    } else {
      enrichedContent = await this.enrichContentWithSummary(input.content);
    }

    if (!category) {
      logger.info(
        { suggestedCategory: suggestion?.category, confidence: suggestion?.confidence },
        'Capture requires manual categorization'
      );
      this.pendingCaptureRepository.create({
        content: input.content,
        suggestedCategory: suggestion?.category,
        confidence: suggestion?.confidence,
      });
      await this.notesPort.appendToPending(enrichedContent, {
        suggestedCategory: suggestion?.category,
        confidence: suggestion?.confidence,
      });
      return {
        status: 'pending',
        suggestedCategory: suggestion?.category,
        confidence: suggestion?.confidence,
      };
    }

    const title = this.deriveTitle(input.content, suggestion?.title);
    try {
      const note = await this.notesPort.createNote({
        title,
        content: enrichedContent,
        category,
        tags,
      });

      return {
        status: 'created',
        path: note.path,
        category,
        title,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to create note, storing as pending');
      const fallbackContent = await this.enrichContentWithSummary(input.content);
      this.pendingCaptureRepository.create({
        content: input.content,
        suggestedCategory: category,
        confidence: suggestion?.confidence ?? 0,
      });
      await this.notesPort.appendToPending(fallbackContent, {
        suggestedCategory: category,
        confidence: suggestion?.confidence ?? 0,
      });
      return {
        status: 'pending',
        suggestedCategory: category,
        confidence: suggestion?.confidence ?? 0,
      };
    }
  }

  private parseCaptureInput(text: string): CaptureInput {
    const rawText = text.trim();
    let content = rawText.replace(/^\/capture\s*/i, '').replace(/^\/c\s*/i, '');

    const tags = this.extractTags(content);
    tags.forEach((tag) => {
      content = content.replace(new RegExp(`#${escapeRegex(tag)}\\b`, 'gi'), '').trim();
    });

    const categoryHintMatch = content.match(/@([A-Za-z0-9/_-]+)/);
    const categoryHint = categoryHintMatch?.[1];
    if (categoryHint) {
      content = content.replace(categoryHintMatch[0], '').trim();
    }

    return {
      rawText,
      content: content.trim(),
      tags,
      categoryHint,
    };
  }

  private extractTags(text: string): string[] {
    const tagMatches = text.match(/#([A-Za-z0-9/_-]+)/g);
    if (!tagMatches) {
      return [];
    }
    return tagMatches.map((tag) => tag.replace('#', '').trim()).filter(Boolean);
  }

  private shouldAppendToDaily(input: CaptureInput, tags: string[]): boolean {
    if (tags.some((tag) => DAILY_TAGS.has(tag))) {
      return true;
    }
    if (input.categoryHint && input.categoryHint.toLowerCase() === 'daily') {
      return true;
    }
    return input.content.length <= 160 && !input.categoryHint;
  }

  private getDailyPath(): string {
    const today = new Date().toISOString().split('T')[0];
    return `${this.dailyFolder}/${today}.md`;
  }

  private async suggestCategory(
    input: CaptureInput,
    categories: NoteCategory[]
  ): Promise<CategorySuggestion | null> {
    const logger = this.logger.child({ method: 'suggestCategory' });
    if (categories.length === 0) {
      logger.warn('No categories available for suggestion');
      return null;
    }

    const categoryList = categories.map((category) => category.path).join('\n');
    const prompt = this.categoryPrompt
      .replace('{{CONTENT}}', input.content)
      .replace('{{CATEGORIES}}', categoryList);

    try {
      const response = await this.llmPort.generateText({
        prompt,
        temperature: 0.2,
        maxTokens: 200,
      });

      return this.parseCategorySuggestion(response.text);
    } catch (error) {
      logger.error({ error }, 'Failed to get category suggestion');
      return null;
    }
  }

  private parseCategorySuggestion(text: string): CategorySuggestion | null {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]) as {
        category?: string;
        confidence?: number;
        title?: string;
      };
      if (!parsed.category || typeof parsed.confidence !== 'number') {
        return null;
      }
      const confidence = Math.min(Math.max(parsed.confidence, 0), 1);
      return {
        category: parsed.category,
        confidence,
        title: parsed.title,
      };
    } catch {
      return null;
    }
  }

  private deriveTitle(content: string, suggestedTitle?: string): string {
    if (suggestedTitle && suggestedTitle.trim().length > 0) {
      return suggestedTitle.trim();
    }
    const words = content.split(/\s+/).filter(Boolean);
    return words.slice(0, 8).join(' ') || 'Quick Capture';
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
