import pino, { type Logger, type LoggerOptions } from 'pino';
import { getEnv } from './env';

export type { Logger };

/**
 * pino JSON logger. Source jobs must bind `source_id`, `run_id` and `shop` on a child logger
 * (CLAUDE.md conventions) so every line can be traced to a run.
 */
export function createLogger(name: string, options: LoggerOptions = {}): Logger {
  const env = getEnv();
  const base: LoggerOptions = {
    name,
    level: env.LOG_LEVEL,
    base: { app_env: env.APP_ENV, service: name },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: ['*.password', '*.apiKey', '*.api_key', '*.token', 'headers.authorization', 'headers.cookie'],
      censor: '[redacted]',
    },
    ...options,
  };
  if (env.LOG_PRETTY) {
    return pino({ ...base, transport: { target: 'pino-pretty', options: { colorize: true } } });
  }
  return pino(base);
}
