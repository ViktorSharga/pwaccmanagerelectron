import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  OPERATION = 4, // Special level for status bar operations
}

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  message: string;
  details?: any;
  stackTrace?: string;
  context?: string;
}

export interface LogFilter {
  level?: LogLevel;
  startDate?: Date;
  endDate?: Date;
  searchText?: string;
}

export class LoggingService extends EventEmitter {
  private static instance: LoggingService;
  private logs: LogEntry[] = [];
  private readonly maxLogsInMemory = 1000; // Circular buffer size
  private currentOperation: string | null = null;
  private logFile: string;
  private writeQueue: LogEntry[] = [];
  private isWriting = false;
  private logLevel: LogLevel = LogLevel.INFO;

  private constructor() {
    super();
    this.logFile = path.join(app.getPath('userData'), 'app.log');
    this.setupLogRotation();
  }

  static getInstance(): LoggingService {
    if (!LoggingService.instance) {
      LoggingService.instance = new LoggingService();
    }
    return LoggingService.instance;
  }

  // Non-blocking log write with queue
  private async writeToFile(entry: LogEntry): Promise<void> {
    this.writeQueue.push(entry);

    if (!this.isWriting) {
      this.isWriting = true;
      // Process queue asynchronously
      setImmediate(() => this.processWriteQueue());
    }
  }

  private async processWriteQueue(): Promise<void> {
    while (this.writeQueue.length > 0) {
      const batch = this.writeQueue.splice(0, 50); // Process in batches
      const lines = batch.map((entry) => this.formatLogEntry(entry)).join('\n') + '\n';

      try {
        await fs.appendFile(this.logFile, lines, 'utf8');
      } catch (error) {
        console.error('Failed to write logs to file:', error);
      }
    }

    this.isWriting = false;
  }

  private formatLogEntry(entry: LogEntry): string {
    const levelStr = LogLevel[entry.level].padEnd(9);
    const timestamp = entry.timestamp.toISOString();
    let line = `[${timestamp}] [${levelStr}] ${entry.message}`;

    if (entry.context) {
      line += ` [${entry.context}]`;
    }

    if (entry.details) {
      line += ` ${JSON.stringify(entry.details)}`;
    }

    if (entry.stackTrace) {
      line += `\n${entry.stackTrace}`;
    }

    return line;
  }

  private async setupLogRotation(): Promise<void> {
    try {
      const stats = await fs.stat(this.logFile);
      // Rotate log if larger than 10MB
      if (stats.size > 10 * 1024 * 1024) {
        const backupPath = `${this.logFile}.${Date.now()}.bak`;
        await fs.rename(this.logFile, backupPath);

        // Keep only last 3 backup files
        const logDir = path.dirname(this.logFile);
        const files = await fs.readdir(logDir);
        const backups = files
          .filter((f) => f.startsWith(path.basename(this.logFile)) && f.endsWith('.bak'))
          .sort()
          .reverse();

        for (let i = 3; i < backups.length; i++) {
          await fs.unlink(path.join(logDir, backups[i])).catch(() => {});
        }
      }
    } catch (error) {
      // File doesn't exist yet, that's fine
    }
  }

  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  log(level: LogLevel, message: string, details?: any, context?: string): void {
    if (level < this.logLevel && level !== LogLevel.OPERATION) {
      return; // Skip logs below current level (except operations)
    }

    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      level,
      message,
      details,
      context,
    };

    // Capture stack trace for errors
    if (level === LogLevel.ERROR && details instanceof Error) {
      entry.stackTrace = details.stack;
      entry.details = {
        ...details,
        name: details.name,
        message: details.message,
      };
    }

    // Add to circular buffer
    this.logs.push(entry);
    if (this.logs.length > this.maxLogsInMemory) {
      this.logs.shift(); // Remove oldest
    }

    // Write to file asynchronously
    this.writeToFile(entry);

    // Emit events for UI updates
    this.emit('log-added', entry);

