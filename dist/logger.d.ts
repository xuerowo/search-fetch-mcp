/**
 * 分層級日誌系統
 * 支援多級別日誌記錄、結構化輸出和敏感資訊過濾
 * 優先使用 MCP sendLoggingMessage，降級到 stderr
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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
export declare class Logger {
    private config;
    private readonly logLevels;
    /**
     * 可選的 MCP 伺服器實例，用於發送協議標準日誌
     * @private
     */
    private mcpServer?;
    /**
     * 可選的會話 ID，用於 MCP 日誌通知
     * @private
     */
    private sessionId?;
    /**
     * 建構日誌記錄器
     * @param config - 日誌配置
     * @param mcpServer - 可選的 MCP 伺服器實例（用於標準日誌）
     * @param sessionId - 可選的會話 ID（用於 MCP 通知）
     */
    constructor(config: LoggingConfig, mcpServer?: McpServer, sessionId?: string);
    /**
     * 設定 MCP 伺服器和會話 ID（用於後期綁定）
     * @param mcpServer - MCP 伺服器實例
     * @param sessionId - 會話 ID
     */
    setMcpContext(mcpServer: McpServer, sessionId?: string): void;
    /**
     * 記錄調試信息
     */
    debug(message: string, meta?: any): void;
    /**
     * 記錄一般信息
     */
    info(message: string, meta?: any): void;
    /**
     * 記錄警告信息
     */
    warn(message: string, meta?: any): void;
    /**
     * 記錄錯誤信息
     */
    error(message: string, error?: Error, meta?: any): void;
    /**
     * 核心日志記錄方法 - 優化版本，實作延遲格式化
     */
    protected log(level: string, message: string, error?: Error, meta?: any): void;
    /**
     * 輸出日誌 - 優先使用 MCP 協議，降級到 stderr
     */
    private output;
    /**
     * 映射日誌級別到 MCP 標準級別
     */
    private mapToMcpLevel;
    /**
     * 格式化日志消息 - 優化版本，減少字符串操作
     */
    private formatMessage;
    /**
     * 清理元數據（移除敏感信息）- 擴展版本
     */
    private sanitizeMeta;
    /**
     * 清理 URL 中的敏感參數
     */
    private sanitizeUrl;
    /**
     * 更新配置
     */
    updateConfig(newConfig: Partial<LoggingConfig>): void;
}
/**
 * 創建默認日志器實例
 */
export declare function createLogger(config: LoggingConfig): Logger;
//# sourceMappingURL=logger.d.ts.map