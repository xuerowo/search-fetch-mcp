/**
 * MCP 標準錯誤處理系統
 *
 * 遵循 Model Context Protocol 的錯誤處理規範，包含：
 * - JSON-RPC 2.0 標準錯誤碼
 * - MCP 協議自定義錯誤碼
 * - 業務邏輯錯誤類別
 *
 * @see https://spec.modelcontextprotocol.io/specification/protocol/errors/
 */
/**
 * MCP 標準錯誤碼
 *
 * 基於 JSON-RPC 2.0 規範和 MCP 協議擴展定義
 */
export declare enum ErrorCode {
    /** 解析錯誤：接收到的 JSON 無法解析 */
    ParseError = -32700,
    /** 無效請求：發送的 JSON 不是有效的請求對象 */
    InvalidRequest = -32600,
    /** 方法未找到：請求的方法不存在或不可用 */
    MethodNotFound = -32601,
    /** 無效參數：方法參數無效或缺失 */
    InvalidParams = -32602,
    /** 內部錯誤：伺服器內部錯誤 */
    InternalError = -32603,
    /** 連接關閉：客戶端或伺服器連接已關閉 */
    ConnectionClosed = -32000,
    /** 請求超時：請求處理超過時間限制 */
    RequestTimeout = -32001,
    /** 資源未找到：請求的資源不存在 */
    ResourceNotFound = -32002,
    /** 資源不可用：資源暫時不可用 */
    ResourceUnavailable = -32003,
    /** 工具執行失敗：工具執行過程中發生錯誤 */
    ToolExecutionError = -32004
}
/**
 * MCP 標準錯誤類別
 *
 * 用於協議級別的錯誤，包含標準錯誤碼和可選的詳細數據。
 * 這些錯誤會直接拋出，導致 MCP 請求失敗。
 *
 * @class McpError
 * @extends Error
 * @example
 * ```typescript
 * throw new McpError(
 *   ErrorCode.InvalidParams,
 *   "參數驗證失敗",
 *   { field: "query", reason: "不能為空" }
 * );
 * ```
 */
export declare class McpError extends Error {
    code: ErrorCode;
    data?: unknown | undefined;
    /**
     * 建構 MCP 標準錯誤
     *
     * @param code - 標準錯誤碼（來自 ErrorCode 枚舉）
     * @param message - 人類可讀的錯誤訊息
     * @param data - 可選的錯誤詳細數據（如：錯誤欄位、堆棧跟蹤等）
     */
    constructor(code: ErrorCode, message: string, data?: unknown | undefined);
    /**
     * 將錯誤轉換為 JSON-RPC 2.0 錯誤格式
     */
    toJSON(): {
        code: ErrorCode;
        message: string;
        data: unknown;
    };
}
/**
 * 搜索錯誤類別
 *
 * 當搜索操作失敗時使用，包含錯誤代碼和 HTTP 狀態碼。
 * 用於工具執行層級，不會直接拋出異常。
 *
 * @class SearchError
 * @extends Error
 * @example
 * ```typescript
 * throw new SearchError("搜索服務不可用", "SERVICE_UNAVAILABLE", 503);
 * ```
 */
export declare class SearchError extends Error {
    code?: string | undefined;
    statusCode?: number | undefined;
    /**
     * 建構搜索錯誤
     *
     * @param message - 錯誤訊息
     * @param code - 可選的錯誤代碼（如：NETWORK_ERROR, TIMEOUT 等）
     * @param statusCode - 可選的 HTTP 狀態碼
     */
    constructor(message: string, code?: string | undefined, statusCode?: number | undefined);
}
/**
 * 速率限制錯誤類別
 *
 * 當請求超出設定的速率限制時拋出的錯誤，包含重試等待時間資訊。
 *
 * @class RateLimitError
 * @extends Error
 * @example
 * ```typescript
 * throw new RateLimitError("請求過於頻繁，請稍後重試", 60); // 60 秒後重試
 * ```
 */
export declare class RateLimitError extends Error {
    retryAfter?: number | undefined;
    /**
     * 建構速率限制錯誤
     *
     * @param message - 錯誤訊息
     * @param retryAfter - 可選的建議重試等待時間（秒）
     */
    constructor(message: string, retryAfter?: number | undefined);
}
/**
 * 驗證錯誤類別
 *
 * 當輸入資料驗證失敗時拋出的錯誤，包含失敗的欄位資訊。
 *
 * @class ValidationError
 * @extends Error
 * @example
 * ```typescript
 * throw new ValidationError("查詢字串不能為空", "query");
 * ```
 */
export declare class ValidationError extends Error {
    field?: string | undefined;
    /**
     * 建構驗證錯誤
     *
     * @param message - 錯誤訊息
     * @param field - 可選的驗證失敗欄位名稱
     */
    constructor(message: string, field?: string | undefined);
}
/**
 * 網頁獲取錯誤類別
 *
 * 當網頁獲取操作失敗時使用，包含錯誤代碼和 HTTP 狀態碼。
 * 用於工具執行層級，不會直接拋出異常。
 *
 * @class FetchError
 * @extends Error
 * @example
 * ```typescript
 * throw new FetchError("無法連接到伺服器", "NETWORK_ERROR", 0);
 * ```
 */
export declare class FetchError extends Error {
    code?: string | undefined;
    statusCode?: number | undefined;
    /**
     * 建構網頁獲取錯誤
     *
     * @param message - 錯誤訊息
     * @param code - 可選的錯誤代碼（如：TIMEOUT, NETWORK_ERROR 等）
     * @param statusCode - 可選的 HTTP 狀態碼
     */
    constructor(message: string, code?: string | undefined, statusCode?: number | undefined);
}
/**
 * 將任意錯誤轉換為標準 MCP 錯誤
 *
 * @param error - 原始錯誤對象
 * @returns MCP 標準錯誤
 */
export declare function toMcpError(error: unknown): McpError;
/**
 * 檢查錯誤是否為可重試錯誤
 *
 * @param error - 錯誤對象
 * @returns 是否可重試
 */
export declare function isRetryableError(error: unknown): boolean;
/**
 * 從錯誤中提取重試延遲時間（秒）
 *
 * @param error - 錯誤對象
 * @returns 重試延遲時間（秒），如果不適用則返回 undefined
 */
export declare function getRetryDelay(error: unknown): number | undefined;
//# sourceMappingURL=errors.d.ts.map