    if (level === LogLevel.ERROR) {
      this.emit('error-logged', entry);
    }
  }

  // Convenience methods
  debug(message: string, details?: any, context?: string): void {
    this.log(LogLevel.DEBUG, message, details, context);
  }

  info(message: string, details?: any, context?: string): void {
    this.log(LogLevel.INFO, message, details, context);
  }

  warn(message: string, details?: any, context?: string): void {
    this.log(LogLevel.WARN, message, details, context);
  }

  error(message: string, error?: Error | any, context?: string): void {
    this.log(LogLevel.ERROR, message, error, context);
  }

  // Simple status bar operation management
  startOperation(operation: string): void {
    console.log(`🚀 LoggingService.startOperation("${operation}")`);

    // Set the new operation and log it
    this.currentOperation = operation;
    this.log(LogLevel.OPERATION, operation, null, 'OPERATION_START');

    // Emit to renderer - renderer will handle timer logic
    console.log(`📡 Emitting operation-changed: "${operation}"`);
    this.emit('operation-changed', operation);
  }

  endOperation(success: boolean = true): void {
    if (this.currentOperation) {
      this.log(
        LogLevel.OPERATION,
        `${this.currentOperation} ${success ? 'completed' : 'failed'}`,
        null,
        'OPERATION_END'
      );
      this.currentOperation = null;
    }
  }

  getCurrentOperation(): string | null {
    return this.currentOperation;
  }

  // Force clear the status bar (for manual clearing if needed)
  clearOperation(): void {
    this.currentOperation = null;
    this.emit('operation-changed', null);
  }

  // Get logs with optional filtering
  getLogs(filter?: LogFilter): LogEntry[] {
    let filtered = [...this.logs];

    if (filter) {
      if (filter.level !== undefined) {
        filtered = filtered.filter((log) => log.level >= filter.level!);
      }

      if (filter.startDate) {
        filtered = filtered.filter((log) => log.timestamp >= filter.startDate!);
      }

      if (filter.endDate) {
        filtered = filtered.filter((log) => log.timestamp <= filter.endDate!);
      }

      if (filter.searchText) {
        const search = filter.searchText.toLowerCase();
        filtered = filtered.filter(
          (log) =>
            log.message.toLowerCase().includes(search) ||
            (log.context && log.context.toLowerCase().includes(search)) ||
            (log.details && JSON.stringify(log.details).toLowerCase().includes(search))
        );
      }
    }

    return filtered;
  }

  // Get recent errors for quick access
  getRecentErrors(count: number = 10): LogEntry[] {
    return this.logs.filter((log) => log.level === LogLevel.ERROR).slice(-count);
  }

  // Clear logs (both memory and file)
  async clearLogs(): Promise<void> {
    this.logs = [];
    this.writeQueue = [];

    try {
      await fs.unlink(this.logFile);
    } catch (error) {
      // File might not exist
    }

    this.emit('logs-cleared');
  }

  // Export logs to file
  async exportLogs(outputPath: string, filter?: LogFilter): Promise<void> {
    const logs = this.getLogs(filter);
    const content = logs.map((log) => this.formatLogEntry(log)).join('\n');
    await fs.writeFile(outputPath, content, 'utf8');
  }

  // Format log entry for clipboard
  formatForClipboard(entry: LogEntry): string {
    let formatted = `Timestamp: ${entry.timestamp.toISOString()}\n`;
    formatted += `Level: ${LogLevel[entry.level]}\n`;
    formatted += `Message: ${entry.message}\n`;

    if (entry.context) {
      formatted += `Context: ${entry.context}\n`;
    }

    if (entry.details) {
      formatted += `Details: ${JSON.stringify(entry.details, null, 2)}\n`;
    }

    if (entry.stackTrace) {
      formatted += `\nStack Trace:\n${entry.stackTrace}\n`;
    }

    return formatted;
  }

  destroy(): void {
    this.removeAllListeners();
    this.logs = [];
    this.writeQueue = [];
    this.currentOperation = null;
  }
}

// Export singleton instance
export const logger = LoggingService.getInstance();
