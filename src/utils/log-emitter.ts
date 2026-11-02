export interface LogEmitter {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export const NULL_EMITTER: LogEmitter = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

export const CONSOLE_EMITTER: LogEmitter = {
  debug: (message, context) =>
    context ? console.debug(message, context) : console.debug(message),
  info: (message, context) => (context ? console.info(message, context) : console.info(message)),
  warn: (message, context) => (context ? console.warn(message, context) : console.warn(message)),
  error: (message, context) =>
    context ? console.error(message, context) : console.error(message),
};
