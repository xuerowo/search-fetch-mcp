import { Page } from "playwright";
import { FetchOptions, FetchResult } from "./types.js";
import { Logger } from "./logger.js";
/**
 * 專業的網頁內容處理器，支援 SPA 和複雜網站
 * 基於 fetcher-mcp 的 WebContentProcessor 最佳實踐
 */
export declare class PlaywrightProcessor {
    private options;
    private logger;
    private logPrefix;
    private turndownService;
    constructor(options: FetchOptions, logger: Logger, logPrefix?: string);
    /**
     * 處理頁面內容的主要方法
     */
    processPageContent(page: Page, url: string): Promise<FetchResult>;
    /**
     * 等待頁面穩定（重要的 SPA 支援功能）
     */
    private waitForPageStability;
    /**
     * 等待 DOM 穩定（對 SPA 很重要）
     */
    private waitForDOMStability;
    /**
     * 滾動載入內容
     */
    private scrollToLoadContent;
    /**
     * 安全地獲取頁面資訊（支援重試機制）
     * 參考 fetcher-mcp 的 safelyGetPageInfo 方法
     */
    private safelyGetPageInfo;
    /**
     * 確保頁面穩定性（參考 fetcher-mcp 的 ensurePageStability）
     */
    private ensurePageStability;
    /**
     * 使用 Readability 提取主要內容
     */
    private extractWithReadability;
    /**
     * 轉換為 Markdown
     */
    private convertToMarkdown;
    /**
     * 轉換為純文字
     */
    private convertToText;
    /**
     * 應用長度限制
     */
    private applyLengthLimit;
}
//# sourceMappingURL=playwright-processor.d.ts.map