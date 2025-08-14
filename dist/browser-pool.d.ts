import { Browser, BrowserContext, Page } from "playwright";
import { Logger } from "./logger.js";
import { PlaywrightOptions } from "./types.js";
/**
 * 瀏覽器池管理器
 */
export declare class BrowserPool {
    private singleBrowser;
    private contexts;
    private activeTabs;
    private readonly maxTabs;
    private readonly maxIdleTime;
    private cleanupInterval;
    private logger;
    private browserService;
    private totalTabsCreated;
    private totalTabsClosed;
    private isHeadless;
    private enableStatePersistence;
    private stateFile;
    private prewarmedTabs;
    private tabUsageStats;
    private isPrewarmingEnabled;
    constructor(maxTabs?: number, maxIdleTime?: number, options?: PlaywrightOptions & {
        enableStatePersistence?: boolean;
        stateFile?: string;
        enablePrewarming?: boolean;
    }, logger?: Logger);
    getSingleBrowser(): Promise<Browser>;
    createTab(contextId?: string): Promise<ManagedTab>;
    /**
     * 智能CAPTCHA處理 - 動態切換headless模式
     */
    handleCaptcha(): Promise<void>;
    /**
     * 批量創建標籤頁（並行處理）
     */
    createTabs(count: number, contextPrefix?: string): Promise<ManagedTab[]>;
    /**
     * 創建單一瀏覽器實例
     */
    private createSingleBrowser;
    /**
     * 獲取或創建瀏覽器上下文（支援狀態持久化）
     */
    private getOrCreateContext;
    /**
     * 創建支援狀態持久化的上下文
     */
    private createContextWithState;
    /**
     * 載入上下文狀態
     */
    private loadContextState;
    /**
     * 保存上下文狀態
     */
    private saveContextState;
    /**
     * 獲取上下文狀態檔案路徑
     */
    private getContextStateFile;
    /**
     * 獲取上下文視窗大小
     */
    private getContextViewport;
    /**
     * 釋放標籤頁
     */
    private releaseTab;
    /**
     * 等待標籤頁可用
     */
    private waitForAvailableTab;
    /**
     * 獲取池狀態統計（新架構）
     */
    getStats(): BrowserPoolStats;
    /**
     * 手動保存所有上下文狀態
     */
    saveAllStates(): Promise<void>;
    /**
     * 清理所有狀態檔案
     */
    cleanupStateFiles(): void;
    /**
     * 強制清理所有實例（新架構）
     */
    cleanup(): Promise<void>;
    /**
     * 啟動定期清理定時器（性能優化：更頻繁清理）
     */
    private startCleanupTimer;
    /**
     * 清理閒置的瀏覽器上下文
     */
    private cleanupIdleContexts;
    /**
     * 動態切換瀏覽器模式（學習g-search-mcp策略）
     */
    switchToHeadedMode(): Promise<void>;
    /**
     * 保存所有上下文狀態
     */
    private saveAllContextStates;
    /**
     * 優雅地關閉瀏覽器實例
     */
    private closeBrowserGracefully;
    /**
     * 檢查是否為無頭模式
     */
    isHeadlessMode(): boolean;
    /**
     * 獲取瀏覽器狀態資訊
     */
    getBrowserStatus(): {
        isHeadless: boolean;
        isConnected: boolean;
        activeTabs: number;
        activeContexts: number;
    };
    /**
     * 啟動標籤頁預熱機制
     */
    private startTabPrewarming;
    /**
     * 預熱指定數量的標籤頁
     */
    private prewarmTabs;
    /**
     * 獲取預熱的標籤頁
     */
    private getPrewarmedTab;
    /**
     * 補充預熱標籤頁
     */
    private replenishPrewarmedTabs;
    /**
     * 初始化標籤頁使用統計
     */
    private initTabUsageStats;
    /**
     * 獲取最佳可用標籤頁（負載均衡）
     */
    private getBestAvailableTab;
    /**
     * 更新標籤頁統計（成功）
     */
    private updateTabStatsSuccess;
    /**
     * 更新標籤頁統計（錯誤）
     */
    private updateTabStatsError;
    /**
     * 獲取標籤頁性能統計
     */
    getTabPerformanceStats(): {
        totalTabs: number;
        prewarmedTabs: number;
        averageUsage: number;
        successRate: number;
    };
}
/**
 * 標籤頁使用統計
 */
export interface TabUsageStats {
    createdAt: number;
    lastUsed: number;
    usageCount: number;
    totalDuration: number;
    errorCount: number;
    successCount: number;
    isPrewarmed: boolean;
}
/**
 * 管理的標籤頁（包含自動清理功能）
 */
export interface ManagedTab {
    page: Page;
    context: BrowserContext;
    contextId: string;
    createdAt: number;
    release: () => Promise<void>;
}
/**
 * 瀏覽器池統計信息（新架構）
 */
export interface BrowserPoolStats {
    hasBrowser: boolean;
    isHealthy: boolean;
    isHeadless: boolean;
    activeTabs: number;
    maxTabs: number;
    activeContexts: number;
    totalTabsCreated: number;
    totalTabsClosed: number;
    total: number;
    busy: number;
    available: number;
    healthy: number;
    maxInstances: number;
    totalCreated: number;
    totalDestroyed: number;
    averageUseCount: number;
}
/**
 * 創建瀏覽器池的工廠函數
 */
export declare function createBrowserPool(maxTabs?: number, maxIdleTime?: number, options?: PlaywrightOptions, logger?: Logger): BrowserPool;
//# sourceMappingURL=browser-pool.d.ts.map