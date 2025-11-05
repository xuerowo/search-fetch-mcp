/**
 * 全局常量定義
 *
 * 集中管理項目中的所有常量值，避免 Magic Numbers 和硬編碼
 */
/**
 * 內容處理常量
 */
export declare const CONTENT_LIMITS: {
    /** 最大內容長度（字符） */
    readonly MAX_CONTENT_LENGTH: 50000;
    /** 內容截斷時的安全緩衝區 */
    readonly SAFE_END_BUFFER: 100;
    /** 最大 Cookie 有效期（毫秒） */
    readonly MAX_COOKIE_AGE: 3600000;
};
/**
 * 搜索相關常量
 */
export declare const SEARCH_CONSTANTS: {
    /** 預設返回結果數量 */
    readonly DEFAULT_COUNT: 10;
    /** 最大返回結果數量 */
    readonly MAX_COUNT: 50;
    /** 最小返回結果數量 */
    readonly MIN_COUNT: 1;
    /** 搜索超時時間（毫秒） */
    readonly DEFAULT_TIMEOUT: 30000;
    /** 批量搜索最大並發數 */
    readonly MAX_BATCH_CONCURRENCY: 5;
};
/**
 * 網頁獲取相關常量
 */
export declare const FETCH_CONSTANTS: {
    /** 預設獲取超時時間（毫秒） */
    readonly DEFAULT_TIMEOUT: 60000;
    /** 批量獲取最大並發數 */
    readonly MAX_BATCH_CONCURRENCY: 5;
    /** 請求重試次數 */
    readonly MAX_RETRIES: 3;
    /** 重試延遲時間（毫秒） */
    readonly RETRY_DELAY: 1000;
};
/**
 * 速率限制常量
 */
export declare const RATE_LIMIT_CONSTANTS: {
    /** 預設每秒請求數 */
    readonly DEFAULT_REQUESTS_PER_SECOND: 1;
    /** 最小每秒請求數 */
    readonly MIN_REQUESTS_PER_SECOND: 0.1;
    /** 最大每秒請求數 */
    readonly MAX_REQUESTS_PER_SECOND: 10;
};
/**
 * 輸入驗證常量
 */
export declare const VALIDATION_CONSTANTS: {
    /** 查詢字串最大長度 */
    readonly MAX_QUERY_LENGTH: 500;
    /** 查詢字串最小長度 */
    readonly MIN_QUERY_LENGTH: 1;
    /** URL 最大長度 */
    readonly MAX_URL_LENGTH: 2048;
    /** 超時最小值（毫秒） */
    readonly MIN_TIMEOUT: 1000;
    /** 超時最大值（毫秒） */
    readonly MAX_TIMEOUT: 300000;
};
/**
 * 瀏覽器池常量
 */
export declare const BROWSER_POOL_CONSTANTS: {
    /** 預設最大瀏覽器實例數 */
    readonly DEFAULT_MAX_INSTANCES: 4;
    /** 預設瀏覽器空閒超時時間（毫秒） */
    readonly DEFAULT_IDLE_TIMEOUT: 300000;
    /** 標籤頁預熱數量 */
    readonly PREWARMING_TAB_COUNT: 2;
};
/**
 * 延遲時間常量（毫秒）
 */
export declare const DELAY_CONSTANTS: {
    /** 最小請求延遲 */
    readonly MIN_REQUEST_DELAY: 500;
    /** 最大請求延遲 */
    readonly MAX_REQUEST_DELAY: 2000;
    /** 標準請求延遲 */
    readonly DEFAULT_REQUEST_DELAY: 300;
    /** 特殊網站延遲（如 DuckDuckGo） */
    readonly SPECIAL_SITE_DELAY: 1000;
};
/**
 * HTTP 狀態碼
 */
export declare const HTTP_STATUS: {
    /** 成功 */
    readonly OK: 200;
    /** 壞請求 */
    readonly BAD_REQUEST: 400;
    /** 禁止訪問 */
    readonly FORBIDDEN: 403;
    /** 未找到 */
    readonly NOT_FOUND: 404;
    /** 請求過多 */
    readonly TOO_MANY_REQUESTS: 429;
    /** 內部伺服器錯誤 */
    readonly INTERNAL_SERVER_ERROR: 500;
    /** 服務不可用 */
    readonly SERVICE_UNAVAILABLE: 503;
    /** 閘道超時 */
    readonly GATEWAY_TIMEOUT: 504;
};
/**
 * 可重試的 HTTP 狀態碼
 */
export declare const RETRYABLE_STATUS_CODES: readonly [429, 503, 504];
/**
 * 輸出格式
 */
export declare const OUTPUT_FORMATS: {
    readonly HTML: "html";
    readonly MARKDOWN: "markdown";
    readonly TEXT: "text";
    readonly JSON: "json";
};
/**
 * 日誌級別
 */
export declare const LOG_LEVELS: {
    readonly DEBUG: "debug";
    readonly INFO: "info";
    readonly WARN: "warn";
    readonly ERROR: "error";
};
/**
 * MCP Transport 類型
 */
export declare const TRANSPORT_TYPES: {
    readonly STDIO: "stdio";
    readonly HTTP: "http";
};
/**
 * 環境變數鍵名
 */
export declare const ENV_KEYS: {
    readonly MCP_TRANSPORT: "MCP_TRANSPORT";
    readonly MCP_HTTP_PORT: "MCP_HTTP_PORT";
    readonly MCP_HTTP_HOST: "MCP_HTTP_HOST";
    readonly MCP_HTTP_STATEFUL: "MCP_HTTP_STATEFUL";
    readonly MCP_ALLOWED_HOSTS: "MCP_ALLOWED_HOSTS";
    readonly MCP_ALLOWED_ORIGINS: "MCP_ALLOWED_ORIGINS";
    readonly RATE_LIMIT_RPS: "RATE_LIMIT_RPS";
    readonly LOG_LEVEL: "LOG_LEVEL";
    readonly LOG_QUERIES: "LOG_QUERIES";
    readonly SEARCH_DEFAULT_COUNT: "SEARCH_DEFAULT_COUNT";
    readonly SEARCH_MAX_COUNT: "SEARCH_MAX_COUNT";
    readonly SEARCH_TIMEOUT: "SEARCH_TIMEOUT";
    readonly FETCH_TIMEOUT: "FETCH_TIMEOUT";
    readonly FETCH_DEFAULT_FORMAT: "FETCH_DEFAULT_FORMAT";
    readonly FETCH_DEFAULT_USE_SPA: "FETCH_DEFAULT_USE_SPA";
};
//# sourceMappingURL=constants.d.ts.map