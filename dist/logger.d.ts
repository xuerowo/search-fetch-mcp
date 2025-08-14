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
export declare class Logger {
    private config;
    private readonly logLevels;
    constructor(config: LoggingConfig);
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
     * 輸出日志到控制台
     */
    private output;
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