import fetch from "node-fetch";
import { JSDOM } from "jsdom";
import { Page } from "playwright";
import {
  SearchOptions,
  SearchResult,
  SearchError,
  getErrorMessage,
  BatchSearchResult,
  ExtractedDateInfo,
} from "./types.js";
import { ConcurrencyLimiter } from "./concurrency-limiter.js";
import { Logger } from "./logger.js";
import { BrowserPool, ManagedTab } from "./browser-pool.js";

/**
 * DuckDuckGo 搜索引擎實作
 */
export class DuckDuckGoSearcher {
  // 多域名支持 - 學習g-search-mcp的策略
  private readonly domains = [
    "https://html.duckduckgo.com/html/",
    "https://start.duckduckgo.com/html/",
    "https://duckduckgo.com/html/",
    "https://3g2upl4pq6kufc4m.onion/html/", // Tor域名
  ];
  private currentDomainIndex = 0;
  private readonly defaultTimeout = 35000;
  private concurrencyLimiter: ConcurrencyLimiter;
  private logger: Logger;
  private userAgentIndex = 0;
  private browserPool: BrowserPool | null = null;
  private fallbackToBrowser = false;

  private responseTimeStats: {
    totalRequests: number;
    totalResponseTime: number;
    averageResponseTime: number;
    recentResponseTimes: number[];

    // 趨勢分析增強
    responseTrend: "improving" | "stable" | "degrading";
    trendConfidence: number;
    baselineResponseTime: number;
    performanceRegressionThreshold: number;
    adaptiveAdjustments: {
      concurrencyReductions: number;
      timeoutIncreases: number;
      domainSwitches: number;
    };
  } = {
    totalRequests: 0,
    totalResponseTime: 0,
    averageResponseTime: 0,
    recentResponseTimes: [],

    responseTrend: "stable",
    trendConfidence: 0,
    baselineResponseTime: 0,
    performanceRegressionThreshold: 2.0,
    adaptiveAdjustments: {
      concurrencyReductions: 0,
      timeoutIncreases: 0,
      domainSwitches: 0,
    },
  };

  private performanceBreakdown = {
    networkDelay: [] as number[],
    dnsLookup: [] as number[],
    connectionTime: [] as number[],
    parseTime: [] as number[],
    captchaEvents: 0,
    browserFallbacks: 0,
    retryAttempts: 0,
    errorBreakdown: {
      networkErrors: 0,
      timeouts: 0,
      captchaBlocks: 0,
      parseErrors: 0,
    },
  };

  // 更新到 2025 年 7 月最新瀏覽器版本
  private readonly userAgents = [
    // Chrome 138.x (2025年7月最新)
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.7204.96 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.7204.96 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.7204.96 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.6975.112 Safari/537.36",

    // Firefox 140.x (2025年6月最新)
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Firefox/140.0",
    "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:139.0) Gecko/20100101 Firefox/139.0",

    // Safari 18.x (2025年當前版本)
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",

    // Edge 137.x (2025年最新)
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.7204.96 Safari/537.36 Edg/137.0.3296.62",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.6975.112 Safari/537.36 Edg/136.0.3240.115",

    // 移動設備（更新到最新版本）
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  ];

  private readonly captchaPatterns = [
    "sorry",
    "captcha",
    "blocked",
    "unusual traffic",
    "verify",
    "protection",
    "please verify",
  ];

  constructor(logger?: Logger, browserPool?: BrowserPool) {
    this.logger = logger || new Logger({ level: "info", logQueries: false });
    this.concurrencyLimiter = new ConcurrencyLimiter(3, this.logger);
    this.browserPool = browserPool || null;

    this.resetResponseTimeStats();
    this.logInitializationStats();
    this.initializeDomainRotation();
  }

  /**
   * 記錄初始化統計和架構優勢
   */
  private logInitializationStats(): void {
    // 初始化完成 - 靜默模式，減少日誌噪音
  }

  /**
   * 初始化域名輪換策略
   */
  private initializeDomainRotation(): void {
    // 隨機初始域名，避免所有實例都從同一個域名開始
    this.currentDomainIndex = Math.floor(Math.random() * this.domains.length);
  }

  /**
   * 獲取當前使用的域名
   */
  private getCurrentDomain(): string {
    return this.domains[this.currentDomainIndex];
  }

  /**
   * 獲取下一個域名（輪換策略）
   */
  private getNextDomain(): string {
    this.currentDomainIndex =
      (this.currentDomainIndex + 1) % this.domains.length;
    const newDomain = this.getCurrentDomain();
    return newDomain;
  }

  /**
   * 域名失敗時的容錯切換
   */
  private handleDomainFailure(failedDomain: string, error: any): string {
    this.logger.warn("域名請求失敗，切換到下一個域名", {
      failedDomain,
      error: error?.message || String(error),
      nextDomain: this.getNextDomain(),
    });
    return this.getCurrentDomain();
  }

  /**
   * 重設響應時間統計（增強版）
   */
  private resetResponseTimeStats(): void {
    this.responseTimeStats = {
      totalRequests: 0,
      totalResponseTime: 0,
      averageResponseTime: 0,
      recentResponseTimes: [],
      responseTrend: "stable",
      trendConfidence: 0,
      baselineResponseTime: 0,
      performanceRegressionThreshold: 2.0,
      adaptiveAdjustments: {
        concurrencyReductions: 0,
        timeoutIncreases: 0,
        domainSwitches: 0,
      },
    };

    this.performanceBreakdown = {
      networkDelay: [],
      dnsLookup: [],
      connectionTime: [],
      parseTime: [],
      captchaEvents: 0,
      browserFallbacks: 0,
      retryAttempts: 0,
      errorBreakdown: {
        networkErrors: 0,
        timeouts: 0,
        captchaBlocks: 0,
        parseErrors: 0,
      },
    };
  }

  /**
   * 獲取整合性能統計（增強診斷版）
   */
  getPerformanceStats() {
    const stats = {
      searcher: {
        ...this.responseTimeStats,
        breakdown: {
          averageNetworkDelay: this.calculateAverage(
            this.performanceBreakdown.networkDelay,
          ),
          averageDnsLookup: this.calculateAverage(
            this.performanceBreakdown.dnsLookup,
          ),
          averageConnectionTime: this.calculateAverage(
            this.performanceBreakdown.connectionTime,
          ),
          averageParseTime: this.calculateAverage(
            this.performanceBreakdown.parseTime,
          ),
        },
        events: {
          captchaEvents: this.performanceBreakdown.captchaEvents,
          browserFallbacks: this.performanceBreakdown.browserFallbacks,
          retryAttempts: this.performanceBreakdown.retryAttempts,
        },
        errorBreakdown: this.performanceBreakdown.errorBreakdown,
      },
      concurrency: this.concurrencyLimiter.getStats(),
      integration: {
        fallbackToBrowser: this.fallbackToBrowser,
        captchaDetectionEnabled: !!this.browserPool,
        statePersistenceEnabled: this.browserPool ? true : false,
      },
    };

    if (this.browserPool) {
      return {
        ...stats,
        browserPool: this.browserPool.getStats(),
      };
    }

    return stats;
  }

  /**
   * 計算平均值輔助方法
   */
  private calculateAverage(values: number[]): number {
    if (values.length === 0) {
      return 0;
    }
    return Math.round(
      values.reduce((sum, val) => sum + val, 0) / values.length,
    );
  }

  /**
   * 健康檢查 - 綜合性能評估
   */
  async healthCheck() {
    const stats = this.getPerformanceStats();
    const recommendations: string[] = [];

    let networkStatus: "ok" | "warning" | "error" = "ok";
    if (stats.searcher.averageResponseTime > 30000) {
      networkStatus = "error";
      recommendations.push("網絡響應過慢，建議檢查網絡連接");
    } else if (stats.searcher.averageResponseTime > 15000) {
      networkStatus = "warning";
      recommendations.push("網絡響應略慢，可考慮調整超時設定");
    }

    let concurrencyStatus: "ok" | "warning" | "error" = "ok";
    if (stats.concurrency.failed > stats.concurrency.completed * 0.3) {
      concurrencyStatus = "error";
      recommendations.push("並發失敗率過高，建議降低並發數");
    } else if (stats.concurrency.failed > stats.concurrency.completed * 0.1) {
      concurrencyStatus = "warning";
      recommendations.push("並發失敗率較高，建議監控");
    }

    let searcherStatus: "ok" | "warning" | "error" = "ok";
    if (stats.integration.fallbackToBrowser) {
      searcherStatus = "warning";
      recommendations.push("已切換到瀏覽器模式，性能可能受影響");
    }

    let browserPoolStatus: "ok" | "warning" | "error" | undefined;
    if ("browserPool" in stats && stats.browserPool) {
      browserPoolStatus = "ok";
      if (!stats.browserPool.isHealthy) {
        browserPoolStatus = "error";
        recommendations.push("瀏覽器實例不健康，建議重啟");
      } else if (
        stats.browserPool.activeTabs >=
        stats.browserPool.maxTabs * 0.8
      ) {
        browserPoolStatus = "warning";
        recommendations.push("瀏覽器標籤頁使用率過高");
      }
    }

    const allStatuses = [
      networkStatus,
      concurrencyStatus,
      searcherStatus,
      browserPoolStatus,
    ].filter(Boolean);
    let overallStatus: "healthy" | "degraded" | "unhealthy" = "healthy";

    if (allStatuses.includes("error")) {
      overallStatus = "unhealthy";
    } else if (allStatuses.includes("warning")) {
      overallStatus = "degraded";
    }

    if (recommendations.length === 0) {
      recommendations.push("系統運行狀態良好");
    }

    return {
      status: overallStatus,
      details: {
        searcher: searcherStatus,
        browserPool: browserPoolStatus,
        concurrency: concurrencyStatus,
        network: networkStatus,
      },
      stats,
      recommendations,
    };
  }

  /**
   * 重設所有統計資料和狀態
   */
  async resetAll(): Promise<void> {
    this.logger.info("重設所有統計和狀態");

    this.resetResponseTimeStats();

    this.concurrencyLimiter.resetStats();

    this.fallbackToBrowser = false;

    if (this.browserPool) {
      await this.browserPool
        .getSingleBrowser()
        .then((_browser) => {
          return this.browserPool!.cleanup();
        })
        .catch((error) => {
          this.logger.warn("重設瀏覽器池失敗", { error: error.message });
        });
    }

    this.logger.info("所有統計和狀態已重設");
  }

  /**
   * 檢測是否被CAPTCHA或反機器人系統阻擋（參考g-search-mcp）
   */
  /**
   * 增強型CAPTCHA檢測系統（學習g-search-mcp多階段檢測）
   */
  private detectCaptchaOrBlock(html: string, url: string): boolean {
    const detectionResult = this.performMultiStageCapcthaDetection(html, url);

    if (detectionResult.isBlocked) {
      this.performanceBreakdown.captchaEvents++;
      this.logger.warn("檢測到CAPTCHA或反機器人系統", {
        url: url.substring(0, 100),
        detectionStages: detectionResult.triggeredStages,
        confidence: detectionResult.confidence,
        blockType: detectionResult.blockType,
      });
    }

    return detectionResult.isBlocked;
  }

