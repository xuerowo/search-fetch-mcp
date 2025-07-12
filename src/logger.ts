/**
 * 分層級日誌系統
 * 支援多級別日誌記錄、結構化輸出和敏感資訊過濾
 * 所有輸出導向 stderr 以保持 MCP 協議的 stdout 純淨性
 */

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  meta?: any;
}

export interface LoggingConfig {
  level: "debug" | "info" | "warn" | "error";
  logQueries: boolean;
}

export class Logger {
  private readonly logLevels: Record<string, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(private config: LoggingConfig) {}

  /**
   * 記錄調試信息
   */
  debug(message: string, meta?: any): void {
    this.log("debug", message, undefined, meta);
  }

  /**
   * 記錄一般信息
   */
  info(message: string, meta?: any): void {
    this.log("info", message, undefined, meta);
  }

  /**
   * 記錄警告信息
   */
  warn(message: string, meta?: any): void {
    this.log("warn", message, undefined, meta);
  }

  /**
   * 記錄錯誤信息
   */
  error(message: string, error?: Error, meta?: any): void {
    this.log("error", message, error, meta);
  }

  /**
   * 核心日志記錄方法 - 優化版本，實作延遲格式化
   */
  protected log(
    level: string,
    message: string,
    error?: Error,
    meta?: any,
  ): void {
    // 早期返回檢查，避免不必要的處理
    if (this.logLevels[level] < this.logLevels[this.config.level]) {
      return;
    }

    // 延遲格式化：只在確定要輸出時才創建 entry
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message,
    };

    // 延遲錯誤處理
    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    // 延遲元數據處理
    if (meta) {
      entry.meta = this.sanitizeMeta(meta);
    }

    // 輸出日志
    this.output(entry, level);
  }

  /**
   * 輸出日志到控制台
   */
  private output(entry: LogEntry, level: string): void {
    const formattedMessage = this.formatMessage(entry);

    // 所有日志都輸出到 stderr，保持 stdout 純淨給 JSON-RPC
    switch (level) {
      case "error":
        console.error(formattedMessage);
        break;
      case "warn":
        console.error(formattedMessage); // 使用 stderr
        break;
      case "debug":
        console.error(formattedMessage); // 使用 stderr
        break;
      default:
        console.error(formattedMessage); // 使用 stderr
    }
  }

  /**
   * 格式化日志消息 - 優化版本，減少字符串操作
   */
  private formatMessage(entry: LogEntry): string {
    // 基本消息格式，減少陣列操作
    let message = `[${entry.timestamp}] [${entry.level}] ${entry.message}`;

    // 只在需要時添加錯誤信息
    if (entry.error) {
      message += `\nError: ${entry.error.name}: ${entry.error.message}`;

      // 只在 debug 模式下添加 stack trace
      if (entry.error.stack && this.config.level === "debug") {
        message += `\nStack: ${entry.error.stack}`;
      }
    }

    // 優化元數據處理：簡化 JSON 序列化
    if (entry.meta) {
      try {
        // 在非 debug 模式下使用更簡潔的格式
        const metaStr =
          this.config.level === "debug"
            ? JSON.stringify(entry.meta, null, 2)
            : JSON.stringify(entry.meta);
        message += `\nMeta: ${metaStr}`;
      } catch {
        message += `\nMeta: [無法序列化]`;
      }
    }

    return message;
  }

  /**
   * 清理元數據（移除敏感信息）- 擴展版本
   */
  private sanitizeMeta(meta: any): any {
    if (!meta || typeof meta !== "object") {
      return meta;
    }

    const sanitized = { ...meta };

    // 擴展的敏感字段清單
    const sensitiveFields = [
      // 認證相關
      "password",
      "passwd",
      "pwd",
      "token",
      "key",
      "secret",
      "auth",
      "authorization",
      "bearer",
      "jwt",
      "session",
      "cookie",
      "credentials",
      "apikey",
      "api_key",

      // 個人資訊
      "email",
      "phone",
      "mobile",
      "ssn",
      "social_security",
      "credit_card",
      "card_number",

      // 系統資訊
      "path",
      "file_path",
      "home",
      "user_agent",
      "ip",
      "ip_address",
      "hostname",
    ];

    // 檢查字段名稱（不區分大小寫）
    for (const field of Object.keys(sanitized)) {
      const lowerField = field.toLowerCase();
      for (const sensitiveField of sensitiveFields) {
        if (lowerField.includes(sensitiveField.toLowerCase())) {
          sanitized[field] = "[已隱藏]";
          break;
        }
      }
    }

    // 限制查詢日志（如果配置要求）
    if (!this.config.logQueries && "query" in sanitized) {
      sanitized.query = "[已隱藏]";
    }

    // 清理 URL 中的敏感參數
    if ("url" in sanitized && typeof sanitized.url === "string") {
      sanitized.url = this.sanitizeUrl(sanitized.url);
    }

    return sanitized;
  }

  /**
   * 清理 URL 中的敏感參數
   */
  private sanitizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);

      // 清理查詢參數中的敏感資訊
      const sensitiveParams = [
        "token",
        "key",
        "secret",
        "auth",
        "password",
        "api_key",
      ];
      for (const param of sensitiveParams) {
        if (urlObj.searchParams.has(param)) {
          urlObj.searchParams.set(param, "[已隱藏]");
        }
      }

      return urlObj.toString();
    } catch {
      // 如果不是有效的 URL，直接返回
      return url;
    }
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<LoggingConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

/**
 * 創建默認日志器實例
 */
export function createLogger(config: LoggingConfig): Logger {
  return new Logger(config);
}
