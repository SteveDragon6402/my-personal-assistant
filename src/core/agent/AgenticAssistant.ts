import type { MessagePort, IncomingMessage } from '../../ports/MessagePort.js';
import type { LLMPort, Message, ContentBlock } from '../../ports/LLMPort.js';
import type { NotesPort } from '../../ports/NotesPort.js';
import type { EmailPort } from '../../ports/EmailPort.js';
import type { SleepDataPort } from '../../ports/SleepDataPort.js';
import type { MessageHistoryRepository } from '../../persistence/repositories/MessageHistoryRepository.js';
import type { MealRepository } from '../../persistence/repositories/MealRepository.js';
import type { SleepLogRepository } from '../../persistence/repositories/SleepLogRepository.js';
import { ToolExecutor, type ToolExecutorDependencies } from './ToolExecutor.js';
import { ALL_TOOLS } from './tools.js';
import { createLogger } from '../../utils/logger.js';
import { clearCorrelationId, generateCorrelationId, setCorrelationId } from '../../utils/logger.js';

const MAX_TOOL_ITERATIONS = 10;

export interface AgenticAssistantDependencies {
  messagePort: MessagePort;
  llmPort: LLMPort;
  notesPort: NotesPort;
  emailPort: EmailPort;
  sleepDataPort: SleepDataPort;
  sleepLogRepository: SleepLogRepository;
  mealRepository: MealRepository;
  messageHistoryRepository: MessageHistoryRepository;
  systemPrompt: string;
}

export class AgenticAssistant {
  private readonly logger = createLogger({ service: 'AgenticAssistant' });
  private readonly deps: AgenticAssistantDependencies;

  constructor(deps: AgenticAssistantDependencies) {
    this.deps = deps;
    this.setupMessageHandler();
  }

  private setupMessageHandler(): void {
    this.deps.messagePort.onMessage(async (message) => {
      const correlationId = generateCorrelationId();
      setCorrelationId(correlationId);

      const logger = this.logger.child({ correlationId, from: message.from });
      logger.info({ messageId: message.id, text: message.text }, 'Received message');

      try {
        // Save user message to history
        this.deps.messageHistoryRepository.save(message);

        // Process message through the agent
        await this.handleMessage(message);
      } catch (error) {
        logger.error({ error }, 'Error handling message');
        await this.deps.messagePort.sendMessage(
          message.from,
          'Sorry, I encountered an error processing your message. Please try again.'
        );
      } finally {
        clearCorrelationId();
      }
    });
  }

  private async handleMessage(message: IncomingMessage): Promise<void> {
    const logger = this.logger.child({ method: 'handleMessage', from: message.from });
    const chatId = message.from;

    // Process only the current message (no history to avoid re-running old commands)
    const messages: Message[] = [
      {
        role: 'user',
        content: message.text,
      },
    ];

    // Create tool executor for this chat
    const toolExecutorDeps: ToolExecutorDependencies = {
      notesPort: this.deps.notesPort,
      emailPort: this.deps.emailPort,
      sleepDataPort: this.deps.sleepDataPort,
      sleepLogRepository: this.deps.sleepLogRepository,
      mealRepository: this.deps.mealRepository,
    };
    const toolExecutor = new ToolExecutor(toolExecutorDeps, chatId);

    // Track cumulative usage across all iterations
    const totalUsage = { inputTokens: 0, outputTokens: 0 };

    // Run the agent loop
    let response = await this.deps.llmPort.generateWithTools({
      messages,
      tools: ALL_TOOLS,
      systemPrompt: this.deps.systemPrompt,
      maxTokens: 1024,
    });

    // Accumulate usage from first call
    if (response.usage) {
      totalUsage.inputTokens += response.usage.inputTokens;
      totalUsage.outputTokens += response.usage.outputTokens;
    }

    let iterations = 0;

    // Continue looping while Claude wants to use tools
    while (response.stopReason === 'tool_use' && iterations < MAX_TOOL_ITERATIONS) {
      iterations++;
      logger.info(
        { iteration: iterations, toolCalls: response.toolCalls?.length },
        'Processing tool calls'
      );

      if (!response.toolCalls || response.toolCalls.length === 0) {
        logger.warn('Got tool_use stop reason but no tool calls');
        break;
      }

      // Add assistant's response (with tool calls) to messages
      messages.push({
        role: 'assistant',
        content: response.contentBlocks,
      });

      // Execute all tool calls and build tool results
      const toolResults: ContentBlock[] = [];
      for (const toolCall of response.toolCalls) {
        logger.info({ toolName: toolCall.name, toolId: toolCall.id }, 'Executing tool');

        const result = await toolExecutor.execute(toolCall.name, toolCall.input);

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: result,
        });
      }

      // Add tool results as a user message
      messages.push({
        role: 'user',
        content: toolResults,
      });

      // Continue the conversation
      response = await this.deps.llmPort.generateWithTools({
        messages,
        tools: ALL_TOOLS,
        systemPrompt: this.deps.systemPrompt,
        maxTokens: 1024,
      });

      // Accumulate usage from this iteration
      if (response.usage) {
        totalUsage.inputTokens += response.usage.inputTokens;
        totalUsage.outputTokens += response.usage.outputTokens;
      }
    }

    if (iterations >= MAX_TOOL_ITERATIONS) {
      logger.warn({ iterations }, 'Reached max tool iterations');
    }

    // Extract the final text response
    const finalText = response.text ?? 'I processed your request but have nothing to say.';

    // Save assistant response to history
    this.deps.messageHistoryRepository.saveAssistantResponse(chatId, finalText);

    // Send the response to the user
    await this.deps.messagePort.sendMessage(chatId, finalText);

    logger.info(
      {
        iterations,
        responseLength: finalText.length,
        usage: totalUsage,
      },
      'Message processed successfully'
    );
  }
}
