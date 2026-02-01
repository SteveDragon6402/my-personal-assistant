export class AssistantError extends Error {
  public readonly code: string;

  constructor(message: string, code: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AssistantError';
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class AdapterError extends AssistantError {
  constructor(adapter: string, message: string, options?: ErrorOptions) {
    super(message, `ADAPTER_${adapter.toUpperCase()}`, options);
    this.name = 'AdapterError';
  }
}

export class SleepDataError extends AdapterError {
  constructor(message: string, options?: ErrorOptions) {
    super('SLEEP', message, options);
    this.name = 'SleepDataError';
  }
}

export class TelegramError extends AdapterError {
  constructor(message: string, options?: ErrorOptions) {
    super('TELEGRAM', message, options);
    this.name = 'TelegramError';
  }
}

export class LLMError extends AdapterError {
  constructor(message: string, options?: ErrorOptions) {
    super('LLM', message, options);
    this.name = 'LLMError';
  }
}

export class NotesError extends AdapterError {
  constructor(message: string, options?: ErrorOptions) {
    super('NOTES', message, options);
    this.name = 'NotesError';
  }
}

export class ConfigError extends AssistantError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'CONFIG_ERROR', options);
    this.name = 'ConfigError';
  }
}