  /**
   * 多階段CAPTCHA檢測核心邏輯
   */
  private performMultiStageCapcthaDetection(
    html: string,
    url: string,
  ): {
    isBlocked: boolean;
    confidence: number;
    blockType: string;
    triggeredStages: string[];
  } {
    const content = html.toLowerCase();
    const urlLower = url.toLowerCase();
    const triggeredStages: string[] = [];
    let confidence = 0;
    let blockType = "unknown";

    // 階段1：URL模式檢測
    const urlPatterns = [
      "duckduckgo.com/sorry",
      "start.duckduckgo.com/sorry",
      "captcha",
      "recaptcha",
      "verification",
      "challenge",
      "blocked",
      "unusual_traffic",
    ];

    const hasUrlPattern = urlPatterns.some((pattern) =>
      urlLower.includes(pattern),
    );
    if (hasUrlPattern) {
      triggeredStages.push("url_pattern");
      confidence += 40;
      blockType = "url_redirect";
    }

    // 階段2：內容關鍵字檢測（基礎）
    const basicContentPatterns = this.captchaPatterns;
    const hasBasicPattern = basicContentPatterns.some((pattern) =>
      content.includes(pattern),
    );
    if (hasBasicPattern) {
      triggeredStages.push("basic_content");
      confidence += 25;
      if (blockType === "unknown") {
        blockType = "content_keyword";
      }
    }

    // 階段3：DuckDuckGo特定檢測（增強版）
    const duckduckgoSpecific = this.detectDuckDuckGoSpecificBlocks(
      content,
      html,
    );
    if (duckduckgoSpecific.isBlocked) {
      triggeredStages.push("duckduckgo_specific");
      confidence += duckduckgoSpecific.confidence;
      blockType = duckduckgoSpecific.blockType;
    }

    // 階段4：視覺元素檢測
    const visualDetection = this.detectVisualCaptchaElements(html);
    if (visualDetection.isBlocked) {
      triggeredStages.push("visual_elements");
      confidence += visualDetection.confidence;
      if (blockType === "unknown") {
        blockType = "visual_captcha";
      }
    }

    // 階段5：行為模式檢測
    const behaviorDetection = this.detectAntiBotBehavior(content, html);
    if (behaviorDetection.isBlocked) {
      triggeredStages.push("behavior_pattern");
      confidence += behaviorDetection.confidence;
      if (blockType === "unknown") {
        blockType = "anti_bot";
      }
    }

    // 階段6：結構異常檢測
    const structuralDetection = this.detectStructuralAnomalies(html);
    if (structuralDetection.isBlocked) {
      triggeredStages.push("structural_anomaly");
      confidence += structuralDetection.confidence;
      if (blockType === "unknown") {
        blockType = "page_structure";
      }
    }

    return {
      isBlocked: confidence >= 30, // 置信度閾值
      confidence: Math.min(confidence, 100),
      blockType,
      triggeredStages,
    };
  }

  /**
   * DuckDuckGo特定阻擋檢測
   */
  private detectDuckDuckGoSpecificBlocks(
    content: string,
    html: string,
  ): {
    isBlocked: boolean;
    confidence: number;
    blockType: string;
  } {
    let confidence = 0;
    let blockType = "unknown";

    // JavaScript要求檢測
    if (
      content.includes("javascript is required") ||
      content.includes("please enable javascript") ||
      content.includes("javascript必須開啟")
    ) {
      confidence += 30;
      blockType = "javascript_required";
    }

    // 速率限制檢測
    if (
      content.includes("rate limited") ||
      content.includes("too many requests") ||
      content.includes("請求過於頻繁")
    ) {
      confidence += 35;
      blockType = "rate_limited";
    }

    // 臨時阻擋檢測
    if (
      content.includes("temporarily blocked") ||
      content.includes("temporary block") ||
      content.includes("暫時阻擋")
    ) {
      confidence += 30;
      blockType = "temporarily_blocked";
    }


    // 地區限制檢測
    if (
      content.includes("not available in your region") ||
      content.includes("地區限制") ||
      content.includes("regional restriction")
    ) {
      confidence += 25;
      blockType = "region_blocked";
    }

    // 檢測空白或異常短的頁面
    if (html.length < 1000 && !content.includes("result")) {
      confidence += 20;
      blockType = "empty_page";
    }

    return {
      isBlocked: confidence >= 25,
      confidence,
      blockType,
    };
  }

  /**
   * 視覺CAPTCHA元素檢測
   */
  private detectVisualCaptchaElements(html: string): {
    isBlocked: boolean;
    confidence: number;
  } {
    let confidence = 0;

    // 檢測CAPTCHA相關的iframe
    if (
      html.includes("<iframe") &&
      (html.includes("recaptcha") || html.includes("captcha"))
    ) {
      confidence += 35;
    }

    // 檢測CAPTCHA圖像
    if (
      html.includes("<img") &&
      (html.includes("captcha") || html.includes("verification"))
    ) {
      confidence += 30;
    }

    // 檢測hCaptcha
    if (html.includes("hcaptcha") || html.includes("h-captcha")) {
      confidence += 35;
    }

    // 檢測reCAPTCHA v2/v3
    if (
      html.includes("g-recaptcha") ||
      html.includes("grecaptcha") ||
      html.includes("recaptcha/api")
    ) {
      confidence += 40;
    }

    // 檢測Cloudflare Challenge
    if (
      html.includes("cf-challenge") ||
      html.includes("cloudflare") ||
      html.includes("checking your browser")
    ) {
      confidence += 30;
    }

    return {
      isBlocked: confidence >= 30,
      confidence,
    };
  }

  /**
   * 反機器人行為模式檢測
   */
  private detectAntiBotBehavior(
    content: string,
    html: string,
  ): {
    isBlocked: boolean;
    confidence: number;
  } {
    let confidence = 0;

    // 檢測需要用戶互動的提示
    if (
      content.includes("click to continue") ||
      content.includes("press and hold") ||
      content.includes("verify you are human")
    ) {
      confidence += 25;
    }

    // 檢測瀏覽器檢查腳本
    if (
      html.includes("navigator.webdriver") ||
      html.includes("automation") ||
      html.includes("headless")
    ) {
      confidence += 20;
    }

    // 檢測延遲載入或重定向
    if (
      html.includes("setTimeout") &&
      (html.includes("redirect") || html.includes("location.href"))
    ) {
      confidence += 15;
    }

    // 檢測Canvas指紋檢測
    if (html.includes("canvas") && html.includes("toDataURL")) {
      confidence += 10;
    }

    return {
      isBlocked: confidence >= 20,
      confidence,
    };
  }

  /**
   * 頁面結構異常檢測
   */
  private detectStructuralAnomalies(html: string): {
    isBlocked: boolean;
    confidence: number;
  } {
    let confidence = 0;

    // 檢測異常的meta標籤
    if (
      html.includes('<meta http-equiv="refresh"') ||
      html.includes('meta[http-equiv="refresh"]')
    ) {
      confidence += 15;
    }

    // 檢測缺少正常的搜索元素
    const hasSearchForm = html.includes("<form") && html.includes("search");
    const hasResults =
      html.includes("result") || html.includes("search-result");

    if (!hasSearchForm && !hasResults && html.length > 2000) {
      confidence += 20;
    }

    // 檢測過多的script標籤（可能是檢測腳本）
    const scriptMatches = html.match(/<script/g);
    if (scriptMatches && scriptMatches.length > 10) {
      confidence += 10;
    }

    return {
      isBlocked: confidence >= 15,
      confidence,
    };
  }

  /**
   * 使用瀏覽器模式進行搜索（用於CAPTCHA的後備方案）
   */
  private async performBrowserSearch(
    query: string,
    options: SearchOptions,
    timeout: number,
  ): Promise<SearchResult[]> {
    if (!this.browserPool) {
      throw new SearchError(
        "無法使用瀏覽器模式：未初始化BrowserPool",
        "BROWSER_UNAVAILABLE",
      );
    }

    let managedTab: ManagedTab | null = null;

    try {
      // 獲取瀏覽器標籤頁
      managedTab = await this.browserPool.createTab("search-captcha");
      const { page } = managedTab;

      // 設定超時
      page.setDefaultTimeout(timeout);

      // 構建搜索URL
      const params = this.buildSearchParams(query, options);
      const url = `${this.getCurrentDomain()}?${params}`;

      this.logger.info("使用瀏覽器模式搜索", {
        query: query.substring(0, 50),
        url: url.substring(0, 100),
      });

      // 訪問搜索頁面
      const response = await page.goto(url, {
        waitUntil: "networkidle",
        timeout,
      });

      if (!response || !response.ok()) {
        throw new SearchError("瀏覽器請求失敗", "BROWSER_ERROR");
      }

      // 獲取頁面內容
      const html = await page.content();

      // 檢查CAPTCHA並處理動態模式切換
      if (this.detectCaptchaOrBlock(html, page.url())) {
        return await this.handleCaptchaWithDynamicSwitching(
          query,
          options,
          timeout,
          managedTab,
        );
      }

      // 解析結果
      const results = await this.parseResults(html, options.count || 10);

      this.logger.info("瀏覽器模式搜索完成", {
        query: query.substring(0, 50),
        resultCount: results.length,
      });

      return results;
    } catch (error) {
      this.logger.error("瀏覽器模式搜索失敗", error as Error);
      throw error;
    } finally {
      // 清理資源
      if (managedTab) {
        await managedTab.release();
      }
    }
  }

