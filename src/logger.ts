export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

export class Logger {
  prefix: string;
  logLevel: LogLevel = LogLevel.DEBUG;

  constructor(prefix: string, level: LogLevel) {
    this.prefix = `%c[${prefix}]%c`;
    this.logLevel = level;
  }

  log(...data: unknown[]) {
    if (this.logLevel > LogLevel.DEBUG) return;

    console.log(this.prefix, 'color: blue', 'color: default', '[LOG]', ...data);
  }

  error(...data: unknown[]) {
    if (this.logLevel > LogLevel.ERROR) return;

    console.log(this.prefix, 'color: blue', 'color: default', '[ERROR]', ...data);
  }

  warn(...data: unknown[]) {
    if (this.logLevel > LogLevel.WARN) return;

    console.log(this.prefix, 'color: blue', 'color: default', '[WARN]', ...data);
  }

  info(...data: unknown[]) {
    if (this.logLevel > LogLevel.INFO) return;

    console.log(this.prefix, 'color: blue', 'color: default', '[INFO]', ...data);
  }

  debug(...data: unknown[]) {
    if (this.logLevel > LogLevel.DEBUG) return;

    console.log(this.prefix, 'color: blue', 'color: default', '[DEBUG]', ...data);
  }

  static create(prefix: string, level: LogLevel) {
    return new Logger(prefix, level);
  }
}
