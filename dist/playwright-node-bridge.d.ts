/**
 * Playwright Node.js 橋接器
 * 使用 Node.js 子進程來運行 Playwright，解決 Bun 兼容性問題
 */
import { Logger } from "./logger.js";
import { FetchOptions, FetchResult } from "./types.js";
export declare class PlaywrightNodeBridge {
    private logger;
    private playwrightAvailable;
    constructor(logger: Logger);
    /**
     * 檢查 Playwright 是否可用
     */
    private checkPlaywrightAvailability;
    /**
     * 快速 Playwright 測試
     */
    private quickPlaywrightTest;
    /**
     * 使用 Node.js 子進程獲取 SPA 網頁
     * 支援多層次錯誤處理和自動重試機制
     * 包含 Playwright 可用性預檢查
     */
    fetchSPA(options: FetchOptions, retries?: number): Promise<FetchResult>;
    /**
     * 執行單次 Playwright 獲取（帶超時控制）
     */
    private executeFetchWithTimeout;
    /**
     * 判斷錯誤是否可重試
     */
    private isRetryableError;
    /**
     * 延遲函數
     */
    private delay;
}
//# sourceMappingURL=playwright-node-bridge.d.ts.map