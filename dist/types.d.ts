/**
 * MCP 伺服器型別定義
 */
export interface SearchOptions {
    /** 返回結果數量 (1-50) */
    count?: number;
    /** 語言/地區代碼 (如: wt-wt, us-en, tw-tzh, cn-zh) */
    language?: string;
    /** 地區代碼 */
    region?: string;
    /** 安全搜索級別 */
    safeSearch?: "strict" | "moderate" | "off";
    /** 時間範圍過濾 */
    timeRange?: "day" | "week" | "month" | "year";
    /** 請求超時時間 */
    timeout?: number;
    /** 最大並發數量（批量搜索專用） */
    maxConcurrency?: number;
    /** 查詢間延遲時間（毫秒，批量搜索專用） */
    queryDelay?: number;
}
export interface SearchResult {
    /** 網頁標題 */
    title: string;
    /** 網頁 URL 連結 */
    url: string;
    /** 搜索結果摘要或描述 */
    snippet: string;
    /** 內容發布日期（ISO 格式） */
    publishedDate?: string;
    /** 內容修改日期（ISO 格式） */
    modifiedDate?: string;
    /** 內容語言代碼 */
    language?: string;
    /** 結果來源網站 */
    source?: string;
}
/**
 * 日期提取結果介面
 */
export interface ExtractedDateInfo {
    /** 發布日期 */
    publishedDate?: string;
    /** 修改日期 */
    modifiedDate?: string;
}
export interface BatchStats {
    /** 總數 */
    total: number;
    /** 成功數 */
    success: number;
    /** 失敗數 */
    failed: number;
    /** 總執行時間（毫秒） */
    totalDuration: number;
    /** 平均執行時間（毫秒） */
    averageDuration: number;
    /** 成功率 */
    successRate: number;
}
/**
 * 伺服器配置介面
 *
 * 定義 MCP 伺服器的完整配置選項，包括服務基本資訊、速率限制、
 * 快取設定、搜索參數、日誌配置等所有可調整的伺服器行為。
 *
 * @interface ServerConfig
 * @example
 * ```typescript
 * const config: ServerConfig = {
 *   name: "DuckDuckGo MCP Server",
 *   version: "1.0.0",
 *   rateLimits: {
 *     requestsPerSecond: 1,
 *     dailyLimit: 1000,
 *     monthlyLimit: 15000
 *   },
 *   // ...其他配置
 * };
 * ```
 */
