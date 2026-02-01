export interface LLMRequest {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMResponse {
  text: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface VisionRequest {
  imageUrl: string;
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
}

// Tool use types for agentic interactions
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
}

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ImageContent {
  type: 'image';
  source: {
    type: 'url';
    url: string;
  };
}

export type ContentBlock = TextContent | ToolUseContent | ToolResultContent | ImageContent;

export interface Message {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface ToolUseRequest {
  messages: Message[];
  tools: ToolDefinition[];
  systemPrompt?: string;
  maxTokens?: number;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolUseResponse {
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens';
  text?: string;
  toolCalls?: ToolCall[];
  contentBlocks: ContentBlock[];
  usage?: { inputTokens: number; outputTokens: number };
}

export interface LLMPort {
  generateText(request: LLMRequest): Promise<LLMResponse>;
  generateVision(request: VisionRequest): Promise<LLMResponse>;
  generateWithTools(request: ToolUseRequest): Promise<ToolUseResponse>;
}
