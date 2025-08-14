import { ValidationError, getErrorMessage } from "./types.js";
import { supportedLanguages } from "./config.js";
/**
 * 輸入資料驗證器
 */
export class InputValidator {
    static validateQuery(query) {
        if (query === undefined || query === null) {
            throw new ValidationError("搜索查詢是必需的", "query");
        }
        if (typeof query !== "string") {
            throw new ValidationError("搜索查詢必須是字符串", "query");
        }
        const trimmed = query.trim();
        if (trimmed.length === 0) {
            throw new ValidationError("搜索查詢不能為空", "query");
        }
        if (trimmed.length > 500) {
            throw new ValidationError("搜索查詢長度不能超過 500 字符", "query");
        }
        // 檢查惡意內容
        if (this.containsMaliciousContent(trimmed)) {
            throw new ValidationError("搜索查詢包含不允許的內容", "query");
        }
        // 清理多餘空格但保留原有空格結構
        return this.sanitizeQuery(trimmed);
    }
    static validateCount(count, maxCount = 50) {
        if (count === undefined || count === null) {
            return 10; // 默認值
        }
        let num;
        if (typeof count === "string") {
            const trimmed = count.trim();
            if (!/^\d+(\.\d+)?$/.test(trimmed)) {
                throw new ValidationError("結果數量必須是有效數字", "count");
            }
            num = parseFloat(trimmed);
        }
        else if (typeof count === "number") {
            num = count;
        }
        else {
            throw new ValidationError("結果數量必須是數字", "count");
        }
        if (isNaN(num)) {
            throw new ValidationError("結果數量必須是有效數字", "count");
        }
        if (num < 1) {
            throw new ValidationError("結果數量必須至少為 1", "count");
        }
        if (num > maxCount) {
            throw new ValidationError(`結果數量不能超過 ${maxCount}`, "count");
        }
        return Math.floor(num);
    }
    static validateLanguage(language) {
        if (language === undefined || language === null) {
            return "wt-wt"; // 默認全球
        }
        if (typeof language !== "string") {
            throw new ValidationError("語言代碼必須是字符串", "language");
        }
        const trimmed = language.trim().toLowerCase();
        if (!supportedLanguages.includes(trimmed)) {
            throw new ValidationError(`不支援的語言代碼: ${language}。支援的代碼: ${supportedLanguages.join(", ")}`, "language");
        }
        return trimmed;
    }
    /**
     * 驗證安全搜索等級設定
     * @param safeSearch - 待驗證的安全搜索值
     * @returns 標準化的安全搜索等級
     * @throws {ValidationError} 當安全搜索選項無效時
     */
    static validateSafeSearch(safeSearch) {
        if (safeSearch === undefined || safeSearch === null) {
            return "moderate"; // 默認中等
        }
        if (typeof safeSearch !== "string") {
            throw new ValidationError("安全搜索選項必須是字符串", "safeSearch");
        }
        const trimmed = safeSearch.trim().toLowerCase();
        const validOptions = ["strict", "moderate", "off"];
        if (!validOptions.includes(trimmed)) {
            throw new ValidationError(`無效的安全搜索級別: ${safeSearch}。有效選項: ${validOptions.join(", ")}`, "safeSearch");
        }
        return trimmed;
    }
    /**
     * 驗證時間範圍過濾參數
     * @param timeRange - 待驗證的時間範圍值
     * @returns 標準化的時間範圍或 undefined
     * @throws {ValidationError} 當時間範圍選項無效時
     */
    static validateTimeRange(timeRange) {
        if (timeRange === undefined || timeRange === null) {
            return undefined; // 可選參數
        }
        if (typeof timeRange !== "string") {
            throw new ValidationError("時間範圍必須是字符串", "time_range");
        }
        const trimmed = timeRange.trim().toLowerCase();
        const validOptions = ["day", "week", "month", "year"];
        if (!validOptions.includes(trimmed)) {
            throw new ValidationError(`無效的時間範圍: ${timeRange}。有效選項: ${validOptions.join(", ")}`, "time_range");
        }
        return trimmed;
    }
    /**
     * 檢查字串是否包含惡意內容
     * @param query - 待檢查的字串
     * @returns 如果包含惡意模式則返回 true
     * @private
     */
    static containsMaliciousContent(query) {
        // 檢查常見的惡意模式，但要避免誤報正常查詢
        const maliciousPatterns = [
            // 明顯的 XSS 模式
            /<script[^>]*>.*?<\/script>/gi,
            /javascript:\s*[^\s]/gi,
            /on\w+\s*=\s*['"]/gi,
            // 明顯的系統命令模式
            /(\|\s*rm\s+|;\s*rm\s+|&&\s*rm\s+)/,
            /`[^`]*rm\s+[^`]*`/,
            /\$\([^)]*rm\s+[^)]*\)/,
            // 路徑遍歷攻擊
            /\.\.[\/\\][^a-zA-Z0-9]/,
            // 過度重複字符（DoS 攻擊）- 調整為更高的閾值
            /(.)\1{200,}/,
            // SQL 注入：只檢測明顯的注入模式
            /'\s*(union|select|drop|delete|insert|update)\s+/gi,
            /--\s*[;'"]/,
        ];
        return maliciousPatterns.some((pattern) => pattern.test(query));
    }
    /**
     * 清理和標準化查詢字串
     * @param query - 待清理的查詢字串
     * @returns 清理後的查詢字串
     */
    static sanitizeQuery(query) {
        return (query
            // 移除多餘的空白字符
            .replace(/\s+/g, " ")
            // 移除潛在的控制字符
            .replace(/[\x00-\x1F\x7F]/g, "")
            // 限制連續特殊字符
            .replace(/[!@#$%^&*()]{5,}/g, "")
            .trim());
    }
    /**
     * 驗證整個搜索請求
     */
    static validateSearchRequest(params, maxCount = 50) {
        const validated = {
            query: this.validateQuery(params.query),
            count: this.validateCount(params.count, maxCount),
            language: this.validateLanguage(params.language),
            safeSearch: this.validateSafeSearch(params.safeSearch),
            timeRange: this.validateTimeRange(params.timeRange),
        };
        // 清理查詢
        validated.query = this.sanitizeQuery(validated.query);
        return validated;
    }
    /**
     * 驗證批量請求
     */
    static validateBatchRequest(requests) {
        if (!Array.isArray(requests)) {
            throw new ValidationError("批量請求必須是數組", "requests");
        }
        if (requests.length === 0) {
            throw new ValidationError("批量請求不能為空", "requests");
        }
        if (requests.length > 10) {
            throw new ValidationError("批量請求不能超過 10 個", "requests");
        }
        return requests.map((req, index) => {
            try {
                return this.validateSearchRequest(req);
            }
            catch (error) {
                throw new ValidationError(`批量請求第 ${index + 1} 個項目無效: ${getErrorMessage(error)}`, `requests[${index}]`);
            }
        });
    }
    /**
     * 驗證 URL 格式
     */
    static validateUrl(url) {
        if (url === undefined || url === null) {
            throw new ValidationError("URL 是必需的", "url");
        }
        if (typeof url !== "string") {
            throw new ValidationError("URL 必須是字符串", "url");
        }
        const trimmed = url.trim();
        if (trimmed.length === 0) {
            throw new ValidationError("URL 不能為空", "url");
        }
        if (trimmed.length > 2048) {
            throw new ValidationError("URL 長度不能超過 2048 字符", "url");
        }
        try {
            const parsedUrl = new URL(trimmed);
            // 只允許 HTTP/HTTPS 協議
            if (!["http:", "https:"].includes(parsedUrl.protocol)) {
                throw new ValidationError("只支援 HTTP 和 HTTPS 協議", "url");
            }
            return parsedUrl.toString();
        }
        catch (_error) {
            throw new ValidationError(`無效的 URL 格式: ${trimmed}`, "url");
        }
    }
    /**
     * 驗證 Fetch 請求參數
     */
    static validateFetchRequest(params, defaults) {
        const validated = {
            url: this.validateUrl(params.url),
            format: this.validateFormat(params.format, defaults?.format),
            maxLength: this.validateMaxLength(params.maxLength),
            useSPA: this.validateBoolean(params.useSPA, "useSPA", defaults?.useSPA ?? true),
            // 支援 start_index 參數
            startIndex: this.validateStartIndex(params.start_index),
            // 支援 useReadability 參數
            useReadability: this.validateBoolean(params.useReadability, "useReadability", defaults?.useReadability ?? true),
            timeout: 60000,
            headers: {},
            respectRobots: true,
            includeImages: false,
            waitUntil: "domcontentloaded",
        };
        return validated;
    }
    /**
     * 驗證輸出格式
     */
    static validateFormat(format, defaultFormat = "markdown") {
        if (format === undefined || format === null) {
            return defaultFormat; // 使用配置的默認格式
        }
        if (typeof format !== "string") {
            throw new ValidationError("輸出格式必須是字符串", "format");
        }
        const trimmed = format.trim().toLowerCase();
        const validFormats = ["html", "markdown", "text", "json"];
        if (!validFormats.includes(trimmed)) {
            throw new ValidationError(`無效的輸出格式: ${format}。有效格式: ${validFormats.join(", ")}`, "format");
        }
        return trimmed;
    }
    /**
     * 驗證最大內容長度
     */
    static validateMaxLength(maxLength) {
        if (maxLength === undefined || maxLength === null) {
            return 10000; // 默認值，更容易觸發截斷提示
        }
        let num;
        if (typeof maxLength === "string") {
            num = parseInt(maxLength, 10);
        }
        else if (typeof maxLength === "number") {
            num = maxLength;
        }
        else {
            throw new ValidationError("最大內容長度必須是數字", "maxLength");
        }
        if (isNaN(num)) {
            throw new ValidationError("最大內容長度必須是有效數字", "maxLength");
        }
        if (num < 100) {
            throw new ValidationError("最大內容長度不能少於 100 字符", "maxLength");
        }
        if (num > 500000) {
            throw new ValidationError("最大內容長度不能超過 500,000 字符", "maxLength");
        }
        return Math.floor(num);
    }
    /**
     * 驗證起始索引
     */
    static validateStartIndex(startIndex) {
        if (startIndex === undefined || startIndex === null) {
            return 0; // 默認值
        }
        let num;
        if (typeof startIndex === "string") {
            num = parseInt(startIndex, 10);
        }
        else if (typeof startIndex === "number") {
            num = startIndex;
        }
        else {
            throw new ValidationError("起始索引必須是數字", "startIndex");
        }
        if (isNaN(num)) {
            throw new ValidationError("起始索引必須是有效數字", "startIndex");
        }
        if (num < 0) {
            throw new ValidationError("起始索引不能為負數", "startIndex");
        }
        if (num > 1000000) {
            throw new ValidationError("起始索引不能超過 1,000,000", "startIndex");
        }
        return Math.floor(num);
    }
    /**
     * 驗證超時時間
     */
    static validateTimeout(timeout) {
        if (timeout === undefined || timeout === null) {
            return 30000; // 默認 30 秒
        }
        let num;
        if (typeof timeout === "string") {
            num = parseInt(timeout, 10);
        }
        else if (typeof timeout === "number") {
            num = timeout;
        }
        else {
            throw new ValidationError("超時時間必須是數字", "timeout");
        }
        if (isNaN(num)) {
            throw new ValidationError("超時時間必須是有效數字", "timeout");
        }
        if (num < 1000) {
            throw new ValidationError("超時時間至少為 1000 毫秒", "timeout");
        }
        if (num > 120000) {
            throw new ValidationError("超時時間不能超過 120000 毫秒", "timeout");
        }
        return Math.floor(num);
    }
    /**
     * 驗證請求頭
     */
    static validateHeaders(headers) {
        if (headers === undefined || headers === null) {
            return {}; // 默認空對象
        }
        if (typeof headers !== "object" || Array.isArray(headers)) {
            throw new ValidationError("請求頭必須是對象", "headers");
        }
        const validatedHeaders = {};
        for (const [key, value] of Object.entries(headers)) {
            if (typeof key !== "string" || typeof value !== "string") {
                throw new ValidationError("請求頭的鍵和值都必須是字符串", "headers");
            }
            // 禁止某些安全敏感的請求頭
            const forbiddenHeaders = [
                "host",
                "content-length",
                "connection",
                "authorization",
            ];
            if (forbiddenHeaders.includes(key.toLowerCase())) {
                throw new ValidationError(`不允許設置請求頭: ${key}`, "headers");
            }
            if (key.length > 100 || value.length > 1000) {
                throw new ValidationError("請求頭的鍵或值過長", "headers");
            }
            validatedHeaders[key] = value;
        }
        return validatedHeaders;
    }
    /**
     * 驗證布林值
     */
    static validateBoolean(value, fieldName, defaultValue = false) {
        if (value === undefined || value === null) {
            return defaultValue;
        }
        if (typeof value === "boolean") {
            return value;
        }
        if (typeof value === "string") {
            const trimmed = value.trim().toLowerCase();
            if (trimmed === "true") {
                return true;
            }
            if (trimmed === "false") {
                return false;
            }
        }
        throw new ValidationError(`${fieldName} 必須是布林值`, fieldName);
    }
    /**
     * 驗證等待條件
     */
    static validateWaitUntil(waitUntil) {
        if (waitUntil === undefined || waitUntil === null) {
            return "domcontentloaded"; // 默認值改為 domcontentloaded
        }
        if (typeof waitUntil !== "string") {
            throw new ValidationError("等待條件必須是字符串", "waitUntil");
        }
        const trimmed = waitUntil.trim().toLowerCase();
        const validOptions = ["load", "domcontentloaded", "networkidle", "commit"];
        if (!validOptions.includes(trimmed)) {
            throw new ValidationError(`無效的等待條件: ${waitUntil}。有效選項: ${validOptions.join(", ")}`, "waitUntil");
        }
        return trimmed;
    }
}
//# sourceMappingURL=validator.js.map