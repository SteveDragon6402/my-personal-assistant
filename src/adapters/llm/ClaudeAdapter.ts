import Anthropic from '@anthropic-ai/sdk';
import type {
  LLMPort,
  LLMRequest,
  LLMResponse,
  VisionRequest,
  ToolUseRequest,
  ToolUseResponse,
  ContentBlock,
  ToolCall,
} from '../../ports/LLMPort.js';
import type { Config } from '../../config/index.js';
import { createLogger } from '../../utils/logger.js';
import { LLMError } from '../../utils/errors.js';

/** Build system param with prompt caching so repeated use costs ~10% of normal input. */
function buildSystemParam(
  systemPrompt: string | undefined
): Array<{ type: 'text'; text: string; cache_control: { type: 'ephemeral'; ttl: '1h' } }> | undefined {
  if (!systemPrompt?.trim()) {
    return undefined;
  }
  return [
    {
      type: 'text',
      text: systemPrompt,
      cache_control: { type: 'ephemeral', ttl: '1h' },
    },
  ];
}

export class ClaudeAdapter implements LLMPort {
  private readonly logger = createLogger({ adapter: 'ClaudeAdapter' });
  private readonly client: Anthropic;
  private readonly textModel: string;
  private readonly visionModel: string;

  constructor(config: Config) {
    this.client = new Anthropic({ apiKey: config.anthropicApiKey });
    // Current models as of 2025/2026 - Claude Sonnet 4.5
    this.textModel = config.llmTextModel ?? 'claude-sonnet-4-5';
    this.visionModel = config.llmVisionModel ?? 'claude-sonnet-4-5';
    this.logger.info({ textModel: this.textModel, visionModel: this.visionModel }, 'Claude adapter initialized');
  }

  async generateText(request: LLMRequest): Promise<LLMResponse> {
    const logger = this.logger.child({ method: 'generateText' });
    try {
      const response = await this.client.messages.create({
        model: this.textModel,
        max_tokens: request.maxTokens ?? 800,
        temperature: request.temperature ?? 0.2,
        system: buildSystemParam(request.systemPrompt),
        messages: [
          {
            role: 'user',
            content: request.prompt,
          },
        ],
      });

      return buildLlmResponse(response);
    } catch (error) {
      logger.error({ error }, 'Claude text generation failed');
      throw new LLMError('Claude text generation failed', { cause: error });
    }
  }

  async generateVision(request: VisionRequest): Promise<LLMResponse> {
    const logger = this.logger.child({ method: 'generateVision' });
    try {
      const response = await this.client.messages.create({
        model: this.visionModel,
        max_tokens: request.maxTokens ?? 800,
        system: buildSystemParam(request.systemPrompt),
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                // SDK types only allow base64; API accepts url at runtime
                source: {
                  type: 'url',
                  url: request.imageUrl,
                } as unknown as { type: 'base64'; media_type: 'image/jpeg'; data: string },
              },
              {
                type: 'text',
                text: request.prompt,
              },
            ],
          },
        ],
      });

      return buildLlmResponse(response);
    } catch (error) {
      logger.error({ error }, 'Claude vision generation failed');
      throw new LLMError('Claude vision generation failed', { cause: error });
    }
  }

  async generateWithTools(request: ToolUseRequest): Promise<ToolUseResponse> {
    const logger = this.logger.child({ method: 'generateWithTools' });
    try {
      // Convert our message format to Anthropic's expected format
      const anthropicMessages = request.messages.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content as Anthropic.MessageParam['content'],
      }));

      // Convert our tool definitions to Anthropic's format
      const anthropicTools: Anthropic.Tool[] = request.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.input_schema as Anthropic.Tool.InputSchema,
      }));

      const response = await this.client.messages.create({
        model: this.textModel,
        max_tokens: request.maxTokens ?? 1024,
        system: buildSystemParam(request.systemPrompt),
        messages: anthropicMessages,
        tools: anthropicTools,
      });

      return buildToolUseResponse(response);
    } catch (error) {
      logger.error({ error }, 'Claude tool use generation failed');
      throw new LLMError('Claude tool use generation failed', { cause: error });
    }
  }
}

function buildLlmResponse(response: unknown): LLMResponse {
  const text = extractText(response);
  const usage = extractUsage(response);
  return {
    text,
    usage,
  };
}

function extractText(response: unknown): string {
  if (!isRecord(response)) {
    return '';
  }
  const content = response.content;
  if (!Array.isArray(content)) {
    return '';
  }
  for (const block of content) {
    if (isRecord(block) && block.type === 'text' && typeof block.text === 'string') {
      return block.text;
    }
  }
  return '';
}

function extractUsage(response: unknown): { inputTokens: number; outputTokens: number } | undefined {
  if (!isRecord(response)) {
    return undefined;
  }
  const usage = response.usage;
  if (!isRecord(usage)) {
    return undefined;
  }
  const inputTokens = typeof usage.input_tokens === 'number' ? usage.input_tokens : undefined;
  const outputTokens = typeof usage.output_tokens === 'number' ? usage.output_tokens : undefined;
  if (inputTokens === undefined || outputTokens === undefined) {
    return undefined;
  }
  return { inputTokens, outputTokens };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function buildToolUseResponse(response: Anthropic.Message): ToolUseResponse {
  const contentBlocks: ContentBlock[] = [];
  const toolCalls: ToolCall[] = [];
  let text: string | undefined;

  for (const block of response.content) {
    if (block.type === 'text') {
      contentBlocks.push({ type: 'text', text: block.text });
      text = block.text;
    } else if (block.type === 'tool_use') {
      contentBlocks.push({
        type: 'tool_use',
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      });
      toolCalls.push({
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      });
    }
  }

  const stopReason =
    response.stop_reason === 'tool_use'
      ? 'tool_use'
      : response.stop_reason === 'max_tokens'
        ? 'max_tokens'
        : 'end_turn';

  return {
    stopReason,
    text,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    contentBlocks,
    usage: response.usage
      ? {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        }
      : undefined,
  };
}
