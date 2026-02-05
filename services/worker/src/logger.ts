/**
 * P9.06: Structured Logging
 * Provides consistent, structured logging throughout the worker service.
 */

import { LOG_CONFIG } from './config.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp?: string;
  context?: Record<string, any>;
  runId?: string;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private minLevel: LogLevel;
  private structured: boolean;
  private includeTimestamp: boolean;

  constructor() {
    this.minLevel = LOG_CONFIG.level;
    this.structured = LOG_CONFIG.structured;
    this.includeTimestamp = LOG_CONFIG.includeTimestamp;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.minLevel];
  }

  private formatEntry(entry: LogEntry): string {
    if (this.structured) {
      return JSON.stringify(entry);
    }

    const parts: string[] = [];

    if (this.includeTimestamp && entry.timestamp) {
      parts.push(`[${entry.timestamp}]`);
    }

    parts.push(`[${entry.level.toUpperCase()}]`);

    if (entry.runId) {
      parts.push(`[run:${entry.runId}]`);
    }

    parts.push(entry.message);

    if (entry.context && Object.keys(entry.context).length > 0) {
      parts.push(JSON.stringify(entry.context));
    }

    if (entry.error) {
      parts.push(`Error: ${entry.error.message}`);
      if (entry.error.stack) {
        parts.push(`\n${entry.error.stack}`);
      }
    }

    return parts.join(' ');
  }

  private log(level: LogLevel, message: string, context?: Record<string, any>): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      level,
      message,
      context,
    };

    if (this.includeTimestamp) {
      entry.timestamp = new Date().toISOString();
    }

    const formatted = this.formatEntry(entry);

    switch (level) {
      case 'error':
        console.error(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      default:
        console.log(formatted);
    }
  }

  debug(message: string, context?: Record<string, any>): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, any>): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, any>): void {
    this.log('warn', message, context);
  }

  error(message: string, error?: Error, context?: Record<string, any>): void {
    const entry: LogEntry = {
      level: 'error',
      message,
      context,
    };

    if (this.includeTimestamp) {
      entry.timestamp = new Date().toISOString();
    }

    if (error) {
      entry.error = {
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
      };
    }

    const formatted = this.formatEntry(entry);
    console.error(formatted);
  }

  // Create a child logger with run context
  withRun(runId: string): RunLogger {
    return new RunLogger(this, runId);
  }
}

// Logger with run context
class RunLogger {
  constructor(private parent: Logger, private runId: string) {}

  private addRunContext(context?: Record<string, any>): Record<string, any> {
    return { runId: this.runId, ...context };
  }

  debug(message: string, context?: Record<string, any>): void {
    this.parent.debug(message, this.addRunContext(context));
  }

  info(message: string, context?: Record<string, any>): void {
    this.parent.info(message, this.addRunContext(context));
  }

  warn(message: string, context?: Record<string, any>): void {
    this.parent.warn(message, this.addRunContext(context));
  }

  error(message: string, error?: Error, context?: Record<string, any>): void {
    this.parent.error(message, error, this.addRunContext(context));
  }
}

// Export singleton instance
export const logger = new Logger();

// Export class for testing
export { Logger, RunLogger };
