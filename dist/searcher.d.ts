import { SearchOptions, SearchResult, BatchSearchResult } from "./types.js";
import { Logger } from "./logger.js";
import { BrowserPool } from "./browser-pool.js";
/**
 * DuckDuckGo 搜索引擎實作
 */
export declare class DuckDuckGoSearcher {
    private readonly domains;
    private currentDomainIndex;
    private readonly defaultTimeout;
    private concurrencyLimiter;
    private logger;
    private userAgentIndex;
    private browserPool;
    private fallbackToBrowser;
    private responseTimeStats;
    private performanceBreakdown;
    private readonly userAgents;
    private readonly captchaPatterns;
    constructor(logger?: Logger, browserPool?: BrowserPool);
    /**
     * 記錄初始化統計和架構優勢
     */
    private logInitializationStats;
    /**
     * 初始化域名輪換策略
     */
    private initializeDomainRotation;
    /**
     * 獲取當前使用的域名
     */
    private getCurrentDomain;
    /**
     * 獲取下一個域名（輪換策略）
     */
    private getNextDomain;
    /**
     * 域名失敗時的容錯切換
     */
    private handleDomainFailure;
    /**
     * 重設響應時間統計（增強版）
     */
    private resetResponseTimeStats;
    /**
     * 獲取整合性能統計（增強診斷版）
     */
    getPerformanceStats(): {
        searcher: {
            breakdown: {
                averageNetworkDelay: number;
                averageDnsLookup: number;
                averageConnectionTime: number;
                averageParseTime: number;
            };
            events: {
                captchaEvents: number;
                browserFallbacks: number;
                retryAttempts: number;
            };
            errorBreakdown: {
                networkErrors: number;
                timeouts: number;
                captchaBlocks: number;
                parseErrors: number;
            };
            totalRequests: number;
            totalResponseTime: number;
            averageResponseTime: number;
            recentResponseTimes: number[];
            responseTrend: "improving" | "stable" | "degrading";
            trendConfidence: number;
            baselineResponseTime: number;
            performanceRegressionThreshold: number;
            adaptiveAdjustments: {
                concurrencyReductions: number;
                timeoutIncreases: number;
                domainSwitches: number;
            };
        };
        concurrency: import("./concurrency-limiter.js").ConcurrencyStats;
        integration: {
            fallbackToBrowser: boolean;
            captchaDetectionEnabled: boolean;
            statePersistenceEnabled: boolean;
        };
    } | {
        browserPool: import("./browser-pool.js").BrowserPoolStats;
        searcher: {
            breakdown: {
                averageNetworkDelay: number;
                averageDnsLookup: number;
                averageConnectionTime: number;
                averageParseTime: number;
            };
            events: {
                captchaEvents: number;
                browserFallbacks: number;
                retryAttempts: number;
            };
            errorBreakdown: {
                networkErrors: number;
                timeouts: number;
                captchaBlocks: number;
                parseErrors: number;
            };
            totalRequests: number;
            totalResponseTime: number;
            averageResponseTime: number;
            recentResponseTimes: number[];
            responseTrend: "improving" | "stable" | "degrading";
            trendConfidence: number;
            baselineResponseTime: number;
            performanceRegressionThreshold: number;
            adaptiveAdjustments: {
                concurrencyReductions: number;
                timeoutIncreases: number;
                domainSwitches: number;
            };
        };
        concurrency: import("./concurrency-limiter.js").ConcurrencyStats;
        integration: {
            fallbackToBrowser: boolean;
            captchaDetectionEnabled: boolean;
            statePersistenceEnabled: boolean;
        };
    };
    /**
     * 計算平均值輔助方法
     */
    private calculateAverage;
    /**
     * 健康檢查 - 綜合性能評估
     */
    healthCheck(): Promise<{
        status: "healthy" | "degraded" | "unhealthy";
        details: {
            searcher: "warning" | "ok";
            browserPool: "error" | "warning" | "ok" | undefined;
            concurrency: "error" | "warning" | "ok";
            network: "error" | "warning" | "ok";
        };
        stats: {
            searcher: {
                breakdown: {
                    averageNetworkDelay: number;
                    averageDnsLookup: number;
                    averageConnectionTime: number;
                    averageParseTime: number;
                };
                events: {
                    captchaEvents: number;
                    browserFallbacks: number;
                    retryAttempts: number;
                };
                errorBreakdown: {
                    networkErrors: number;
                    timeouts: number;
                    captchaBlocks: number;
                    parseErrors: number;
                };
                totalRequests: number;
                totalResponseTime: number;
                averageResponseTime: number;
                recentResponseTimes: number[];
                responseTrend: "improving" | "stable" | "degrading";
                trendConfidence: number;
                baselineResponseTime: number;
                performanceRegressionThreshold: number;
                adaptiveAdjustments: {
                    concurrencyReductions: number;
                    timeoutIncreases: number;
                    domainSwitches: number;
                };
            };
            concurrency: import("./concurrency-limiter.js").ConcurrencyStats;
            integration: {
                fallbackToBrowser: boolean;
                captchaDetectionEnabled: boolean;
                statePersistenceEnabled: boolean;
            };
        } | {
            browserPool: import("./browser-pool.js").BrowserPoolStats;
            searcher: {
                breakdown: {
                    averageNetworkDelay: number;
                    averageDnsLookup: number;
                    averageConnectionTime: number;
                    averageParseTime: number;
                };
                events: {
                    captchaEvents: number;
                    browserFallbacks: number;
                    retryAttempts: number;
                };
                errorBreakdown: {
                    networkErrors: number;
                    timeouts: number;
                    captchaBlocks: number;
                    parseErrors: number;
                };
                totalRequests: number;
                totalResponseTime: number;
                averageResponseTime: number;
                recentResponseTimes: number[];
                responseTrend: "improving" | "stable" | "degrading";
                trendConfidence: number;
                baselineResponseTime: number;
                performanceRegressionThreshold: number;
                adaptiveAdjustments: {
                    concurrencyReductions: number;
                    timeoutIncreases: number;
                    domainSwitches: number;
                };
            };
            concurrency: import("./concurrency-limiter.js").ConcurrencyStats;
            integration: {
                fallbackToBrowser: boolean;
                captchaDetectionEnabled: boolean;
                statePersistenceEnabled: boolean;
            };
        };
        recommendations: string[];
    }>;
    /**
     * 重設所有統計資料和狀態
     */
    resetAll(): Promise<void>;
    /**
     * 檢測是否被CAPTCHA或反機器人系統阻擋（參考g-search-mcp）
     */
    /**
     * 增強型CAPTCHA檢測系統（學習g-search-mcp多階段檢測）
     */
    private detectCaptchaOrBlock;
    /**
     * 多階段CAPTCHA檢測核心邏輯
     */
    private performMultiStageCapcthaDetection;
    /**
     * DuckDuckGo特定阻擋檢測
     */
    private detectDuckDuckGoSpecificBlocks;
    /**
     * 視覺CAPTCHA元素檢測
     */
    private detectVisualCaptchaElements;
    /**
     * 反機器人行為模式檢測
     */
    private detectAntiBotBehavior;
    /**
     * 頁面結構異常檢測
     */
    private detectStructuralAnomalies;
    /**
     * 使用瀏覽器模式進行搜索（用於CAPTCHA的後備方案）
     */
    private performBrowserSearch;
    /**
     * 等待CAPTCHA解決
     */
    private waitForCaptchaResolution;
    /**
     * 處理CAPTCHA檢測和動態模式切換（學習g-search-mcp策略）
     */
    private handleCaptchaWithDynamicSwitching;
    /**
     * 等待用戶手動解決CAPTCHA（有界面模式）
     */
    private waitForUserCaptchaResolution;
    /**
     * 執行網頁搜索 - 帶重試機制的增強版本
     */
    search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
    /**
     * 執行單次搜索請求 - 支援多域名容錯和早期檢測機制
     */
    private performSingleSearch;
    /**
     * 對單個域名執行搜索請求
     */
    private performSingleDomainSearch;
    /**
     * 建構搜索參數
     */
    private buildSearchParams;
    /**
     * 獲取請求標頭 - 支援 User-Agent 輪換和反爬蟲對策
     */
    private getHeaders;
    /**
     * 獲取隨機 User-Agent
     */
    private getRandomUserAgent;
    /**
     * 生成 Sec-CH-UA 標頭（性能優化：更新至最新版本）
     */
    private generateSecChUa;
    /**
     * 生成平台標頭
     */
    private generatePlatform;
    /**
     * 記錄響應時間統計
     */
    private recordResponseTime;
    /**
     * 詳細的響應時間趨勢分析
     */
    private analyzeResponseTimeTrend;
    /**
     * 根據趨勢分析執行自適應調整
     */
    private performAdaptiveAdjustments;
    /**
     * 獲取自適應超時建議
     */
    private getAdaptiveTimeout;
    /**
     * 計算當前錯誤率
     */
    private calculateErrorRate;
    /**
     * 獲取自適應並發數建議
     */
    getAdaptiveConcurrency(): number;
    /**
     * 解析搜索結果 HTML
     */
    private parseResults;
    /**
     * 使用結構化選擇器從元素提取結果（學習g-search-mcp策略）
     */
    private extractResultWithSelectors;
    /**
     * 清理DuckDuckGo重定向URL
     */
    private cleanDuckDuckGoUrl;
    /**
     * 從 DOM 元素提取結果（傳統方法，保留作為備用）
     */
    private extractResultFromElement;
    /**
     * 批量並行搜索 - 支援智能並發控制
     */
    batchSearch(queries: string[], options?: SearchOptions): Promise<BatchSearchResult[]>;
    /**
     * 執行單個搜索任務
     */
    private executeSingleSearch;
    /**
     * 延遲執行工具方法
     */
    private delay;
    /**
     * 清理 URL 用於日誌記錄
     */
    private sanitizeUrl;
    /**
     * 備用解析方法
     */
    private fallbackParseResults;
    /**
     * 使用通用選擇器解析
     */
    private parseWithGenericSelectors;
    /**
     * 使用連結分析解析
     */
    private parseWithLinkAnalysis;
    /**
     * 使用文字模式解析
     */
    private parseWithTextPatterns;
    /**
     * 使用結構分析解析
     */
    private parseWithStructuralAnalysis;
    /**
     * 輔助方法：檢查是否為有效外部連結
     */
    private isValidExternalLink;
    /**
     * 輔助方法：從父元素提取上下文
     */
    private extractContextFromParents;
    /**
     * 輔助方法：獲取包含URL的文字節點
     */
    private getTextNodesWithUrls;
    /**
     * 輔助方法：從上下文提取標題
     */
    private extractTitleFromContext;
    /**
     * 輔助方法：從通用容器提取結果
     */
    private extractResultFromGenericContainer;
    /**
     * 記錄解析失敗詳情
     */
    private logParsingFailureDetails;
    /**
     * 從原始網頁 URL 提取發布日期
     */
    private extractDateFromUrl;
    /**
     * 從 HTML 中提取結構化日期資料
     */
    private extractStructuredDate;
    /**
     * 從 JSON-LD 資料中提取日期
     */
    private extractDateFromJsonLd;
    /**
     * 清理文本內容
     */
    private cleanText;
    /**
     * 提取真實 URL
     */
    private extractUrl;
    /**
     * 驗證搜索選項
     */
    static validateSearchOptions(options: SearchOptions): void;
    /**
     * 智能降級機制：根據實時性能自動調整參數
     */
    private performSmartDegradation;
}
//# sourceMappingURL=searcher.d.ts.map