  /**
   * 等待CAPTCHA解決
   */
  private async waitForCaptchaResolution(
    page: any,
    timeout: number,
  ): Promise<void> {
    const maxWaitTime = timeout * 2; // 最多等待原始超時的兩倍
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const currentUrl = page.url();
        const html = await page.content();

        // 檢查是否已經離開CAPTCHA頁面
        if (!this.detectCaptchaOrBlock(html, currentUrl)) {
          this.logger.info("CAPTCHA已解決，繼續搜索");
          return;
        }

        // 等待一段時間再檢查
        await page.waitForTimeout(2000);
      } catch {
        // 忽略檢查錯誤，繼續等待
      }
    }

    throw new SearchError("CAPTCHA等待超時", "CAPTCHA_TIMEOUT");
  }

  /**
   * 處理CAPTCHA檢測和動態模式切換（學習g-search-mcp策略）
   */
  private async handleCaptchaWithDynamicSwitching(
    query: string,
    options: SearchOptions,
    timeout: number,
    currentTab: ManagedTab | null,
  ): Promise<SearchResult[]> {
    if (!this.browserPool) {
      throw new SearchError(
        "無法處理CAPTCHA：瀏覽器池未初始化",
        "BROWSER_UNAVAILABLE",
      );
    }

    // 檢查當前是否為無頭模式
    const isCurrentlyHeadless = this.browserPool.isHeadlessMode();

    if (isCurrentlyHeadless) {
      this.logger.warn("檢測到CAPTCHA，切換到有界面模式以支援手動驗證");

      // 釋放當前標籤頁
      if (currentTab) {
        await currentTab.release();
      }

      // 切換到有界面模式
      await this.browserPool.switchToHeadedMode();

      // 遞歸調用搜索，使用新的有界面模式瀏覽器
      return await this.performBrowserSearch(query, options, timeout);
    } else {
      // 已經是有界面模式，等待用戶手動解決CAPTCHA
      this.logger.warn("檢測到CAPTCHA，請在瀏覽器中手動完成驗證...");

      if (currentTab) {
        await this.waitForUserCaptchaResolution(currentTab.page, timeout);

        // 重新獲取頁面內容並解析結果
        const html = await currentTab.page.content();
        return await this.parseResults(html, options.count || 10);
      } else {
        throw new SearchError(
          "無法處理CAPTCHA：沒有可用的瀏覽器標籤頁",
          "NO_BROWSER_TAB",
        );
      }
    }
  }

  /**
   * 等待用戶手動解決CAPTCHA（有界面模式）
   */
  private async waitForUserCaptchaResolution(
    page: Page,
    originalTimeout: number,
  ): Promise<void> {
    const extendedTimeout = originalTimeout * 2; // 為用戶操作提供更多時間
    const startTime = Date.now();

    this.logger.info("等待用戶完成CAPTCHA驗證...", {
      timeout: Math.round(extendedTimeout / 1000) + "s",
      message: "請在瀏覽器中完成驗證，然後搜索將自動繼續",
    });

    // 定義CAPTCHA相關的URL模式
    const captchaPatterns = [
      "duckduckgo.com/sorry",
      "captcha",
      "recaptcha",
      "verification",
      "blocked",
    ];

    try {
      // 等待導航離開CAPTCHA頁面
      await page.waitForFunction(
        (patterns: string[]) => {
          const currentUrl = window.location.href.toLowerCase();
          const pageContent = document.body?.textContent?.toLowerCase() || "";

          // 檢查URL和頁面內容是否仍包含CAPTCHA指示器
          const hasUrlPattern = patterns.some((pattern: string) =>
            currentUrl.includes(pattern),
          );
          const hasContentPattern = patterns.some((pattern: string) =>
            pageContent.includes(pattern),
          );

          // 當URL和內容都不包含CAPTCHA模式時返回true
          return !hasUrlPattern && !hasContentPattern;
        },
        captchaPatterns,
        {
          timeout: extendedTimeout,
          polling: 2000, // 每2秒檢查一次
        },
      );

      const elapsedTime = Date.now() - startTime;
      this.logger.info("CAPTCHA驗證完成", {
        elapsedTime: Math.round(elapsedTime / 1000) + "s",
        message: "繼續執行搜索...",
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("Timeout")) {
        this.logger.error("CAPTCHA驗證超時", undefined, {
          timeout: Math.round(extendedTimeout / 1000) + "s",
          message: "請確保已完成驗證並刷新頁面",
        });
        throw new SearchError("用戶CAPTCHA驗證超時", "USER_CAPTCHA_TIMEOUT");
      }
      throw error;
    }
  }

  /**
   * 執行網頁搜索 - 帶重試機制的增強版本
   */
  async search(
    query: string,
    options: SearchOptions = {},
  ): Promise<SearchResult[]> {
    if (!query || query.trim().length === 0) {
      throw new SearchError("搜索查詢不能為空");
    }

    const baseTimeout = options.timeout || this.defaultTimeout;
    const maxRetries = 3;
    const retryDelay = 1000;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const dynamicTimeout = baseTimeout + (attempt - 1) * 5000;

        this.logger.debug(`開始搜索嘗試`, {
          attempt,
          maxRetries,
          timeout: dynamicTimeout,
          query: query.substring(0, 50),
        });

        const results = await this.performSingleSearch(
          query,
          options,
          dynamicTimeout,
        );

        if (attempt > 1) {
          this.logger.info(`重試成功`, {
            attempt,
            query: query.substring(0, 50),
            resultCount: results.length,
          });
        }

        return results;
      } catch (error) {
        lastError = error as Error;
        const searchError =
          error instanceof SearchError
            ? error
            : new SearchError(
                `搜索執行失敗: ${getErrorMessage(error)}`,
                "NETWORK_ERROR",
              );

        this.logger.warn(`搜索嘗試 ${attempt} 失敗`, {
          attempt,
          maxRetries,
          error: searchError.message,
          code: searchError.code,
          query: query.substring(0, 50),
        });

        // 如果是CAPTCHA錯誤，嘗試使用瀏覽器模式
        if (searchError.code === "CAPTCHA_DETECTED") {
          this.performanceBreakdown.captchaEvents++;
          this.performanceBreakdown.errorBreakdown.captchaBlocks++;

          if (this.browserPool && !this.fallbackToBrowser) {
            this.logger.info("檢測到CAPTCHA，切換到瀏覽器模式重試");
            this.fallbackToBrowser = true;
            this.performanceBreakdown.browserFallbacks++;

            try {
              // 觸發CAPTCHA處理機制
              await this.browserPool.handleCaptcha();

              // 使用瀏覽器模式重新搜索
              const browserResults = await this.performBrowserSearch(
                query,
                options,
                baseTimeout + (attempt - 1) * 5000,
              );
              return browserResults;
            } catch (browserError) {
              this.logger.warn("瀏覽器模式也失敗，繼續使用原始模式", {
                error: (browserError as Error).message,
              });
              // 設定回原始模式並繼續重試
              this.fallbackToBrowser = false;
            }
          }

          if (attempt < maxRetries) {
            await this.delay(retryDelay * attempt);
          }
          continue;
        }

        this.performanceBreakdown.retryAttempts++;

        // 如果是速率限制錯誤，增加延遲
        if (searchError.code === "RATE_LIMITED") {
          this.performanceBreakdown.errorBreakdown.networkErrors++;
          if (attempt < maxRetries) {
            const delayTime = retryDelay * Math.pow(2, attempt - 1); // 指數退避
            this.logger.info(`速率限制，等待 ${delayTime}ms 後重試`);
            await this.delay(delayTime);
          }
          continue;
        }


        if (searchError.code === "TIMEOUT") {
          this.performanceBreakdown.errorBreakdown.timeouts++;

          // 連續超時時採用更保守的策略
          if (this.performanceBreakdown.errorBreakdown.timeouts >= 3) {
            this.logger.warn("連續超時檢測，啟動保護模式", {
              consecutiveTimeouts:
                this.performanceBreakdown.errorBreakdown.timeouts,
              currentAttempt: attempt,
            });

            // 大幅增加重試延遲
            const conservativeDelay = retryDelay * attempt * 3;
            await this.delay(conservativeDelay);
          } else if (attempt < maxRetries) {
            await this.delay(retryDelay * attempt * 2);
          }
          continue;
        }

        if (searchError.code === "EARLY_TIMEOUT") {
          this.performanceBreakdown.errorBreakdown.timeouts++;
          if (attempt < maxRetries) {
            this.logger.info(`早期檢測超時，保守重試第 ${attempt + 1} 次`);
            await this.delay(1500);
          }
          continue;
        }

        // 對於其他類型的錯誤，不重試
        if (
          searchError.code === "API_ERROR" &&
          searchError.statusCode &&
          searchError.statusCode >= 400 &&
          searchError.statusCode < 500
        ) {
          throw searchError;
        }

        // 最後一次嘗試時拋出錯誤
        if (attempt === maxRetries) {
          break;
        }

        // 其他錯誤時稍作延遲再重試
        await this.delay(retryDelay);
      }
    }

    // 所有重試都失敗時拋出最後的錯誤
    throw (
      lastError ||
      new SearchError("搜索失敗，已用盡所有重試機會", "MAX_RETRIES_EXCEEDED")
    );
  }

  /**
   * 執行單次搜索請求 - 支援多域名容錯和早期檢測機制
   */
  private async performSingleSearch(
    query: string,
    options: SearchOptions,
    timeout: number,
  ): Promise<SearchResult[]> {
    const params = this.buildSearchParams(query, options);
    const attemptedDomains = new Set<string>();
    let lastError: any;

    // 嘗試所有可用域名
    for (let attempts = 0; attempts < this.domains.length; attempts++) {
      const currentDomain = this.getCurrentDomain();
      const url = `${currentDomain}?${params}`;

      if (attemptedDomains.has(currentDomain)) {
        this.getNextDomain(); // 跳過已嘗試的域名
        continue;
      }

      attemptedDomains.add(currentDomain);

      try {
        this.logger.debug("嘗試域名搜索", {
          domain: currentDomain,
          attempt: attempts + 1,
          totalDomains: this.domains.length,
        });

        const result = await this.performSingleDomainSearch(
          query,
          url,
          options,
          timeout,
        );

        // 成功時記錄域名性能
        this.logger.info("搜索成功", {
          domain: currentDomain,
          resultsCount: result.length,
          attempt: attempts + 1,
        });

        return result;
      } catch (error) {
        lastError = error;
        this.logger.warn("域名搜索失敗", {
          domain: currentDomain,
          error: error instanceof Error ? error.message : String(error),
          attempt: attempts + 1,
          willRetryWithNextDomain: attempts < this.domains.length - 1,
        });

        // 特定錯誤不需要切換域名，直接拋出
        if (
          error instanceof SearchError &&
          (error.code === "EARLY_TIMEOUT" || error.code === "CAPTCHA_DETECTED")
        ) {
          throw error;
        }

        // 切換到下一個域名
        this.handleDomainFailure(currentDomain, error);
      }
    }

    // 所有域名都失敗
    this.logger.error(
      "所有域名都失敗",
      lastError instanceof Error ? lastError : undefined,
      {
        attemptedDomains: Array.from(attemptedDomains),
        lastError:
          lastError instanceof Error ? lastError.message : String(lastError),
      },
    );

    throw (
      lastError || new SearchError("所有域名都無法訪問", "ALL_DOMAINS_FAILED")
    );
  }

  /**
   * 對單個域名執行搜索請求
   */
  private async performSingleDomainSearch(
    query: string,
    url: string,
    options: SearchOptions,
    timeout: number,
  ): Promise<SearchResult[]> {
    // 響應時間監控
    const requestStartTime = Date.now();

    // 實現早期檢測機制：15秒無響應則快速失敗
    const earlyDetectionTimeout = 15000;
    const useEarlyDetection = timeout > earlyDetectionTimeout;

    // 使用自適應超時
    const adaptiveTimeout = this.getAdaptiveTimeout();
    const finalTimeout = Math.min(timeout, adaptiveTimeout);

    this.logger.debug("發起搜索請求", {
      query: query.substring(0, 50),
      originalTimeout: timeout,
      adaptiveTimeout: Math.round(adaptiveTimeout),
      finalTimeout: Math.round(finalTimeout),
      useEarlyDetection,
    });

    let response: any;

    if (useEarlyDetection) {
      // 使用早期檢測的雙層超時機制
      try {
        response = await Promise.race([
          fetch(url, {
            headers: this.getHeaders(),
            // @ts-ignore - node-fetch timeout 設定
            timeout: finalTimeout,
          }),
          new Promise((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new SearchError(
                    "早期檢測超時，可能網絡緩慢",
                    "EARLY_TIMEOUT",
                  ),
                ),
              earlyDetectionTimeout,
            ),
          ),
        ]);
      } catch (error) {
        if (error instanceof SearchError && error.code === "EARLY_TIMEOUT") {
          this.logger.warn("觸發早期檢測機制", {
            query: query.substring(0, 50),
            earlyDetectionTimeout,
          });
          throw error;
        }
        throw error;
      }
    } else {
      // 對於較短的超時時間，直接使用標準請求
      response = await fetch(url, {
        headers: this.getHeaders(),
        // @ts-ignore - node-fetch timeout 設定
        timeout: finalTimeout,
      });
    }

    if (!response.ok) {
      throw new SearchError(
        `DuckDuckGo API 請求失敗: ${response.status} ${response.statusText}`,
        "API_ERROR",
        response.status,
      );
    }

    const html = await response.text();

    // 檢查是否被速率限制
    if (html.includes("rate limit") || html.includes("too many requests")) {
      throw new SearchError("請求過於頻繁，請稍後再試", "RATE_LIMITED", 429);
    }

    // CAPTCHA檢測
    if (this.detectCaptchaOrBlock(html, response.url || url)) {
      this.logger.warn(
        "檢測到CAPTCHA或反機器人系統，嘗試使用瀏覽器模式繼續搜索",
      );
      throw new SearchError(
        "檢測到CAPTCHA或反機器人系統，需要使用瀏覽器模式",
        "CAPTCHA_DETECTED",
      );
    }

    // 檢查是否返回空結果（可能是被反爬蟲阻擋）
    if (html.length < 1000 || !html.includes("result")) {
      throw new SearchError(
        "獲取的頁面內容異常，可能被反爬蟲機制阻擋",
        "BLOCKED",
      );
    }

    // 記錄響應時間
    const responseTime = Date.now() - requestStartTime;
    this.recordResponseTime(responseTime);

    this.performanceBreakdown.networkDelay.push(responseTime);
    if (this.performanceBreakdown.networkDelay.length > 50) {
      this.performanceBreakdown.networkDelay.shift(); // 保持最近50次記錄
    }

    // 記錄解析時間
    const parseStartTime = Date.now();
    const results = await this.parseResults(html, options.count || 10);
    const parseTime = Date.now() - parseStartTime;

    this.performanceBreakdown.parseTime.push(parseTime);
    if (this.performanceBreakdown.parseTime.length > 50) {
      this.performanceBreakdown.parseTime.shift();
    }

    this.logger.debug("搜索請求完成", {
      query: query.substring(0, 50),
      responseTime,
      resultCount: results.length,
      htmlSize: html.length,
    });

    return results;
  }

  /**
   * 建構搜索參數
   */
  private buildSearchParams(
    query: string,
    options: SearchOptions,
  ): URLSearchParams {
    const params = new URLSearchParams();

    // 基本搜索參數
    params.append("q", query);
    params.append("kl", options.language || "wt-wt");
    // 移除分頁支援以簡化參數
    // 注意：DuckDuckGo HTML 版本不支援通過 URL 參數控制結果數量
    // 結果數量將在解析階段根據 options.count 進行限制

    // 安全搜索設定
    if (options.safeSearch) {
      const safeSearchMap = {
        strict: "1",
        moderate: "-1",
        off: "-2",
      };
      params.append("kp", safeSearchMap[options.safeSearch] || "-1");
    }

    // 時間範圍過濾
    if (options.timeRange) {
      const timeMap = {
        day: "d",
        week: "w",
        month: "m",
        year: "y",
      };
      params.append("df", timeMap[options.timeRange]);
    }

    // 其他參數
    params.append("no_redirect", "1"); // 禁用重定向

    return params;
  }

  /**
   * 獲取請求標頭 - 支援 User-Agent 輪換和反爬蟲對策
   */
  private getHeaders(): Record<string, string> {
    // 輪換 User-Agent
    const userAgent = this.getRandomUserAgent();

    return {
      "User-Agent": userAgent,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Cache-Control": "max-age=0",
      DNT: "1", // Do Not Track
      "Sec-CH-UA": this.generateSecChUa(userAgent),
      "Sec-CH-UA-Mobile": "?0",
      "Sec-CH-UA-Platform": this.generatePlatform(userAgent),
    };
  }

  /**
   * 獲取隨機 User-Agent
   */
  private getRandomUserAgent(): string {
    // 減少輪換頻率，每5次請求才輪換一次User-Agent
    const rotationFrequency = 5;
    const currentIndex =
      Math.floor(this.responseTimeStats.totalRequests / rotationFrequency) %
      this.userAgents.length;
    const userAgent = this.userAgents[currentIndex];

    this.logger.debug("使用 User-Agent (穩定模式)", {
      totalRequests: this.responseTimeStats.totalRequests,
      rotationFrequency,
      currentIndex,
      userAgent: userAgent.substring(0, 50) + "...",
    });

    return userAgent;
  }

  /**
   * 生成 Sec-CH-UA 標頭（性能優化：更新至最新版本）
   */
  private generateSecChUa(userAgent: string): string {
    if (userAgent.includes("Chrome") && userAgent.includes("122")) {
      return '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"';
    } else if (userAgent.includes("Chrome") && userAgent.includes("121")) {
      return '"Not(A:Brand";v="24", "Chromium";v="121", "Google Chrome";v="121"';
    } else if (userAgent.includes("Edge")) {
      return '"Chromium";v="122", "Not(A:Brand";v="24", "Microsoft Edge";v="122"';
    } else if (userAgent.includes("Firefox")) {
      // Firefox 不支援 Client Hints
      return '"Firefox";v="123"';
    } else if (userAgent.includes("Safari") && !userAgent.includes("Chrome")) {
      // Safari 不支援 Client Hints
      return '"Safari";v="17"';
    }
    // 默認 Chrome 122
    return '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"';
  }

  /**
   * 生成平台標頭
   */
  private generatePlatform(userAgent: string): string {
    if (userAgent.includes("Windows")) {
      return '"Windows"';
    } else if (userAgent.includes("Macintosh")) {
      return '"macOS"';
    } else if (userAgent.includes("Linux")) {
      return '"Linux"';
    }
    return '"Windows"';
  }

  /**
   * 記錄響應時間統計
   */
  private recordResponseTime(responseTime: number): void {
    this.responseTimeStats.totalRequests++;
    this.responseTimeStats.totalResponseTime += responseTime;
    this.responseTimeStats.averageResponseTime =
      this.responseTimeStats.totalResponseTime /
      this.responseTimeStats.totalRequests;

    // 設置基準響應時間（前10個請求的平均值）
    if (this.responseTimeStats.totalRequests === 10) {
      this.responseTimeStats.baselineResponseTime =
        this.responseTimeStats.averageResponseTime;
      this.logger.info("基準響應時間已設定", {
        baseline: Math.round(this.responseTimeStats.baselineResponseTime),
        regressionThreshold: Math.round(
          this.responseTimeStats.baselineResponseTime *
            this.responseTimeStats.performanceRegressionThreshold,
        ),
      });
    }

    // 保持最近30次響應時間用於更精確的趨勢分析
    this.responseTimeStats.recentResponseTimes.push(responseTime);
    if (this.responseTimeStats.recentResponseTimes.length > 30) {
      this.responseTimeStats.recentResponseTimes.shift();
    }

    // 執行趨勢分析和自適應調整
    this.analyzeResponseTimeTrend();
    this.performAdaptiveAdjustments();

    // 記錄增強的性能統計
    this.logger.debug("響應時間統計", {
      currentResponseTime: responseTime,
      averageResponseTime: Math.round(
        this.responseTimeStats.averageResponseTime,
      ),
      totalRequests: this.responseTimeStats.totalRequests,
      trend: this.responseTimeStats.responseTrend,
      trendConfidence: Math.round(this.responseTimeStats.trendConfidence * 100),
      adaptiveAdjustments: this.responseTimeStats.adaptiveAdjustments,
    });
  }

  /**
   * 詳細的響應時間趨勢分析
   */
  private analyzeResponseTimeTrend(): void {
    if (this.responseTimeStats.recentResponseTimes.length < 10) {
      this.responseTimeStats.responseTrend = "stable";
      this.responseTimeStats.trendConfidence = 0;
      return;
    }

    const recent = this.responseTimeStats.recentResponseTimes;
    const windowSize = Math.min(10, recent.length);

    // 計算不同時間窗口的平均值
    const recentAvg =
      recent.slice(-windowSize).reduce((sum, time) => sum + time, 0) /
      windowSize;
    const previousAvg =
      recent
        .slice(-windowSize * 2, -windowSize)
        .reduce((sum, time) => sum + time, 0) / windowSize;
    const _overallAvg = this.responseTimeStats.averageResponseTime;

    // 計算趨勢變化率
    const recentChangeRate =
      previousAvg > 0 ? (recentAvg - previousAvg) / previousAvg : 0;
    const baselineChangeRate =
      this.responseTimeStats.baselineResponseTime > 0
        ? (recentAvg - this.responseTimeStats.baselineResponseTime) /
          this.responseTimeStats.baselineResponseTime
        : 0;

    // 計算標準差來衡量穩定性
    const variance =
      recent.slice(-windowSize).reduce((sum, time) => {
        return sum + Math.pow(time - recentAvg, 2);
      }, 0) / windowSize;
    const standardDeviation = Math.sqrt(variance);
    const coefficientOfVariation =
      recentAvg > 0 ? standardDeviation / recentAvg : 0;

    // 確定趨勢
    let trend: "improving" | "stable" | "degrading";
    let confidence: number;

    if (Math.abs(recentChangeRate) < 0.1 && coefficientOfVariation < 0.3) {
      trend = "stable";
      confidence = Math.max(0, 1 - coefficientOfVariation);
    } else if (recentChangeRate < -0.15) {
      trend = "improving";
      confidence = Math.min(
        1,
        Math.abs(recentChangeRate) + (1 - coefficientOfVariation) * 0.5,
      );
    } else if (
      recentChangeRate > 0.2 ||
      baselineChangeRate >
        this.responseTimeStats.performanceRegressionThreshold - 1
    ) {
      trend = "degrading";
      confidence = Math.min(1, recentChangeRate + coefficientOfVariation * 0.5);
    } else {
      trend = "stable";
      confidence = Math.max(0, 0.5 - Math.abs(recentChangeRate));
    }

    this.responseTimeStats.responseTrend = trend;
    this.responseTimeStats.trendConfidence = confidence;

    // 記錄趨勢變化
    if (this.responseTimeStats.totalRequests % 10 === 0) {
      this.logger.info("響應時間趨勢分析", {
        trend,
        confidence: Math.round(confidence * 100),
        recentAvg: Math.round(recentAvg),
        recentChangeRate: Math.round(recentChangeRate * 100),
        baselineChangeRate: Math.round(baselineChangeRate * 100),
        coefficientOfVariation: Math.round(coefficientOfVariation * 100),
        performanceRegression:
          baselineChangeRate >
          this.responseTimeStats.performanceRegressionThreshold - 1,
      });
    }
  }

  /**
   * 根據趨勢分析執行自適應調整
   */
  private performAdaptiveAdjustments(): void {
    const { responseTrend, trendConfidence, adaptiveAdjustments } =
      this.responseTimeStats;
    const avgResponseTime = this.responseTimeStats.averageResponseTime;
    const errorRate = this.calculateErrorRate();

    // 只在有足夠信心時進行調整
    if (trendConfidence < 0.7 || this.responseTimeStats.totalRequests < 15) {
      return;
    }

    // 性能退化時的調整策略
    if (responseTrend === "degrading") {
      // 降低並發數以減少系統負載
      const currentConcurrency = this.concurrencyLimiter.maxConcurrency;
      if (
        currentConcurrency > 1 &&
        adaptiveAdjustments.concurrencyReductions < 3
      ) {
        const newConcurrency = Math.max(
          1,
          Math.floor(currentConcurrency * 0.75),
        );
        this.concurrencyLimiter = new ConcurrencyLimiter(
          newConcurrency,
          this.logger,
        );
        adaptiveAdjustments.concurrencyReductions++;

        this.logger.warn("檢測到性能退化，自動降低並發數", {
          oldConcurrency: currentConcurrency,
          newConcurrency,
          trendConfidence: Math.round(trendConfidence * 100),
          avgResponseTime: Math.round(avgResponseTime),
        });
      }

      // 在響應時間過長且錯誤率高時切換域名
      if (avgResponseTime > this.defaultTimeout * 0.6 && errorRate > 0.2) {
        if (adaptiveAdjustments.domainSwitches < 2) {
          this.getNextDomain();
          adaptiveAdjustments.domainSwitches++;

          this.logger.warn("自動切換域名以改善性能", {
            newDomain: this.getCurrentDomain(),
            avgResponseTime: Math.round(avgResponseTime),
            errorRate: Math.round(errorRate * 100),
          });
        }
      }
    }

    // 性能改善時的恢復策略
    else if (responseTrend === "improving" && trendConfidence > 0.8) {
      // 逐步恢復並發數
      const currentConcurrency = this.concurrencyLimiter.maxConcurrency;
      if (
        currentConcurrency < 3 &&
        adaptiveAdjustments.concurrencyReductions > 0
      ) {
        const newConcurrency = Math.min(3, currentConcurrency + 1);
        this.concurrencyLimiter = new ConcurrencyLimiter(
          newConcurrency,
          this.logger,
        );
        adaptiveAdjustments.concurrencyReductions = Math.max(
          0,
          adaptiveAdjustments.concurrencyReductions - 1,
        );

        this.logger.info("性能改善，恢復並發數", {
          oldConcurrency: currentConcurrency,
          newConcurrency,
          trendConfidence: Math.round(trendConfidence * 100),
        });
      }
    }

    // 定期重置調整計數器（防止過度調整）
    if (this.responseTimeStats.totalRequests % 50 === 0) {
      if (adaptiveAdjustments.timeoutIncreases > 0) {
        adaptiveAdjustments.timeoutIncreases = Math.max(
          0,
          adaptiveAdjustments.timeoutIncreases - 1,
        );
      }
      if (adaptiveAdjustments.domainSwitches > 0) {
        adaptiveAdjustments.domainSwitches = Math.max(
          0,
          adaptiveAdjustments.domainSwitches - 1,
        );
      }
    }
  }

  /**
   * 獲取自適應超時建議
   */
  private getAdaptiveTimeout(): number {
    if (this.responseTimeStats.totalRequests < 3) {
      return this.defaultTimeout;
    }

    const avgResponseTime = this.responseTimeStats.averageResponseTime;
    const trend = this.responseTimeStats.responseTrend;
    const errorRate = this.calculateErrorRate();

    let adaptiveTimeout = Math.max(
      avgResponseTime * 2.2,
      this.defaultTimeout * 0.7,
    ); // 更激進的底線

    // 根據網絡性能趨勢調整
    if (trend === "degrading") {
      adaptiveTimeout *= 1.3; // 性能下降時更寬鬆的超時
    } else if (trend === "improving") {
      adaptiveTimeout *= 0.85; // 性能改善時更積極的超時
    }

    // 根據錯誤率調整
    if (errorRate > 0.3) {
      adaptiveTimeout *= 1.4; // 高錯誤率時增加容忍度
    } else if (errorRate < 0.1) {
      adaptiveTimeout *= 0.9; // 低錯誤率時提高效率
    }

    // 根據CAPTCHA事件調整
    if (this.performanceBreakdown.captchaEvents > 0) {
      adaptiveTimeout *= 1.2; // CAPTCHA事件時需要更多時間
    }

    return Math.min(adaptiveTimeout, this.defaultTimeout * 2.2);
  }

  /**
   * 計算當前錯誤率
   */
  private calculateErrorRate(): number {
    const totalErrors = Object.values(
      this.performanceBreakdown.errorBreakdown,
    ).reduce((sum, count) => sum + count, 0);
    const totalRequests = this.responseTimeStats.totalRequests;

    return totalRequests > 0 ? totalErrors / totalRequests : 0;
  }

  /**
   * 獲取自適應並發數建議
   */
  getAdaptiveConcurrency(): number {
    const errorRate = this.calculateErrorRate();
    const avgResponseTime = this.responseTimeStats.averageResponseTime;
    const baseConcurrency = this.concurrencyLimiter.maxConcurrency;

    if (errorRate > 0.6) {
      return Math.max(1, Math.floor(baseConcurrency * 0.4)); // 極高錯誤率時大幅降低
    } else if (errorRate > 0.4) {
      return Math.max(1, Math.floor(baseConcurrency * 0.6)); // 高錯誤率時中幅降低
    } else if (errorRate > 0.2) {
      return Math.max(2, Math.floor(baseConcurrency * 0.8)); // 中等錯誤率時輕微降低
    }

    if (
      errorRate < 0.05 &&
      avgResponseTime < this.defaultTimeout * 0.3 &&
      this.responseTimeStats.totalRequests > 20
    ) {
      return Math.min(baseConcurrency + 1, 3);
    }

    // CAPTCHA或超時事件時降低並發數
    if (
      this.performanceBreakdown.captchaEvents > 0 ||
      this.performanceBreakdown.errorBreakdown.timeouts > 1
    ) {
      return Math.max(1, Math.floor(baseConcurrency * 0.7));
    }

    return baseConcurrency; // 默認保持現有設定
  }

  /**
   * 解析搜索結果 HTML
   */
  private async parseResults(
    html: string,
    maxResults: number = 10,
  ): Promise<SearchResult[]> {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const results: SearchResult[] = [];

    try {
      // 學習g-search-mcp的多重選擇器策略
      const resultSelectors = [
        // DuckDuckGo主要選擇器組合
        {
          container: ".result",
          title: ".result__title a",
          snippet: ".result__snippet",
          url: ".result__title a",
        },
        {
          container: ".links_deep",
          title: ".result__a",
          snippet: ".result__snippet",
          url: ".result__a",
        },
        {
          container: ".web-result",
          title: "h2 a",
          snippet: ".web-result__snippet",
          url: "h2 a",
        },
        {
          container: ".result.result--url-above-snippet",
          title: ".result__title a",
          snippet: ".result__snippet",
          url: ".result__title a",
        },
        {
          container: ".results_links",
          title: ".links_main a",
          snippet: ".snippet",
          url: ".links_main a",
        },

        // 備用選擇器組合
        {
          container: ".result__body",
          title: "a",
          snippet: ".snippet",
          url: "a",
        },
        {
          container: ".serp__results .result",
          title: "h2 a",
          snippet: ".description",
          url: "h2 a",
        },
        { container: ".zci-wrapper", title: "a", snippet: ".text", url: "a" },
        {
          container: ".results .result",
          title: "a.result__a",
          snippet: ".result__snippet",
          url: "a.result__a",
        },

        // 通用備用選擇器
        {
          container: 'div[class*="result"]',
          title: "a",
          snippet: "span, div, p",
          url: "a",
        },
        { container: "article", title: "a", snippet: "p, span", url: "a" },
      ];

      let resultElements: NodeListOf<Element> | null = null;
      let successfulSelector: (typeof resultSelectors)[0] | null = null;

      // 嘗試每個選擇器組合
      for (const selector of resultSelectors) {
        const elements = document.querySelectorAll(selector.container);
        if (elements.length > 0) {
          resultElements = elements;
          successfulSelector = selector;
          this.logger.debug("成功選擇器", {
            selector: selector.container,
            elementsFound: elements.length,
          });
          break;
        }
      }

      if (!resultElements || !successfulSelector) {
        // 如果所有選擇器都失敗，使用通用方法
        return this.fallbackParseResults(document, maxResults);
      }

      // 使用新的結構化選擇器方法提取結果
      const resultPromises = Array.from(resultElements)
        .slice(0, maxResults)
        .map(async (element, index) => {
          try {
            return await this.extractResultWithSelectors(
              element,
              successfulSelector,
            );
          } catch (error) {
            this.logger.warn(`解析第 ${index + 1} 個結果時發生錯誤:`, {
              error: getErrorMessage(error),
              selector: successfulSelector.container,
            });
            return null;
          }
        });

      const extractedResults = await Promise.all(resultPromises);
      results.push(...extractedResults.filter((result) => result !== null));

      // 如果沒有找到結果，嘗試其他解析方法
      if (results.length === 0) {
        return this.fallbackParseResults(document, maxResults);
      }

      // 根據請求的數量限制結果
      return results.slice(0, maxResults);
    } catch (error) {
      this.performanceBreakdown.errorBreakdown.parseErrors++;
      throw new SearchError(
        `HTML 解析失敗: ${getErrorMessage(error)}`,
        "PARSE_ERROR",
      );
    }
  }

  /**
   * 使用結構化選擇器從元素提取結果（學習g-search-mcp策略）
   */
  private async extractResultWithSelectors(
    element: Element,
    selectors: { title: string; snippet: string; url: string },
  ): Promise<SearchResult | null> {
    try {
      // 提取標題和連結
      const titleElement = element.querySelector(selectors.title);
      const urlElement = element.querySelector(selectors.url);

      if (!titleElement || !urlElement) {
        return null;
      }

      const title = titleElement.textContent?.trim() || "";
      const url = (urlElement as HTMLAnchorElement)?.href || "";

      if (!title || !url) {
        return null;
      }

      // 提取摘要 - 支援多重選擇器
      let snippet = "";
      const snippetSelectors = selectors.snippet
        .split(",")
        .map((s) => s.trim());

      for (const snippetSelector of snippetSelectors) {
        const snippetElement = element.querySelector(snippetSelector);
        if (snippetElement) {
          snippet = snippetElement.textContent?.trim() || "";
          if (snippet) {
            break;
          }
        }
      }

      // 如果沒找到摘要，嘗試從父元素獲取
      if (!snippet) {
        const parentText = element.textContent?.trim() || "";
        // 移除標題文字，獲取剩餘內容作為摘要
        const cleanText = parentText.replace(title, "").trim();
        snippet = cleanText.substring(0, 200); // 限制摘要長度
      }

      // 處理DuckDuckGo的重定向URL
      const cleanUrl = this.cleanDuckDuckGoUrl(url);

      const result: SearchResult = {
        title,
        url: cleanUrl,
        snippet: snippet || "無摘要內容",
        source: "duckduckgo",
      };

      // 嘗試提取發布日期
      // 注意：DuckDuckGo HTML 版本通常不提供日期資訊，此邏輯主要作為備用
      const dateSelectors = [
        ".result__timestamp",
        ".result-date",
        "time",
        ".published-date",
      ];

      this.logger.debug("檢查 DuckDuckGo 結果中的日期選擇器", {
        url: cleanUrl,
        selectors: dateSelectors,
      });

      for (const selector of dateSelectors) {
        const dateElement = element.querySelector(selector);
        if (dateElement && dateElement.textContent) {
          result.publishedDate = this.cleanText(dateElement.textContent);
          this.logger.debug("從 DuckDuckGo 結果提取到日期", {
            url: cleanUrl,
            selector,
            date: result.publishedDate,
          });
          break;
        }
      }

      this.logger.debug("DuckDuckGo 日期檢查完成", {
        url: cleanUrl,
        foundDate: !!result.publishedDate,
      });

      // 如果從 DuckDuckGo 結果中未找到日期，嘗試從原始網頁提取
      if ((!result.publishedDate || !result.modifiedDate) && cleanUrl) {
        try {
          this.logger.debug("嘗試從原始網頁提取日期", { url: cleanUrl });
          const extractedDateInfo = await this.extractDateFromUrl(cleanUrl);

          if (extractedDateInfo.publishedDate && !result.publishedDate) {
            result.publishedDate = extractedDateInfo.publishedDate;
            this.logger.debug("成功提取並設定發布日期", {
              url: cleanUrl,
              publishedDate: extractedDateInfo.publishedDate,
            });
          }

          if (extractedDateInfo.modifiedDate && !result.modifiedDate) {
            result.modifiedDate = extractedDateInfo.modifiedDate;
            this.logger.debug("成功提取並設定修改日期", {
              url: cleanUrl,
              modifiedDate: extractedDateInfo.modifiedDate,
            });
          }
        } catch (error) {
          // 增加錯誤日誌但不影響主要功能
          this.logger.debug("日期提取過程發生錯誤", {
            url: cleanUrl,
            error: getErrorMessage(error),
          });
        }
      }

      this.logger.debug("成功提取結果", {
        title: title.substring(0, 50),
        url: cleanUrl.substring(0, 80),
        snippetLength: snippet.length,
        selector: selectors.title,
        hasPublishedDate: !!result.publishedDate,
        hasModifiedDate: !!result.modifiedDate,
      });

      return result;
    } catch (error) {
      this.logger.warn("選擇器提取失敗", {
        error: error instanceof Error ? error.message : String(error),
        selectors,
      });
      return null;
    }
  }

  /**
   * 清理DuckDuckGo重定向URL
   */
  private cleanDuckDuckGoUrl(url: string): string {
    try {
      // 處理DuckDuckGo的重定向格式: /l/?uddg=https%3A//example.com
      if (url.includes("/l/?uddg=")) {
        const urlParams = new URLSearchParams(url.split("?")[1]);
        const actualUrl = urlParams.get("uddg");
        if (actualUrl) {
          return decodeURIComponent(actualUrl);
        }
      }

      // 處理其他可能的重定向格式
      if (url.includes("/l/?kh=-1&uddg=")) {
        const match = url.match(/uddg=([^&]+)/);
        if (match) {
          return decodeURIComponent(match[1]);
        }
      }

      return url;
    } catch (error) {
      this.logger.warn("URL清理失敗", {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
      return url;
    }
  }

  /**
   * 從 DOM 元素提取結果（傳統方法，保留作為備用）
   */
  private async extractResultFromElement(
    element: Element,
  ): Promise<SearchResult | null> {
    // 基於實際 DuckDuckGo HTML 結構的標題選擇器
    const titleSelectors = [
      ".result__title a", // DuckDuckGo 主要標題選擇器
      ".js-result-title-link", // JavaScript 標題連結
      ".result__a", // 備用選擇器
      "h2 a", // 通用標題連結
      "h3 a", // 通用標題連結
      ".result-title a", // 備用格式
      'a[data-testid="result-title-a"]', // 測試屬性
    ];

    let titleElement: Element | null = null;
    for (const selector of titleSelectors) {
      titleElement = element.querySelector(selector);
      if (titleElement) {
        break;
      }
    }

    // 基於實際 DuckDuckGo HTML 結構的摘要選擇器
    const snippetSelectors = [
      ".result__snippet", // DuckDuckGo 主要摘要選擇器
      ".js-result-snippet", // JavaScript 摘要
      ".result__body", // 備用選擇器
      ".result-snippet", // 備用格式
      'span[data-testid="result-snippet"]', // 測試屬性
      ".snippet", // 通用選擇器
    ];

    let snippetElement: Element | null = null;
    for (const selector of snippetSelectors) {
      snippetElement = element.querySelector(selector);
      if (snippetElement) {
        break;
      }
    }

    if (!titleElement || !snippetElement) {
      return null;
    }

    const title = this.cleanText(titleElement.textContent || "");
    const url = this.extractUrl(titleElement.getAttribute("href") || "");
    const snippet = this.cleanText(snippetElement.textContent || "");

    if (!title || !url || !snippet) {
      return null;
    }

    const result: SearchResult = {
      title,
      url,
      snippet,
    };

    // 嘗試提取發布日期
    // 注意：DuckDuckGo HTML 版本通常不提供日期資訊，此邏輯主要作為備用
    const dateSelectors = [
      ".result__timestamp",
      ".result-date",
      "time",
      ".published-date",
    ];

    this.logger.debug("檢查 DuckDuckGo 結果中的日期選擇器", {
      url,
      selectors: dateSelectors,
    });

    for (const selector of dateSelectors) {
      const dateElement = element.querySelector(selector);
      if (dateElement && dateElement.textContent) {
        result.publishedDate = this.cleanText(dateElement.textContent);
        this.logger.debug("從 DuckDuckGo 結果提取到日期", {
          url,
          selector,
          date: result.publishedDate,
        });
        break;
      }
    }

    this.logger.debug("DuckDuckGo 日期檢查完成", {
      url,
      foundDate: !!result.publishedDate,
    });

    // 如果從 DuckDuckGo 結果中未找到日期，嘗試從原始網頁提取
    if ((!result.publishedDate || !result.modifiedDate) && url) {
      try {
        this.logger.debug("嘗試從原始網頁提取日期", { url });
        const extractedDateInfo = await this.extractDateFromUrl(url);

        if (extractedDateInfo.publishedDate && !result.publishedDate) {
          result.publishedDate = extractedDateInfo.publishedDate;
          this.logger.debug("成功提取並設定發布日期", {
            url,
            publishedDate: extractedDateInfo.publishedDate,
          });
        }

        if (extractedDateInfo.modifiedDate && !result.modifiedDate) {
          result.modifiedDate = extractedDateInfo.modifiedDate;
          this.logger.debug("成功提取並設定修改日期", {
            url,
            modifiedDate: extractedDateInfo.modifiedDate,
          });
        }
      } catch (error) {
        // 增加錯誤日誌但不影響主要功能
        this.logger.debug("日期提取過程發生錯誤", {
          url,
          error: getErrorMessage(error),
        });
      }
    }

    return result;
  }

  /**
   * 批量並行搜索 - 支援智能並發控制
   */
  async batchSearch(
    queries: string[],
    options: SearchOptions = {},
  ): Promise<BatchSearchResult[]> {
    const adaptiveConcurrency = this.getAdaptiveConcurrency();
    const maxConcurrency = options.maxConcurrency || adaptiveConcurrency;
    const queryDelay = options.queryDelay || 2500;

    this.logger.info("開始批量搜索（性能優化版）", {
      queryCount: queries.length,
      maxConcurrency,
      adaptiveConcurrency,
      queryDelay,
      errorRate: Math.round(this.calculateErrorRate() * 100) + "%",
      adaptiveControl: true,
    });

    const startTime = Date.now();

    // 為此次批量搜索創建專用的並發控制器
    const batchLimiter = new ConcurrencyLimiter(maxConcurrency, this.logger);

    // 建立搜索任務（帶智能退避延遲控制）
    const searchTasks = queries.map((query, index) => ({
      task: async () => {
        // 添加查詢間延遲（除了第一個查詢）
        if (index > 0 && queryDelay > 0) {
          await this.delay(queryDelay);
        }

        const backoffDelay = batchLimiter.getBackoffDelay();
        if (backoffDelay > 0) {
          this.logger.debug("應用智能退避延遲", {
            delay: backoffDelay,
            query: query.substring(0, 30),
          });
          await this.delay(backoffDelay);
        }

        return this.executeSingleSearch(query, options, index);
      },
      name: `Search-${index + 1}: ${query.substring(0, 30)}${query.length > 30 ? "..." : ""}`,
      priority: "normal" as const,
    }));

    const batchTimeout =
      (options.timeout || this.defaultTimeout) * 1.5 +
      queryDelay * queries.length +
      10000;
    let timeoutCount = 0;

    const results = await batchLimiter.executeAll(searchTasks, {
      failFast: false,
      timeout: batchTimeout,
      onProgress: (completed, total, error) => {
        if (
          error &&
          (error.message.includes("timeout") ||
            error.message.includes("TIMEOUT"))
        ) {
          timeoutCount++;
        }

        this.logger.debug("批量搜索進度", {
          completed,
          total,
          percentage: Math.round((completed / total) * 100),
          hasError: !!error,
          errorType: error?.message.includes("timeout")
            ? "TIMEOUT"
            : error
              ? "OTHER"
              : "NONE",
          timeoutCount,
          estimatedRemaining:
            Math.round(((total - completed) * queryDelay) / 1000) + "s",
        });

        if (timeoutCount > total * 0.3) {
          this.logger.warn("批量搜索中檢測到過多超時錯誤", {
            timeoutCount,
            totalCompleted: completed,
            timeoutRate: Math.round((timeoutCount / completed) * 100) + "%",
          });
        }
      },
    });

    // 處理結果
    const batchResults: BatchSearchResult[] = results.map((result, index) => {
      if (result.success && result.result) {
        return result.result;
      } else {
        this.logger.warn("單個搜索失敗", {
          query: queries[index],
          taskName: result.taskName,
          error: result.error?.message || "未知錯誤",
        });

        return {
          query: queries[index],
          success: false,
          results: [],
          error: result.error?.message || "未知錯誤",
          duration: result.duration,
          index,
        };
      }
    });

    const totalDuration = Date.now() - startTime;
    const successCount = batchResults.filter((r) => r.success).length;
    const totalResults = batchResults.reduce(
      (sum, r) => sum + r.results.length,
      0,
    );

    // 智能降級機制：實時監控批量搜索結果
    const batchSuccessRate = successCount / queries.length;
    const averageBatchDuration = totalDuration / queries.length;

    this.performSmartDegradation(
      batchSuccessRate,
      averageBatchDuration,
      queries.length,
    );

    // 整合性能統計
    const performanceStats = this.getPerformanceStats();

    this.logger.info("批量搜索完成", {
      total: queries.length,
      success: successCount,
      failed: queries.length - successCount,
      totalDuration,
      averageDuration: Math.round(
        batchResults.reduce((sum, r) => sum + r.duration, 0) /
          batchResults.length,
      ),
      totalResults,
      // 新架構統計
      captchaFallbacks: this.fallbackToBrowser ? 1 : 0,
      browserPoolStats:
        "browserPool" in performanceStats ? performanceStats.browserPool : null,
      concurrencyStats: performanceStats.concurrency,
      networkPerformance: {
        averageResponseTime: performanceStats.searcher.averageResponseTime,
        trend: this.responseTimeStats.responseTrend,
      },
    });

    return batchResults;
  }

  /**
   * 執行單個搜索任務
   */
  private async executeSingleSearch(
    query: string,
    options: SearchOptions,
    index: number,
  ): Promise<BatchSearchResult> {
    const startTime = Date.now();

    try {
      const results = await this.search(query, {
        ...options,
        count: options.count || 5, // 批量搜索時預設減少每個查詢的結果數
      });

      const duration = Date.now() - startTime;

      this.logger.debug("單個搜索完成", {
        query: query.substring(0, 50),
        duration,
        resultCount: results.length,
      });

      return {
        query,
        success: true,
        results,
        duration,
        index,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger.warn("單個搜索失敗", {
        query: query.substring(0, 50),
        duration,
        error: (error as Error).message,
      });

      return {
        query,
        success: false,
        results: [],
        error: (error as Error).message,
        duration,
        index,
      };
    }
  }

  /**
   * 延遲執行工具方法
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 清理 URL 用於日誌記錄
   */
  private sanitizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
    } catch {
      return url.length > 100 ? url.substring(0, 100) + "..." : url;
    }
  }

  /**
   * 備用解析方法
   */
  private fallbackParseResults(
    document: Document,
    maxResults: number = 10,
  ): SearchResult[] {
    this.logger.warn("使用備用解析策略", { reason: "主要選擇器均失敗" });

    const results: SearchResult[] = [];
    const processedUrls = new Set<string>();

    // 學習g-search-mcp的策略：多階段備用解析
    const fallbackStrategies = [
      () => this.parseWithGenericSelectors(document, processedUrls),
      () => this.parseWithLinkAnalysis(document, processedUrls),
      () => this.parseWithTextPatterns(document, processedUrls),
      () => this.parseWithStructuralAnalysis(document, processedUrls),
    ];

    for (const strategy of fallbackStrategies) {
      try {
        const strategyResults = strategy();
        results.push(...strategyResults);

        if (results.length >= maxResults) {
          this.logger.info("備用解析成功", {
            resultsFound: results.length,
            strategy: strategy.name || "unknown",
          });
          break;
        }
      } catch (error) {
        this.logger.debug("備用策略失敗", {
          strategy: strategy.name || "unknown",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // 如果所有策略都失敗，記錄詳細錯誤信息
    if (results.length === 0) {
      this.logParsingFailureDetails(document);
    }

    return results.slice(0, maxResults);
  }

  /**
   * 使用通用選擇器解析
   */
  private parseWithGenericSelectors(
    document: Document,
    processedUrls: Set<string>,
  ): SearchResult[] {
    const results: SearchResult[] = [];

    // 通用的結果容器選擇器
    const genericContainers = [
      'div[class*="result"]',
      'div[class*="search"]',
      'li[class*="result"]',
      "article",
      "section",
    ];

    for (const containerSelector of genericContainers) {
      const containers = document.querySelectorAll(containerSelector);

      for (const container of containers) {
        const links = container.querySelectorAll('a[href^="http"]');

        for (const link of links) {
          const result = this.extractResultFromGenericContainer(
            link,
            container,
            processedUrls,
          );
          if (result) {
            results.push(result);
          }
        }
      }

      if (results.length > 0) {
        break;
      }
    }

    return results;
  }

  /**
   * 使用連結分析解析
   */
  private parseWithLinkAnalysis(
    document: Document,
    processedUrls: Set<string>,
  ): SearchResult[] {
    const results: SearchResult[] = [];

    // 查找所有外部連結，過濾DuckDuckGo內部連結
    const links = document.querySelectorAll('a[href^="http"]');

    Array.from(links).forEach((link) => {
      const href = link.getAttribute("href");
      const text = link.textContent?.trim();

      if (href && text && !processedUrls.has(href)) {
        // 過濾內部連結和無用連結
        if (this.isValidExternalLink(href)) {
          processedUrls.add(href);

          // 動態查找父元素獲取上下文
          const snippet = this.extractContextFromParents(link);

          if (text.length > 5 && snippet.length > 10) {
            results.push({
              title: this.cleanText(text),
              url: this.cleanDuckDuckGoUrl(href),
              snippet: this.cleanText(snippet.substring(0, 200)),
              source: "duckduckgo_fallback",
            });
          }
        }
      }
    });

    return results;
  }

  /**
   * 使用文字模式解析
   */
  private parseWithTextPatterns(
    document: Document,
    processedUrls: Set<string>,
  ): SearchResult[] {
    const results: SearchResult[] = [];

    // 查找包含URL模式的文字
    const textNodes = this.getTextNodesWithUrls(document);

    for (const node of textNodes) {
      const urlMatches = node.textContent?.match(/https?:\/\/[^\s]+/g);
      if (urlMatches) {
        for (const url of urlMatches) {
          if (!processedUrls.has(url) && this.isValidExternalLink(url)) {
            processedUrls.add(url);

            const context = node.textContent || "";
            const title = this.extractTitleFromContext(context, url);
            const snippet = context.replace(url, "").trim();

            if (title && snippet) {
              results.push({
                title: this.cleanText(title),
                url: this.cleanDuckDuckGoUrl(url),
                snippet: this.cleanText(snippet.substring(0, 200)),
                source: "duckduckgo_text_pattern",
              });
            }
          }
        }
      }
    }

    return results;
  }

  /**
   * 使用結構分析解析
   */
  private parseWithStructuralAnalysis(
    document: Document,
    processedUrls: Set<string>,
  ): SearchResult[] {
    const results: SearchResult[] = [];

    // 分析DOM結構，查找可能的結果模式
    const potentialContainers = document.querySelectorAll(
      "div, li, section, article",
    );

    for (const container of potentialContainers) {
      const links = container.querySelectorAll('a[href^="http"]');
      const texts = container.querySelectorAll("p, span, div");

      if (links.length === 1 && texts.length >= 1) {
        const link = links[0];
        const href = link.getAttribute("href");

        if (
          href &&
          !processedUrls.has(href) &&
          this.isValidExternalLink(href)
        ) {
          processedUrls.add(href);

          const title = link.textContent?.trim() || "";
          const snippetText = Array.from(texts)
            .map((t) => t.textContent?.trim())
            .filter((t) => t && t !== title)
            .join(" ");

          if (title.length > 5 && snippetText.length > 10) {
            results.push({
              title: this.cleanText(title),
              url: this.cleanDuckDuckGoUrl(href),
              snippet: this.cleanText(snippetText.substring(0, 200)),
              source: "duckduckgo_structural",
            });
          }
        }
      }
    }

    return results;
  }

  /**
   * 輔助方法：檢查是否為有效外部連結
   */
  private isValidExternalLink(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.toLowerCase();

      // 排除DuckDuckGo和常見的無用連結
      const excludedDomains = [
        "duckduckgo.com",
        "start.duckduckgo.com",
        "help.duckduckgo.com",
        "spreadprivacy.com",
      ];

      return !excludedDomains.some((excluded) => domain.includes(excluded));
    } catch {
      return false;
    }
  }

  /**
   * 輔助方法：從父元素提取上下文
   */
  private extractContextFromParents(element: Element): string {
    let context = "";
    let parent = element.parentElement;

    for (let i = 0; i < 3 && parent; i++) {
      const text = parent.textContent?.trim() || "";
      if (
        text.length > context.length &&
        text !== element.textContent?.trim()
      ) {
        context = text;
      }
      parent = parent.parentElement;
    }

    return context;
  }

  /**
   * 輔助方法：獲取包含URL的文字節點
   */
  private getTextNodesWithUrls(document: Document): Text[] {
    const walker = document.createTreeWalker(
      document.body,
      document.defaultView!.NodeFilter.SHOW_TEXT,
    );

    const textNodes: Text[] = [];
    let node;

    while ((node = walker.nextNode())) {
      if (node.textContent && /https?:\/\//.test(node.textContent)) {
        textNodes.push(node as Text);
      }
    }

    return textNodes;
  }

  /**
   * 輔助方法：從上下文提取標題
   */
  private extractTitleFromContext(context: string, url: string): string {
    // 移除URL，查找可能的標題
    const withoutUrl = context.replace(url, "").trim();
    const sentences = withoutUrl.split(/[.!?]/).map((s) => s.trim());

    // 選擇最短但有意義的句子作為標題
    const titles = sentences.filter((s) => s.length > 10 && s.length < 100);
    return titles[0] || withoutUrl.substring(0, 50);
  }

  /**
   * 輔助方法：從通用容器提取結果
   */
  private extractResultFromGenericContainer(
    link: Element,
    container: Element,
    processedUrls: Set<string>,
  ): SearchResult | null {
    const href = link.getAttribute("href");
    const title = link.textContent?.trim();

    if (
      !href ||
      !title ||
      processedUrls.has(href) ||
      !this.isValidExternalLink(href)
    ) {
      return null;
    }

    processedUrls.add(href);

    const containerText = container.textContent || "";
    const snippet = containerText.replace(title, "").trim();

    if (title.length > 5 && snippet.length > 10) {
      return {
        title: this.cleanText(title),
        url: this.cleanDuckDuckGoUrl(href),
        snippet: this.cleanText(snippet.substring(0, 200)),
        source: "duckduckgo_generic",
      };
    }

    return null;
  }

  /**
   * 記錄解析失敗詳情
   */
  private logParsingFailureDetails(document: Document): void {
    const bodyLength = document.body?.textContent?.length || 0;
    const linkCount = document.querySelectorAll("a").length;
    const divCount = document.querySelectorAll("div").length;

    this.logger.error("所有解析策略都失敗", undefined, {
      bodyLength,
      linkCount,
      divCount,
      title: document.title,
      hasSearchForm: !!document.querySelector(
        'form[role="search"], form input[name="q"]',
      ),
      possibleCaptcha:
        document.body?.textContent?.toLowerCase().includes("captcha") || false,
    });
  }

  /**
   * 從原始網頁 URL 提取發布日期
   */
  private async extractDateFromUrl(url: string): Promise<ExtractedDateInfo> {
    try {
      // 設置較短的超時時間避免影響整體搜索性能
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 秒超時

      const response = await fetch(url, {
        headers: {
          "User-Agent": this.getRandomUserAgent(),
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        this.logger.debug(`日期提取失敗 - HTTP ${response.status}`, { url });
        return {};
      }

      const html = await response.text();
      const extractedDateInfo = this.extractStructuredDate(html);

      if (extractedDateInfo.publishedDate || extractedDateInfo.modifiedDate) {
        this.logger.debug("成功提取日期", {
          url,
          publishedDate: extractedDateInfo.publishedDate,
          modifiedDate: extractedDateInfo.modifiedDate,
        });
      } else {
        this.logger.debug("未能從網頁提取日期", { url });
      }

      return extractedDateInfo;
    } catch (error) {
      // 改為有日誌的失敗處理，但仍不影響主要搜索功能
      this.logger.debug("日期提取異常", { url, error: getErrorMessage(error) });
      return {};
    }
  }

  /**
   * 從 HTML 中提取結構化日期資料
   */
  private extractStructuredDate(html: string): ExtractedDateInfo {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const result: ExtractedDateInfo = {};

    // 1. 檢查 meta 標籤 - 分別處理修改日期和發布日期
    const modifiedSelectors = [
      'meta[itemprop="dateModified"]',
      'meta[property="article:modified_time"]',
      'meta[name="article:modified_time"]',
      'meta[property="og:updated_time"]',
    ];

    const publishedSelectors = [
      'meta[itemprop="datePublished"]',
      'meta[property="article:published_time"]',
      'meta[name="article:published_time"]',
      'meta[name="publishdate"]',
      'meta[name="date"]',
      'meta[property="og:published_time"]',
    ];

    // 提取修改日期
    for (const selector of modifiedSelectors) {
      const metaElement = document.querySelector(selector);
      if (metaElement) {
        const content = metaElement.getAttribute("content");
        if (content) {
          const cleanDate = content.trim();
          if (cleanDate) {
            result.modifiedDate = cleanDate;
            break;
          }
        }
      }
    }

    // 提取發布日期
    for (const selector of publishedSelectors) {
      const metaElement = document.querySelector(selector);
      if (metaElement) {
        const content = metaElement.getAttribute("content");
        if (content) {
          const cleanDate = content.trim();
          if (cleanDate) {
            result.publishedDate = cleanDate;
            break;
          }
        }
      }
    }

    // 2. 檢查 JSON-LD 結構化資料
    const scriptElements = document.querySelectorAll(
      'script[type="application/ld+json"]',
    );
    for (const script of scriptElements) {
      try {
        const jsonData = JSON.parse(script.textContent || "");
        const dateInfo = this.extractDateFromJsonLd(jsonData);

        // 如果還沒有相應的日期，則設定它們
        if (dateInfo.modifiedDate && !result.modifiedDate) {
          result.modifiedDate = dateInfo.modifiedDate;
        }
        if (dateInfo.publishedDate && !result.publishedDate) {
          result.publishedDate = dateInfo.publishedDate;
        }

        // 如果兩個日期都找到了，就停止搜索
        if (result.modifiedDate && result.publishedDate) {
          break;
        }
      } catch {
        // 忽略 JSON 解析錯誤
      }
    }

    // 3. 檢查 time 元素作為備用
    if (!result.publishedDate && !result.modifiedDate) {
      const timeElement = document.querySelector("time[datetime]");
      if (timeElement) {
        const datetime = timeElement.getAttribute("datetime");
        if (datetime) {
          const cleanDate = datetime.trim();
          if (cleanDate) {
            // 如果不確定是哪種日期，優先當作發布日期
            result.publishedDate = cleanDate;
          }
        }
      }
    }

    return result;
  }

  /**
   * 從 JSON-LD 資料中提取日期
   */
  private extractDateFromJsonLd(jsonData: any): ExtractedDateInfo {
    const result: ExtractedDateInfo = {};

    if (!jsonData) {
      return result;
    }

    // 處理陣列格式的 JSON-LD
    if (Array.isArray(jsonData)) {
      for (const item of jsonData) {
        const dateInfo = this.extractDateFromJsonLd(item);
        // 合併結果，優先保留已找到的日期
        if (dateInfo.modifiedDate && !result.modifiedDate) {
          result.modifiedDate = dateInfo.modifiedDate;
        }
        if (dateInfo.publishedDate && !result.publishedDate) {
          result.publishedDate = dateInfo.publishedDate;
        }

        // 如果兩個日期都找到了，就停止搜索
        if (result.modifiedDate && result.publishedDate) {
          break;
        }
      }
      return result;
    }

    // 檢查修改日期欄位
    const modifiedFields = ["dateModified"];
    for (const field of modifiedFields) {
      if (jsonData[field] && !result.modifiedDate) {
        result.modifiedDate = jsonData[field];
        break;
      }
    }

    // 檢查發布日期欄位
    const publishedFields = [
      "datePublished",
      "dateCreated",
      "publishDate",
      "uploadDate",
    ];
    for (const field of publishedFields) {
      if (jsonData[field] && !result.publishedDate) {
        result.publishedDate = jsonData[field];
        break;
      }
    }

    // 檢查嵌套的對象
    if (jsonData["@graph"] && (!result.modifiedDate || !result.publishedDate)) {
      const nestedInfo = this.extractDateFromJsonLd(jsonData["@graph"]);
      if (nestedInfo.modifiedDate && !result.modifiedDate) {
        result.modifiedDate = nestedInfo.modifiedDate;
      }
      if (nestedInfo.publishedDate && !result.publishedDate) {
        result.publishedDate = nestedInfo.publishedDate;
      }
    }

    return result;
  }


  /**
   * 清理文本內容
   */
  private cleanText(text: string): string {
    return text.replace(/\s+/g, " ").replace(/\n/g, " ").trim();
  }

  /**
   * 提取真實 URL
   */
  private extractUrl(href: string): string {
    if (!href) {
      return "";
    }

    // DuckDuckGo 使用重定向 URL，需要提取真實 URL
    // 處理完整重定向 URL: https://duckduckgo.com/l/?uddg=...
    // 或相對重定向 URL: /l/?uddg=...
    if (href.includes("/l/?uddg=") || href.includes("uddg=")) {
      try {
        let url: URL;
        if (href.startsWith("http")) {
          url = new URL(href);
        } else {
          url = new URL(href, this.getCurrentDomain());
        }

        const actualUrl = url.searchParams.get("uddg");
        if (actualUrl) {
          return decodeURIComponent(actualUrl);
        }
      } catch {
        // 如果解析失敗，返回原始連結
      }
    }

    // 處理相對 URL
    if (href.startsWith("/")) {
      return new URL(href, this.getCurrentDomain()).toString();
    }

    return href;
  }

  /**
   * 驗證搜索選項
   */
  static validateSearchOptions(options: SearchOptions): void {
    if (options.count !== undefined) {
      if (options.count < 1 || options.count > 50) {
        throw new SearchError("結果數量必須在 1-50 之間");
      }
    }

    // 移除 offset 驗證（已棄用分頁功能）

    if (options.safeSearch !== undefined) {
      const validOptions = ["strict", "moderate", "off"];
      if (!validOptions.includes(options.safeSearch)) {
        throw new SearchError("安全搜索選項無效");
      }
    }

    if (options.timeRange !== undefined) {
      const validOptions = ["day", "week", "month", "year"];
      if (!validOptions.includes(options.timeRange)) {
        throw new SearchError("時間範圍選項無效");
      }
    }
  }

  /**
   * 智能降級機制：根據實時性能自動調整參數
   */
  private performSmartDegradation(
    successRate: number,
    averageDuration: number,
    batchSize: number,
  ): void {
    const currentErrorRate = this.calculateErrorRate();
    const avgResponseTime = this.responseTimeStats.averageResponseTime;

    this.logger.debug("智能降級監控", {
      batchSuccessRate: Math.round(successRate * 100) + "%",
      currentErrorRate: Math.round(currentErrorRate * 100) + "%",
      averageDuration: Math.round(averageDuration),
      avgResponseTime: Math.round(avgResponseTime),
      batchSize,
    });

    // 緊急降級：成功率過低時
    if (successRate < 0.6) {
      this.logger.warn("檢測到低成功率，觸發緊急降級機制", {
        successRate: Math.round(successRate * 100) + "%",
        action: "reducing_concurrency_to_1",
      });

      // 強制降低並發數到1
      this.concurrencyLimiter = new ConcurrencyLimiter(1, this.logger);

      // 增加查詢延遲
      if (averageDuration > this.defaultTimeout * 0.8) {
        this.logger.warn("響應時間過長，建議增加查詢延遲到5秒");
      }
    }
    // 警告降級：成功率中等偏低時
    else if (successRate < 0.8) {
      this.logger.warn("檢測到中等成功率，觸發適度降級", {
        successRate: Math.round(successRate * 100) + "%",
        action: "reducing_concurrency",
      });

      // 適度降低並發數
      const currentMax = this.concurrencyLimiter.maxConcurrency;
      const newMax = Math.max(1, Math.floor(currentMax * 0.7));
      this.concurrencyLimiter = new ConcurrencyLimiter(newMax, this.logger);
    }

    // 響應時間過長的自動調整
    if (avgResponseTime > this.defaultTimeout * 0.7) {
      this.logger.warn("響應時間過長，啟動保護機制", {
        avgResponseTime: Math.round(avgResponseTime),
        threshold: Math.round(this.defaultTimeout * 0.7),
        recommendation: "建議增加查詢延遲或降低並發數",
      });
    }

    // 定期重置降級狀態（每100次請求後評估恢復）
    if (
      this.responseTimeStats.totalRequests % 100 === 0 &&
      this.responseTimeStats.totalRequests > 0
    ) {
      const recentErrorRate = this.calculateErrorRate();
      if (
        recentErrorRate < 0.1 &&
        avgResponseTime < this.defaultTimeout * 0.5
      ) {
        this.logger.info("系統穩定，考慮恢復正常並發數", {
          recentErrorRate: Math.round(recentErrorRate * 100) + "%",
          avgResponseTime: Math.round(avgResponseTime),
        });
      }
    }
  }
}
