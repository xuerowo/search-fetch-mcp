/**
 * 分層級日誌系統
 * 支援多級別日誌記錄、結構化輸出和敏感資訊過濾
 * 優先使用 MCP sendLoggingMessage，降級到 stderr
 */
export class Logger {
    config;
    logLevels = {
        debug: 0,
        info: 1,
        warn: 2,
        error: 3,
    };
    /**
     * 可選的 MCP 伺服器實例，用於發送協議標準日誌
     * @private
     */
    mcpServer;
    /**
     * 可選的會話 ID，用於 MCP 日誌通知
     * @private
     */
    sessionId;
    /**
     * 建構日誌記錄器
     * @param config - 日誌配置
     * @param mcpServer - 可選的 MCP 伺服器實例（用於標準日誌）
     * @param sessionId - 可選的會話 ID（用於 MCP 通知）
     */
    constructor(config, mcpServer, sessionId) {
        this.config = config;
        this.mcpServer = mcpServer;
        this.sessionId = sessionId;
    }
    /**
     * 設定 MCP 伺服器和會話 ID（用於後期綁定）
     * @param mcpServer - MCP 伺服器實例
     * @param sessionId - 會話 ID
     */
    setMcpContext(mcpServer, sessionId) {
        this.mcpServer = mcpServer;
        this.sessionId = sessionId;
    }
    /**
     * 記錄調試信息
     */
    debug(message, meta) {
        this.log("debug", message, undefined, meta);
    }
    /**
     * 記錄一般信息
     */
    info(message, meta) {
        this.log("info", message, undefined, meta);
    }
    /**
     * 記錄警告信息
     */
    warn(message, meta) {
        this.log("warn", message, undefined, meta);
    }
    /**
     * 記錄錯誤信息
     */
    error(message, error, meta) {
        this.log("error", message, error, meta);
    }
    /**
     * 核心日志記錄方法 - 優化版本，實作延遲格式化
     */
    log(level, message, error, meta) {
        // 早期返回檢查，避免不必要的處理
        if (this.logLevels[level] < this.logLevels[this.config.level]) {
            return;
        }
        // 延遲格式化：只在確定要輸出時才創建 entry
        const entry = {
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
     * 輸出日誌 - 優先使用 MCP 協議，降級到 stderr
     */
    output(entry, level) {
        // 優先使用 MCP sendLoggingMessage（如果可用）
        if (this.mcpServer && this.sessionId) {
            try {
                // 映射日誌級別到 MCP 標準級別
                const mcpLevel = this.mapToMcpLevel(level);
                // 構建 MCP 日誌數據
                let logData = entry.message;
                if (entry.error) {
                    logData += `\nError: ${entry.error.name}: ${entry.error.message}`;
                    if (entry.error.stack && this.config.level === "debug") {
                        logData += `\nStack: ${entry.error.stack}`;
                    }
                }
                if (entry.meta && Object.keys(entry.meta).length > 0) {
                    logData += `\nMeta: ${JSON.stringify(entry.meta, null, 2)}`;
                }
                // 發送 MCP 標準日誌（通過底層 server 實例）
                // 注意：McpServer 不直接暴露 sendLoggingMessage，需要通過 server 屬性訪問
                this.mcpServer.server?.sendLoggingMessage?.({
                    level: mcpLevel,
                    data: logData,
                    logger: "search-fetch-mcp",
                }, this.sessionId);
                return; // 成功發送 MCP 日誌，結束
            }
            catch (error) {
                // MCP 日誌發送失敗，降級到 stderr
                console.error(`[Logger] Failed to send MCP log: ${error}`);
            }
        }
        // 降級：輸出到 stderr（保持 stdout 純淨給 JSON-RPC）
        const formattedMessage = this.formatMessage(entry);
        console.error(formattedMessage);
    }
    /**
     * 映射日誌級別到 MCP 標準級別
     */
    mapToMcpLevel(level) {
        switch (level) {
            case "debug":
                return "debug";
            case "info":
                return "info";
            case "warn":
                return "warning";
            case "error":
                return "error";
            default:
                return "info";
        }
    }
    /**
     * 格式化日志消息 - 優化版本，減少字符串操作
     */
    formatMessage(entry) {
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
                const metaStr = this.config.level === "debug"
                    ? JSON.stringify(entry.meta, null, 2)
                    : JSON.stringify(entry.meta);
                message += `\nMeta: ${metaStr}`;
            }
            catch {
                message += `\nMeta: [無法序列化]`;
            }
        }
        return message;
    }
    /**
     * 清理元數據（移除敏感信息）- 擴展版本
     */
    sanitizeMeta(meta) {
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
    sanitizeUrl(url) {
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
        }
        catch {
            // 如果不是有效的 URL，直接返回
            return url;
        }
    }
    /**
     * 更新配置
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }
}
/**
 * 創建默認日志器實例
 */
export function createLogger(config) {
    return new Logger(config);
}
//# sourceMappingURL=logger.js.map