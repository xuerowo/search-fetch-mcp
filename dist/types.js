/**
 * MCP 伺服器型別定義
 */
/**
 * 搜索錯誤類別
 *
 * 專門處理搜索相關錯誤的自訂錯誤類別，提供錯誤代碼和 HTTP 狀態碼
 * 等額外資訊，便於錯誤處理和調試。
 *
 * @class SearchError
 * @extends Error
 * @example
 * ```typescript
 * throw new SearchError("搜索請求失敗", "SEARCH_FAILED", 500);
 * ```
 */
export class SearchError extends Error {
    code;
    statusCode;
    constructor(message, code, statusCode) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.name = "SearchError";
    }
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
 * throw new RateLimitError("請求過於頻繁", 60); // 60 秒後重試
 * ```
 */
export class RateLimitError extends Error {
    retryAfter;
    /**
     * 建構速率限制錯誤
     * @param message - 錯誤訊息
     * @param retryAfter - 建議重試等待時間（秒）
     */
    constructor(message, retryAfter) {
        super(message);
        this.retryAfter = retryAfter;
        this.name = "RateLimitError";
    }
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
export class ValidationError extends Error {
    field;
    /**
     * 建構驗證錯誤
     * @param message - 錯誤訊息
     * @param field - 驗證失敗的欄位名稱
     */
    constructor(message, field) {
        super(message);
        this.field = field;
        this.name = "ValidationError";
    }
}
/**
 * 型別守衛函數：檢查值是否為 Error 型別
 *
 * @param value - 待檢查的值
 * @returns 如果值是 Error 實例則返回 true
 * @example
 * ```typescript
 * if (isError(someValue)) {
 *   console.log(someValue.message); // TypeScript 知道這是 Error
 * }
 * ```
 */
export function isError(value) {
    return value instanceof Error;
}
/**
 * 安全地從未知錯誤中提取訊息
 *
 * 處理各種型別的錯誤值，統一轉換為字串訊息。
 *
 * @param error - 未知型別的錯誤值
 * @returns 錯誤訊息字串
 * @example
 * ```typescript
 * const message = getErrorMessage(unknownError);
 * console.log(message); // 總是得到字串
 * ```
 */
export function getErrorMessage(error) {
    if (isError(error)) {
        return error.message;
    }
    if (typeof error === "string") {
        return error;
    }
    return String(error);
}
/**
 * 網頁獲取錯誤類別
 *
 * 專門處理網頁獲取相關錯誤的自訂錯誤類別。
 *
 * @class FetchError
 * @extends Error
 * @example
 * ```typescript
 * throw new FetchError("網頁無法訪問", "ACCESS_DENIED", 403);
 * ```
 */
export class FetchError extends Error {
    code;
    statusCode;
    /**
     * 建構網頁獲取錯誤
     * @param message - 錯誤訊息
     * @param code - 錯誤代碼
     * @param statusCode - HTTP 狀態碼
     */
    constructor(message, code, statusCode) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.name = "FetchError";
    }
}
//# sourceMappingURL=types.js.map