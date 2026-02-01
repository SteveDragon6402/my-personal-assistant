import Anthropic from '@anthropic-ai/sdk';
import type { LLMPort, LLMRequest, LLMResponse, VisionRequest, ToolUseRequest, ToolUseResponse } from '../../ports/LLMPort.js';
import type { Config } from '../../config/index.js';
import { createLogger } from '../../utils/logger.js';
import { LLMError } from '../../utils/errors.js';

/**
 * Haiku adapter for cheap, fast text generation (digest summaries).
 * Only implements generateText; vision and tools throw NotImplemented.
 */
export class HaikuAdapter implements LLMPort {
  private readonly logger = createLogger({ adapter: 'HaikuAdapter' });
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(config: Config) {
    this.client = new Anthropic({ apiKey: config.anthropicApiKey });
    this.model = config.llmDigestModel ?? 'claude-3-5-haiku-20241022';
    this.logger.info({ model: this.model }, 'Haiku adapter initialized');
  }

  async generateText(request: LLMRequest): Promise<LLMResponse> {
    const logger = this.logger.child({ method: 'generateText' });
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: request.maxTokens ?? 600,
        temperature: request.temperature ?? 0.3,
        system: request.systemPrompt,
        messages: [
          {
            role: 'user',
            content: request.prompt,
          },
        ],
      });

      const text = this.extractText(response);
      const usage = response.usage
        ? { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
        : undefined;

      logger.debug({ usage }, 'Haiku generation completed');

      return { text, usage };
    } catch (error) {
      logger.error({ error }, 'Haiku text generation failed');
      throw new LLMError('Haiku text generation failed', { cause: error });
    }
  }

  async generateVision(_request: VisionRequest): Promise<LLMResponse> {
    throw new LLMError('HaikuAdapter does not support vision');
  }

  async generateWithTools(_request: ToolUseRequest): Promise<ToolUseResponse> {
    throw new LLMError('HaikuAdapter does not support tool use');
  }

  private extractText(response: Anthropic.Message): string {
    for (const block of response.content) {
      if (block.type === 'text') {
        return block.text;
      }
    }
    return '';
  }
}
