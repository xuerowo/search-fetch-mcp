import { Logger } from "./logger.js";
import { FetchOptions, FetchResult, BatchFetchResult } from "./types.js";
/**
 * 網頁內容獲取器
 */
export declare class WebpageFetcher {
    private readonly crawlerUserAgent;
    private readonly defaultTimeout;
    private turndownService;
    private logger;
    private concurrencyLimiter;
    private browserPool;
    private playwrightBridge;
    private fingerprintService;
    private cookieStore;
    private lastRequestTime;
    constructor(logger?: Logger);
    fetchWebpage(options: FetchOptions, _isFromSpaFallback?: boolean): Promise<FetchResult>;
    /**
     * SPA 網頁獲取方法（使用 Node.js Playwright 橋接器）
     * 適用於 Vue.js、React、Angular 等單頁應用
     * 當 Playwright 失敗時自動降級為簡單 HTTP 模式
     */
    fetchSPAWebpage(options: FetchOptions): Promise<FetchResult>;
    /**
     * 獲取 Playwright 錯誤的解決建議
     */
    private getPlaywrightErrorSuggestion;
    /**
     * URL 驗證
     */
    private validateUrl;
    /**
     * 檢查是否為私有網路地址
     */
    private isPrivateNetwork;
    /**
     * robots.txt 檢查
     */
    private checkRobotsTxt;
    /**
     * 獲取適當的 User-Agent
     */
    private getUserAgent;
    /**
     * 獲取 HTML 內容
     */
    private fetchHtml;
    /**
     * 應用防爬蟲延遲
     */
    private applyAntiCrawlerDelay;
    /**
     * 建立增強的 HTTP Headers（針對反爬蟲優化）
     */
    private buildEnhancedHeaders;
    /**
     * 將存儲的 cookies 添加到請求 headers
     */
    private addCookiesToHeaders;
    /**
     * 從回應中提取並存儲 cookies
     */
    private extractAndStoreCookies;
    /**
     * 為特定網站執行預訪問（獲取 session cookies）
     */
    private performPreAccessIfNeeded;
    /**
     * 處理錯誤並智能重試
     */
    private handleErrorWithRetry;
    /**
     * 使用指定選項重試獲取
     */
    private retryWithOptions;
    /**
     * 處理網頁內容
     */
    private processContent;
    /**
     * Mozilla Readability 提取（參考 fetch 專案的簡潔方式）
     */
    private extractWithReadability;
    /**
     * 簡潔的 Markdown 轉換（參考 fetch 和 fetcher-mcp 專案）
     */
    private convertToMarkdown;
    /**
     * 清理 Markdown 輸出（簡潔版本）
     */
    private cleanMarkdownOutput;
    /**
     * 設置 TurndownService 規則（簡化版本，參考 fetcher-mcp）
     */
    private setupTurndownRules;
    /**
     * 清理純文字輸出（簡化版本）
     */
    private cleanTextOutput;
    /**
     * 提取純文字
     */
    private extractPlainText;
    /**
     * 創建 JSON 格式輸出
     */
    private createJsonOutput;
    /**
     * 提取圖片資訊（參考 mcp-image-extractor）
     */
    private extractImages;
    /**
     * 提取網頁元數據
     */
    private extractMetadata;
    /**
     * 獲取 meta 標籤內容
     */
    private getMetaContent;
    /**
     * 提取網頁發布時間和修改時間（增強版）
     */
    private extractDateInfo;
    /**
     * 從 JSON-LD 結構化資料中提取日期
     */
    private extractDateFromJsonLd;
    /**
     * 分片內容處理
     */
    private applyContentSlicing;
    /**
     * URL 解析助手
     */
    private resolveUrl;
    /**
     * 正則表達式轉義
     */
    private escapeRegex;
    /**
     * 清理控制字符以確保 JSON 安全
     */
    private cleanControlCharacters;
    /**
     * 降級內容提取
     */
    private fallbackExtraction;
    /**
     * 錯誤處理
     */
    private handleFetchError;
    /**
     * 清理 URL 用於日誌記錄
     */
    private sanitizeUrl;
    /**
     * 批量並行獲取網頁（優化版：共享瀏覽器實例）
     */
    batchFetch(urls: string[], options?: Omit<FetchOptions, "url">): Promise<BatchFetchResult[]>;
    /**
     * 記錄批量獲取結果統計
     */
    private logBatchResults;
    /**
     * 執行單個獲取任務
     */
    private executeSingleFetch;
    /**
     * 創建並行標籤頁處理（為 SPA 優化）
     */
    createManagedPages(count: number): Promise<any[]>;
    /**
     * 清理資源
     */
    cleanup(): Promise<void>;
    /**
     * 獲取批量統計信息
     */
    getBatchStats(): {
        concurrency: import("./concurrency-limiter.js").ConcurrencyStats;
        browser: import("./browser-pool.js").BrowserPoolStats;
    };
}
//# sourceMappingURL=fetcher.d.ts.map