export interface ServerConfig {
    /** 服務器名稱 */
    name: string;
    /** 版本號 */
    version: string;
    /** 速率限制設定 */
    rateLimits: {
        /** 每秒最大請求數 */
        requestsPerSecond: number;
    };
    /** 搜索設定 */
    search: {
        /** 預設返回結果數量 */
        defaultCount: number;
        /** 最大返回結果數量 */
        maxCount: number;
        /** 請求超時時間 (毫秒) */
        timeout: number;
        /** 預設語言 */
        defaultLanguage: string;
        /** 預設安全搜索級別 */
        defaultSafeSearch: "strict" | "moderate" | "off";
    };
    /** 日誌設定 */
    logging: {
        /** 日誌級別 */
        level: "debug" | "info" | "warn" | "error";
        /** 是否記錄使用者查詢 */
        logQueries: boolean;
    };
    /** 網頁獲取設定 */
    fetch: {
        /** 預設輸出格式 */
        defaultFormat: "html" | "markdown" | "text" | "json";
        /** 預設是否使用 SPA 模式 */
        defaultUseSPA: boolean;
        /** 預設是否使用 Readability */
        defaultUseReadability: boolean;
    };
}
export interface RateLimitConfig {
    requestsPerSecond: number;
}
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
export declare class SearchError extends Error {
    code?: string | undefined;
    statusCode?: number | undefined;
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
 * throw new RateLimitError("請求過於頻繁", 60); // 60 秒後重試
 * ```
 */
export declare class RateLimitError extends Error {
    retryAfter?: number | undefined;
    /**
     * 建構速率限制錯誤
     * @param message - 錯誤訊息
     * @param retryAfter - 建議重試等待時間（秒）
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
     * @param message - 錯誤訊息
     * @param field - 驗證失敗的欄位名稱
     */
    constructor(message: string, field?: string | undefined);
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
export declare function isError(value: unknown): value is Error;
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
export declare function getErrorMessage(error: unknown): string;
/**
 * 網頁獲取輸出格式型別
 *
 * 定義支援的網頁內容輸出格式選項。
 *
 * @typedef FetchFormat
 * @example
 * ```typescript
 * const format: FetchFormat = 'markdown'; // 推薦格式，易於閱讀
 * ```
 */
export type FetchFormat = "html" | "markdown" | "text" | "json";
/**
 * 網頁獲取選項介面
 *
 * 定義網頁內容獲取的完整配置選項，包括 URL、輸出格式、長度限制、
 * 請求設定、處理選項等。支援標準 HTTP 請求和 SPA 渲染兩種模式。
 *
 * @interface FetchOptions
 * @example
 * ```typescript
 * const options: FetchOptions = {
 *   url: "https://example.com",
 *   format: "markdown",
 *   maxLength: 10000,
 *   useSPA: true,
 *   useReadability: true
 * };
 * ```
 */
export interface FetchOptions {
    /** 目標 URL */
    url: string;
    /** 輸出格式 */
    format?: FetchFormat;
    /** 最大內容長度 */
    maxLength?: number;
    /** 內容起始位置（分片支援） */
    startIndex?: number;
    /** 請求超時時間 */
    timeout?: number;
    /** 自定義請求頭 */
    headers?: Record<string, string>;
    /** 使用 Mozilla Readability 提取主要內容 */
    useReadability?: boolean;
    /** 遵循 robots.txt 規則 */
    respectRobots?: boolean;
    /** 是否包含圖片資訊 */
    includeImages?: boolean;
    /** 等待條件 */
    waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
    /** 是否使用 SPA 模式 */
    useSPA?: boolean;
    /** 是否啟用調試模式 */
    debug?: boolean;
    /** User-Agent 策略：'dynamic' 使用動態指紋，'crawler' 使用爬蟲標識，'custom' 使用自定義 */
    userAgentMode?: 'dynamic' | 'crawler' | 'custom';
    /** 自定義 User-Agent（當 userAgentMode 為 'custom' 時使用） */
    customUserAgent?: string;
}
/**
 * Playwright 專用選項
 */
export interface PlaywrightOptions {
    /** 無頭模式 */
    headless?: boolean;
    /** 調試模式 */
    debug?: boolean;
    /** 禁用媒體 */
    disableMedia?: boolean;
    /** 等待條件 */
    waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
    /** 主要超時時間（頁面載入） */
    timeout?: number;
}
export interface ImageInfo {
    /** 圖片來源 URL */
    src: string;
    /** 替代文字 */
    alt: string;
    /** 圖片標題 */
    title?: string;
    /** 寬度 */
    width?: string;
    /** 高度 */
    height?: string;
    /** 完整的絕對 URL */
    absoluteUrl: string;
}
/**
 * 網頁獲取結果介面
 *
 * 代表網頁內容獲取操作的完整結果，包括成功狀態、處理後內容、
 * 錯誤資訊、metadata 等詳細資訊。
 *
 * @interface FetchResult
 * @example
 * ```typescript
 * const result: FetchResult = {
 *   success: true,
 *   content: "處理後的網頁內容",
 *   url: "https://example.com",
 *   title: "網頁標題",
 *   format: "markdown"
 * };
 * ```
 */
export interface FetchResult {
    /** 是否成功 */
    success: boolean;
    /** 處理後的內容 */
    content: string;
    /** 錯誤訊息（如果失敗） */
    error?: string;
    /** 原始 URL */
    url?: string;
    /** 網頁標題 */
    title?: string;
    /** 網頁描述 */
    description?: string;
    /** 內容格式 */
    format?: string;
    /** 圖片資訊（如果啟用） */
    images?: ImageInfo[];
    /** 元數據 */
    metadata?: Record<string, any>;
    /** 處理時間戳 */
    timestamp?: string;
    /** 索引（用於批量處理） */
    index?: number;
    /** 原始內容長度（截斷前） */
    originalLength?: number;
    /** 發布時間 */
    publishedDate?: string;
    /** 修改時間 */
    modifiedDate?: string;
}
export interface WebpageMetadata {
    /** 標題 */
    title?: string;
    /** 描述 */
    description?: string;
    /** 關鍵詞 */
    keywords?: string;
    /** 作者 */
    author?: string;
    /** 發布日期 */
    publishedDate?: string;
    /** 修改日期 */
    modifiedDate?: string;
    /** 語言 */
    language?: string;
    /** 網站名稱 */
    siteName?: string;
    /** 圖片 URL */
    image?: string;
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
export declare class FetchError extends Error {
    code?: string | undefined;
    statusCode?: number | undefined;
    /**
     * 建構網頁獲取錯誤
     * @param message - 錯誤訊息
     * @param code - 錯誤代碼
     * @param statusCode - HTTP 狀態碼
     */
    constructor(message: string, code?: string | undefined, statusCode?: number | undefined);
}
/**
 * 批量搜索結果介面
 *
 * 代表批量搜索操作中單一查詢的執行結果，包含查詢內容、
 * 執行狀態、結果資料、錯誤資訊和執行時間等詳細資訊。
 *
 * @interface BatchSearchResult
 * @example
 * ```
 * const result: BatchSearchResult = {
 *   query: "搜索關鍵詞",
 *   success: true,
 *   results: [],
 *   duration: 1500,
 *   index: 0
 * };
 * ```
 */
export interface BatchSearchResult {
    /** 搜索查詢 */
    query: string;
    /** 是否成功 */
    success: boolean;
    /** 搜索結果 */
    results: SearchResult[];
    /** 錯誤訊息（如果失敗） */
    error?: string;
    /** 執行時間（毫秒） */
    duration: number;
    /** 原始索引 */
    index: number;
}
/**
 * 批量獲取結果介面
 *
 * 代表批量網頁獲取操作中單一 URL 的執行結果。
 *
 * @interface BatchFetchResult
 * @example
 * ```
 * const result: BatchFetchResult = {
 *   url: "https://example.com",
 *   success: true,
 *   result: {},
 *   duration: 2000,
 *   index: 0
 * };
 * ```
 */
export interface BatchFetchResult {
    /** 目標 URL */
    url: string;
    /** 是否成功 */
    success: boolean;
    /** 獲取結果 */
    result: FetchResult;
    /** 執行時間（毫秒） */
    duration: number;
    /** 原始索引 */
    index: number;
}
/**
 * 批量處理選項介面
 *
 * 定義批量操作的執行參數，包括並發數量、逾時設定、
 * 錯誤處理策略和進度回調等選項。
 *
 * @interface BatchOptions
 * @example
 * ```
 * const options: BatchOptions = {
 *   maxConcurrency: 3,
 *   timeout: 30000,
 *   failFast: false,
 *   onProgress: (completed, total) => {
 *     console.log('進度: ' + completed + '/' + total);
 *   }
 * };
 * ```
 */
export interface BatchOptions {
    /** 最大並行數量 */
    maxConcurrency?: number;
    /** 超時時間（毫秒） */
    timeout?: number;
    /** 是否在第一個失敗時停止 */
    failFast?: boolean;
    /** 進度回調 */
    onProgress?: (completed: number, total: number, error: Error | null) => void;
}
/**
 * MCP 工具結構化輸出介面
 *
 * 定義 MCP 工具的結構化輸出格式，符合 MCP 2025-06-18 規範
 * 提供類型安全的結構化內容和非結構化內容支援
 */
/** 搜索工具的結構化輸出 */
export interface SearchStructuredOutput {
    /** 搜索結果總數 */
    totalResults: number;
    /** 搜索查詢 */
    query: string;
    /** 搜索結果列表 */
    results: Array<{
        /** 結果標題 */
        title: string;
        /** 結果 URL */
        url: string;
        /** 結果摘要 */
        snippet: string;
        /** 發布日期 */
        publishedDate?: string;
        /** 修改日期 */
        modifiedDate?: string;
        /** 內容語言 */
        language?: string;
        /** 來源網站 */
        source?: string;
    }>;
    /** 搜索選項 */
    searchOptions: {
        /** 語言/地區 */
        language: string;
        /** 安全搜索級別 */
        safeSearch: string;
        /** 時間範圍 */
        timeRange?: string;
    };
    /** 允許任意額外屬性 */
    [key: string]: unknown;
}
/** 網頁獲取工具的結構化輸出 */
export interface FetchStructuredOutput {
    /** 是否成功 */
    success: boolean;
    /** 網頁 URL */
    url: string;
    /** 網頁標題 */
    title?: string;
    /** 網頁描述 */
    description?: string;
    /** 內容格式 */
    format: string;
    /** 內容長度 */
    contentLength: number;
    /** 原始內容長度 */
    originalLength?: number;
    /** 發布時間 */
    publishedDate?: string;
    /** 修改時間 */
    modifiedDate?: string;
    /** 內容語言 */
    language?: string;
    /** 網站名稱 */
    siteName?: string;
    /** 圖片數量 */
    imageCount?: number;
    /** 處理時間戳 */
    timestamp: string;
    /** 錯誤訊息（如果失敗） */
    error?: string;
    /** 允許任意額外屬性 */
    [key: string]: unknown;
}
/** 批量搜索工具的結構化輸出 */
export interface BatchSearchStructuredOutput {
    /** 批量搜索統計 */
    statistics: {
        /** 總查詢數 */
        totalQueries: number;
        /** 成功查詢數 */
        successfulQueries: number;
        /** 失敗查詢數 */
        failedQueries: number;
        /** 總結果數 */
        totalResults: number;
        /** 總執行時間 */
        totalDuration: number;
        /** 平均執行時間 */
        averageDuration: number;
        /** 成功率 */
        successRate: number;
    };
    /** 批量搜索結果 */
    results: Array<{
        /** 查詢字串 */
        query: string;
        /** 是否成功 */
        success: boolean;
        /** 搜索結果 */
        results: Array<{
            title: string;
            url: string;
            snippet: string;
            publishedDate?: string;
            modifiedDate?: string;
            language?: string;
            source?: string;
        }>;
        /** 錯誤訊息（如果失敗） */
        error?: string;
        /** 執行時間 */
        duration: number;
        /** 查詢索引 */
        index: number;
    }>;
    /** 允許任意額外屬性 */
    [key: string]: unknown;
}
/** 批量獲取工具的結構化輸出 */
export interface BatchFetchStructuredOutput {
    /** 批量獲取統計 */
    statistics: {
        /** 總 URL 數 */
        totalUrls: number;
        /** 成功獲取數 */
        successfulFetches: number;
        /** 失敗獲取數 */
        failedFetches: number;
        /** 總執行時間 */
        totalDuration: number;
        /** 平均執行時間 */
        averageDuration: number;
        /** 成功率 */
        successRate: number;
    };
    /** 批量獲取結果 */
    results: Array<{
        /** 目標 URL */
        url: string;
        /** 是否成功 */
        success: boolean;
        /** 網頁標題 */
        title?: string;
        /** 內容格式 */
        format: string;
        /** 內容長度 */
        contentLength: number;
        /** 原始內容長度 */
        originalLength?: number;
        /** 發布時間 */
        publishedDate?: string;
        /** 修改時間 */
        modifiedDate?: string;
        /** 錯誤訊息（如果失敗） */
        error?: string;
        /** 執行時間 */
        duration: number;
        /** URL 索引 */
        index: number;
    }>;
    /** 允許任意額外屬性 */
    [key: string]: unknown;
}
//# sourceMappingURL=types.d.ts.map