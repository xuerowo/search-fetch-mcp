/**
 * 錯誤訊息和提示文字集中管理
 *
 * 集中管理所有用戶可見的訊息文字，便於維護和國際化
 */
/**
 * 搜索相關錯誤訊息
 */
export declare const SEARCH_MESSAGES: {
    readonly FAILED: (error: string) => string;
    readonly NO_RESULTS: "未找到相關結果";
    readonly TIMEOUT: "搜索請求超時";
    readonly NETWORK_ERROR: "網路連接失敗，請檢查網路設定";
    readonly RATE_LIMITED: "請求過於頻繁，請稍後重試";
};
/**
 * 網頁獲取相關錯誤訊息
 */
export declare const FETCH_MESSAGES: {
    readonly FAILED: (error: string) => string;
    readonly TIMEOUT: "網頁獲取超時";
    readonly NETWORK_ERROR: "無法連接到目標網站";
    readonly ACCESS_DENIED: "訪問被拒絕（403 Forbidden）";
    readonly NOT_FOUND: "網頁不存在（404 Not Found）";
    readonly SERVER_ERROR: "伺服器錯誤（5xx）";
    readonly INVALID_URL: "無效的 URL 格式";
    readonly CONTENT_TOO_LARGE: "內容過大，已截斷";
};
/**
 * 驗證相關錯誤訊息
 */
export declare const VALIDATION_MESSAGES: {
    readonly QUERY_EMPTY: "查詢字串不能為空";
    readonly QUERY_TOO_LONG: (maxLength: number) => string;
    readonly QUERY_INVALID: "查詢字串包含無效字符";
    readonly COUNT_INVALID: (min: number, max: number) => string;
    readonly TIMEOUT_INVALID: (min: number, max: number) => string;
    readonly URL_INVALID: "URL 格式無效";
    readonly URL_TOO_LONG: (maxLength: number) => string;
    readonly LANGUAGE_UNSUPPORTED: (language: string) => string;
    readonly FORMAT_UNSUPPORTED: (format: string) => string;
};
/**
 * 速率限制相關錯誤訊息
 */
export declare const RATE_LIMIT_MESSAGES: {
    readonly EXCEEDED: (retryAfter: number) => string;
    readonly CONFIG_INVALID: "速率限制配置無效";
};
/**
 * 伺服器相關訊息
 */
export declare const SERVER_MESSAGES: {
    readonly STARTED: (transport: string) => string;
    readonly START_FAILED: (error: string) => string;
    readonly STOPPING: "正在停止伺服器...";
    readonly STOPPED: "伺服器已停止";
};
/**
 * HTTP Transport 相關訊息
 */
export declare const HTTP_MESSAGES: {
    readonly SERVER_LISTENING: (host: string, port: number) => string;
    readonly MODE: (stateful: boolean) => string;
    readonly DNS_PROTECTION_ENABLED: "DNS rebinding protection enabled";
    readonly SESSION_CREATED: (sessionId: string) => string;
    readonly SESSION_CLOSED: (sessionId: string) => string;
    readonly SESSION_NOT_FOUND: "Session not found";
    readonly SESSION_REQUIRED: "Session ID required for non-initialization requests";
    readonly INVALID_JSON: "Invalid JSON body";
    readonly SERVER_ERROR: (error: string) => string;
};
/**
 * 日誌相關訊息
 */
export declare const LOG_MESSAGES: {
    readonly MCP_LOG_FAILED: (error: unknown) => string;
};
/**
 * 批量操作相關訊息
 */
export declare const BATCH_MESSAGES: {
    readonly EMPTY_INPUT: "批量操作的輸入列表不能為空";
    readonly PARTIAL_SUCCESS: (success: number, total: number) => string;
    readonly ALL_FAILED: "批量操作全部失敗";
};
/**
 * 操作建議訊息
 */
export declare const SUGGESTIONS: {
    readonly CHECK_NETWORK: "- 檢查網路連接";
    readonly RETRY_LATER: "- 稍後重試";
    readonly USE_SPA_MODE: "- 嘗試啟用 SPA 模式（useSPA=true）";
    readonly USE_STANDARD_MODE: "- 嘗試使用標準 HTTP 模式（useSPA=false）";
    readonly CHANGE_USER_AGENT: "- 嘗試更換 User-Agent";
    readonly REDUCE_FREQUENCY: "- 降低請求頻率";
    readonly CHECK_URL: "- 檢查 URL 是否正確";
    readonly USE_PAGINATION: "- 對於長內容，使用 startIndex 參數分段讀取";
    readonly CLEAR_COOKIES: "- 清除 Cookie 後重試";
    readonly CHECK_ROBOTS_TXT: "- 檢查網站的 robots.txt 政策";
};
/**
 * 格式化完整的錯誤訊息（包含建議）
 */
export declare function formatErrorWithSuggestions(error: string, suggestions: string[]): string;
/**
 * 格式化批量操作統計訊息
 */
export declare function formatBatchStats(stats: {
    total: number;
    success: number;
    failed: number;
    duration: number;
}): string;
/**
 * 格式化內容截斷提示
 */
export declare function formatContentTruncated(actualLength: number, maxLength: number): string;
/**
 * 格式化日期資訊
 */
export declare function formatDateInfo(publishedDate?: string, modifiedDate?: string): string;
//# sourceMappingURL=messages.d.ts.map