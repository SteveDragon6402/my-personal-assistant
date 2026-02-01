import type {
  LLMPort,
  LLMRequest,
  LLMResponse,
  VisionRequest,
  ToolUseRequest,
  ToolUseResponse,
} from '../../ports/LLMPort.js';
import { createLogger } from '../../utils/logger.js';

export class DisabledLLMAdapter implements LLMPort {
  private readonly logger = createLogger({ adapter: 'DisabledLLMAdapter' });

  async generateText(_request: LLMRequest): Promise<LLMResponse> {
    this.logger.warn('LLM adapter is disabled; returning empty response');
    return { text: '' };
  }

  async generateVision(_request: VisionRequest): Promise<LLMResponse> {
    this.logger.warn('LLM adapter is disabled; returning empty response');
    return { text: '' };
  }

  async generateWithTools(_request: ToolUseRequest): Promise<ToolUseResponse> {
    this.logger.warn('LLM adapter is disabled; returning fallback response');
    return {
      stopReason: 'end_turn',
      text: 'I apologize, but the AI assistant is not configured. Please set up your Anthropic API key to enable full functionality.',
      contentBlocks: [
        {
          type: 'text',
          text: 'I apologize, but the AI assistant is not configured. Please set up your Anthropic API key to enable full functionality.',
        },
      ],
    };
  }
}
