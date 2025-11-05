/**
 * MCP 伺服器型別定義
 */
// 重導出錯誤類別（來自 errors.ts）
export { ErrorCode, McpError, SearchError, RateLimitError, ValidationError, FetchError, toMcpError, isRetryableError, getRetryDelay, } from "./errors.js";
// 錯誤類別已移至 errors.ts，並在文件開頭重導出
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
//# sourceMappingURL=types.js.map