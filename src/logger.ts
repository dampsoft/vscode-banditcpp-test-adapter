import { Log } from "vscode-test-adapter-util";

export type LogLevel = "debug" | "info" | "warning" | "error";
export const LogLevelDebug: LogLevel = "debug";
export const LogLevelInfo: LogLevel = "info";
export const LogLevelWarning: LogLevel = "warning";
export const LogLevelError: LogLevel = "error";

export class Logger {
  public static instance = new Logger();

  private logger: Log | undefined;
  public level: LogLevel = LogLevelWarning;

  public setLog(logger: Log) {
    this.logger = logger;
  }

  public log(message: string, level: LogLevel = LogLevelDebug) {
    if (!this.logger) return;
    if (this.logger.enabled) {
      switch (level) {
        case LogLevelDebug: {
          if (this.level == LogLevelDebug) this.logger.debug(message);
          break;
        }
        case LogLevelInfo: {
          if (this.level == LogLevelDebug || this.level == LogLevelInfo)
            this.logger.info(message);
          break;
        }
        case LogLevelWarning: {
          if (this.level != LogLevelError) this.logger.warn(message);
          break;
        }
        case LogLevelError: {
          this.logger.error(message);
          break;
        }
      }
    }
  }

  public debug(message: string) {
    this.log(message, LogLevelDebug);
  }

  public info(message: string) {
    this.log(message, LogLevelInfo);
  }

  public warn(message: string) {
    this.log(message, LogLevelWarning);
  }

  public error(message: string) {
    this.log(message, LogLevelError);
  }

  public dispose() {
    if (this.logger) {
      this.logger.dispose();
    }
  }
}
