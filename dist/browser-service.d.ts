import { Browser, BrowserContext, Page } from "playwright";
import { Logger } from "./logger.js";
import { PlaywrightOptions } from "./types.js";
import { FingerprintConfig } from "./fingerprint-service.js";
/**
 * 專業的瀏覽器服務，包含反檢測和隱身功能
 * 基於 fetcher-mcp 的最佳實踐
 */
export declare class BrowserService {
    private options;
    private isDebugMode;
    private logger;
    private fingerprintService;
    private isWSL;
    constructor(options: PlaywrightOptions, logger: Logger);
    /**
     * 檢測運行環境
     */
    private detectWSL;
    /**
     * 根據語言生成Accept-Language標頭
     */
    private getAcceptLanguage;
    /**
     * 重設指紋配置
     */
    resetFingerprint(): Promise<void>;
    /**
     * 獲取當前指紋配置
     */
    getCurrentFingerprint(): Promise<FingerprintConfig>;
    /**
     * 設置反檢測腳本
     */
    private setupAntiDetection;
    /**
     * 設置媒體處理
     */
    private setupMediaHandling;
    /**
     * 創建隱身瀏覽器實例
     */
    createBrowser(customOptions?: {
        headless?: boolean;
        args?: string[];
        ignoreDefaultArgs?: boolean | string[];
    }): Promise<Browser>;
    /**
     * 創建隱身瀏覽器上下文（使用智能指紋配置）
     */
    createContext(browser: Browser): Promise<{
        context: BrowserContext;
        viewport: {
            width: number;
            height: number;
        };
    }>;
    /**
     * 創建新頁面
     */
    createPage(context: BrowserContext): Promise<Page>;
    /**
     * 清理資源
     */
    cleanup(browser: Browser | null, page: Page | null): Promise<void>;
    /**
     * 清理上下文
     */
    cleanupContext(context: BrowserContext): Promise<void>;
    /**
     * 清理頁面
     */
    cleanupPage(page: Page): Promise<void>;
}
//# sourceMappingURL=browser-service.d.ts.map