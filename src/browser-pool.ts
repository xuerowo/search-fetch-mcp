import { Browser, BrowserContext, Page } from "playwright";
import { BrowserService } from "./browser-service.js";
import { Logger } from "./logger.js";
import { PlaywrightOptions } from "./types.js";
import fs from "fs";
import path from "path";
import os from "os";

/**
 * 瀏覽器池管理器
 */
export class BrowserPool {
  private singleBrowser: Browser | null = null;
  private contexts: Map<string, BrowserContext> = new Map();
  private activeTabs: Set<Page> = new Set();
  private readonly maxTabs: number;
  private readonly maxIdleTime: number;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private logger: Logger;
  private browserService: BrowserService;
  private totalTabsCreated: number = 0;
  private totalTabsClosed: number = 0;
  private isHeadless: boolean = true;
  private enableStatePersistence: boolean = true;
  private stateFile: string | null = null;

  // 優化增強：智能標籤頁管理
  private prewarmedTabs: Page[] = [];
  private tabUsageStats: Map<Page, TabUsageStats> = new Map();
  private isPrewarmingEnabled: boolean = true;

  constructor(
    maxTabs: number = 4,
    maxIdleTime: number = 300000,
    options: PlaywrightOptions & {
      enableStatePersistence?: boolean;
      stateFile?: string;
      enablePrewarming?: boolean;
    } = {},
    logger?: Logger,
  ) {
    this.maxTabs = maxTabs;
    this.maxIdleTime = maxIdleTime;
    this.isHeadless = options.headless !== false;
    this.enableStatePersistence = options.enableStatePersistence !== false;
    this.stateFile =
      options.stateFile ||
      (this.enableStatePersistence
        ? path.join(os.tmpdir(), "search-fetch-mcp-browser-state.json")
        : null);
    this.logger = logger || new Logger({ level: "info", logQueries: false });
    this.isPrewarmingEnabled = options.enablePrewarming === true;
    this.browserService = new BrowserService(options, this.logger);

    this.logger.info(`瀏覽器池初始化 - 單一實例架構`, {
      maxTabs,
      isHeadless: this.isHeadless,
      maxIdleTime: Math.round(maxIdleTime / 1000) + "s",
      enableStatePersistence: this.enableStatePersistence,
      stateFile: this.stateFile,
    });

    this.startCleanupTimer();

    // 啟動預熱機制
    if (this.isPrewarmingEnabled) {
      this.startTabPrewarming();
    }
  }

  async getSingleBrowser(): Promise<Browser> {
    if (!this.singleBrowser || !this.singleBrowser.isConnected()) {
      await this.createSingleBrowser();
    }

    return this.singleBrowser!;
  }

  async createTab(contextId?: string): Promise<ManagedTab> {
    // 優先使用預熱的標籤頁
    const prewarmedTab = await this.getPrewarmedTab(contextId);
    if (prewarmedTab) {
      return prewarmedTab;
    }

    const browser = await this.getSingleBrowser();

    // 檢查是否達到最大標籤頁數
    if (this.activeTabs.size >= this.maxTabs) {
      await this.waitForAvailableTab();
    }

    try {
      // 獲取或創建上下文
      const context = await this.getOrCreateContext(browser, contextId);
      const page = await context.newPage();

      this.activeTabs.add(page);
      this.totalTabsCreated++;

      // 初始化使用統計
      this.initTabUsageStats(page);


      return {
        page,
        context,
        contextId: contextId || "default",
        createdAt: Date.now(),
        release: async () => {
          await this.releaseTab(page);
        },
      };
    } catch (error) {
      this.logger.error("創建標籤頁失敗", error as Error);
      throw error;
    }
  }

  /**
   * 智能CAPTCHA處理 - 動態切換headless模式
   */
  async handleCaptcha(): Promise<void> {
    if (this.isHeadless) {
      this.logger.warn("檢測到CAPTCHA，切換到非headless模式");

      // 關閉當前headless瀏覽器
      if (this.singleBrowser) {
        await this.cleanup();
      }

      // 重新創建非headless瀏覽器
      this.isHeadless = false;
      await this.createSingleBrowser();
    }
  }

  /**
   * 批量創建標籤頁（並行處理）
   */
  async createTabs(
    count: number,
    contextPrefix?: string,
  ): Promise<ManagedTab[]> {

    const tabs: ManagedTab[] = [];

    try {
      // 並行創建所有標籤頁
      const tabPromises = Array.from({ length: count }, (_, i) => {
        const contextId = contextPrefix
          ? `${contextPrefix}-${i}`
          : `batch-${i}`;
        return this.createTab(contextId);
      });

      const createdTabs = await Promise.all(tabPromises);
      tabs.push(...createdTabs);

      this.logger.info(`批量標籤頁創建完成`, {
        count: tabs.length,
        activeTabs: this.activeTabs.size,
      });

      return tabs;
    } catch (error) {
      // 如果有錯誤，清理已創建的標籤頁
      await Promise.all(
        tabs.map((tab) =>
          tab.release().catch((err) => this.logger.warn("標籤頁清理失敗", err)),
        ),
      );

      throw error;
    }
  }

  /**
   * 創建單一瀏覽器實例
   */
  private async createSingleBrowser(): Promise<void> {
    this.logger.info(`創建單一瀏覽器實例`, { headless: this.isHeadless });

    // 如果已存在，先清理
    if (this.singleBrowser) {
      await this.cleanup();
    }

    this.singleBrowser = await this.browserService.createBrowser({
      headless: this.isHeadless,
      // 反檢測參數
      args: [
        "--disable-blink-features=AutomationControlled",
        "--disable-features=IsolateOrigins,site-per-process",
        "--disable-site-isolation-trials",
        "--disable-web-security",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
        "--hide-scrollbars",
        "--mute-audio",
        "--disable-background-networking",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-breakpad",
        "--disable-component-extensions-with-background-pages",
        "--disable-extensions",
        "--disable-features=TranslateUI",
        "--disable-ipc-flooding-protection",
        "--disable-renderer-backgrounding",
        "--enable-features=NetworkService,NetworkServiceInProcess",
        "--force-color-profile=srgb",
        "--metrics-recording-only",
      ],
      ignoreDefaultArgs: ["--enable-automation"],
    });

    this.logger.info(`單一瀏覽器實例創建成功`);
  }

  /**
   * 獲取或創建瀏覽器上下文（支援狀態持久化）
   */
  private async getOrCreateContext(
    browser: Browser,
    contextId?: string,
  ): Promise<BrowserContext> {
    const id = contextId || "default";

    if (this.contexts.has(id)) {
      const context = this.contexts.get(id)!;

      // 檢查上下文是否仍然有效
      try {
        const browser = context.browser();
        if (browser && !browser.isConnected()) {
          this.contexts.delete(id);
        } else {
          return context;
        }
      } catch {
        // 上下文已失效，移除它
        this.contexts.delete(id);
      }
    }

    // 創建新的上下文（支援狀態載入）
    const { context } = await this.createContextWithState(browser, id);
    this.contexts.set(id, context);


    return context;
  }

  /**
   * 創建支援狀態持久化的上下文
   */
  private async createContextWithState(
    browser: Browser,
    contextId: string,
  ): Promise<{
    context: BrowserContext;
    viewport: { width: number; height: number };
  }> {
    if (this.enableStatePersistence && this.stateFile) {
      const contextStateFile = this.getContextStateFile(contextId);

      // 嘗試載入已保存的狀態
      if (fs.existsSync(contextStateFile)) {
        try {
          this.logger.debug(`載入上下文狀態`, {
            contextId,
            stateFile: contextStateFile,
          });

          // 使用已保存的狀態創建上下文
          const { context } = await this.browserService.createContext(browser);

          // 載入已保存的狀態
          await this.loadContextState(context, contextStateFile);

          return { context, viewport: await this.getContextViewport(context) };
        } catch (error) {
          this.logger.warn(`載入上下文狀態失敗，將創建新的上下文`, {
            contextId,
            error: (error as Error).message,
          });
        }
      }
    }

    // 創建新的上下文
    return await this.browserService.createContext(browser);
  }

  /**
   * 載入上下文狀態
   */
  private async loadContextState(
    context: BrowserContext,
    stateFile: string,
  ): Promise<void> {
    try {
      const stateData = fs.readFileSync(stateFile, "utf8");
      const state = JSON.parse(stateData);

      // 載入cookies和其他狀態
      if (state.cookies && Array.isArray(state.cookies)) {
        await context.addCookies(state.cookies);
      }

      // 載入localStorage和sessionStorage（需要在頁面中執行）
      if (state.origins && Array.isArray(state.origins)) {
        for (const origin of state.origins) {
          if (origin.localStorage || origin.sessionStorage) {
            const page = await context.newPage();
            await page.goto("about:blank");

            if (origin.localStorage) {
              await page.addInitScript((localStorage) => {
                for (const [key, value] of Object.entries(localStorage)) {
                  window.localStorage.setItem(key, value as string);
                }
              }, origin.localStorage);
            }

            if (origin.sessionStorage) {
              await page.addInitScript((sessionStorage) => {
                for (const [key, value] of Object.entries(sessionStorage)) {
                  window.sessionStorage.setItem(key, value as string);
                }
              }, origin.sessionStorage);
            }

            await page.close();
          }
        }
      }

      this.logger.debug(`上下文狀態載入成功`, { stateFile });
    } catch (error) {
      this.logger.warn(`載入上下文狀態失敗`, {
        stateFile,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * 保存上下文狀態
   */
  private async saveContextState(
    context: BrowserContext,
    contextId: string,
  ): Promise<void> {
    if (!this.enableStatePersistence || !this.stateFile) {
      return;
    }

    try {
      const contextStateFile = this.getContextStateFile(contextId);

      // 確保目錄存在
      const dir = path.dirname(contextStateFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // 保存狀態
      await context.storageState({ path: contextStateFile });

      this.logger.debug(`上下文狀態已保存`, {
        contextId,
        stateFile: contextStateFile,
      });
    } catch (error) {
      this.logger.warn(`保存上下文狀態失敗`, {
        contextId,
        error: (error as Error).message,
      });
    }
  }

  /**
   * 獲取上下文狀態檔案路徑
   */
  private getContextStateFile(contextId: string): string {
    const baseFile = this.stateFile!;
    const ext = path.extname(baseFile);
    const name = path.basename(baseFile, ext);
    const dir = path.dirname(baseFile);

    return path.join(dir, `${name}-${contextId}${ext}`);
  }

  /**
   * 獲取上下文視窗大小
   */
  private async getContextViewport(
    context: BrowserContext,
  ): Promise<{ width: number; height: number }> {
    try {
      const page = await context.newPage();
      const viewport = page.viewportSize();
      await page.close();
      return viewport || { width: 1920, height: 1080 };
    } catch {
      return { width: 1920, height: 1080 };
    }
  }

  /**
   * 釋放標籤頁
   */
  private async releaseTab(page: Page): Promise<void> {
    try {
      if (!page.isClosed()) {
        await page.close();
      }

      this.activeTabs.delete(page);
      this.totalTabsClosed++;

    } catch (error) {
      this.logger.warn("標籤頁釋放失敗", {
        error: (error as Error).message,
      });
    }
  }

  /**
   * 等待標籤頁可用
   */
  private async waitForAvailableTab(): Promise<void> {

    return new Promise((resolve) => {
      const checkAvailable = () => {
        if (this.activeTabs.size < this.maxTabs) {
          resolve();
        } else {
          setTimeout(checkAvailable, 100);
        }
      };

      checkAvailable();
    });
  }

  /**
   * 獲取池狀態統計（新架構）
   */
  getStats(): BrowserPoolStats {
    const isHealthy = this.singleBrowser?.isConnected() || false;

    return {
      // 新的統計指標
      hasBrowser: !!this.singleBrowser,
      isHealthy,
      isHeadless: this.isHeadless,
      activeTabs: this.activeTabs.size,
      maxTabs: this.maxTabs,
      activeContexts: this.contexts.size,
      totalTabsCreated: this.totalTabsCreated,
      totalTabsClosed: this.totalTabsClosed,

      // 保持兼容性的舊指標
      total: this.singleBrowser ? 1 : 0,
      busy: this.activeTabs.size,
      available: Math.max(0, this.maxTabs - this.activeTabs.size),
      healthy: isHealthy ? 1 : 0,
      maxInstances: 1, // 單一實例
      totalCreated: this.totalTabsCreated,
      totalDestroyed: this.totalTabsClosed,
      averageUseCount: this.totalTabsCreated,
    };
  }

  /**
   * 手動保存所有上下文狀態
   */
  async saveAllStates(): Promise<void> {
    if (!this.enableStatePersistence) {
      return;
    }

    this.logger.info("保存所有上下文狀態", {
      contextCount: this.contexts.size,
    });

    const savePromises = Array.from(this.contexts.entries()).map(
      async ([contextId, context]) => {
        try {
          await this.saveContextState(context, contextId);
        } catch (error) {
          this.logger.warn("保存上下文狀態失敗", {
            contextId,
            error: (error as Error).message,
          });
        }
      },
    );

    await Promise.all(savePromises);
    this.logger.info("所有上下文狀態已保存");
  }

  /**
   * 清理所有狀態檔案
   */
  cleanupStateFiles(): void {
    if (!this.enableStatePersistence || !this.stateFile) {
      return;
    }

    try {
      const dir = path.dirname(this.stateFile);
      const baseName = path.basename(
        this.stateFile,
        path.extname(this.stateFile),
      );

      if (fs.existsSync(dir)) {
        const files = fs
          .readdirSync(dir)
          .filter(
            (file) => file.startsWith(baseName) && file.endsWith(".json"),
          );

        for (const file of files) {
          const filePath = path.join(dir, file);
          fs.unlinkSync(filePath);
        }

        this.logger.info("狀態檔案已清理", { count: files.length });
      }
    } catch (error) {
      this.logger.warn("清理狀態檔案失敗", {
        error: (error as Error).message,
      });
    }
  }

  /**
   * 強制清理所有實例（新架構）
   */
  async cleanup(): Promise<void> {
    this.logger.info(`開始清理瀏覽器池`, {
      hasBrowser: !!this.singleBrowser,
      activeTabs: this.activeTabs.size,
      activeContexts: this.contexts.size,
    });

    // 停止清理定時器
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // 先關閉所有活動標籤頁
    const tabCleanupPromises = Array.from(this.activeTabs).map((page) =>
      this.releaseTab(page).catch((error) =>
        this.logger.warn("標籤頁清理失敗", {
          error: (error as Error).message,
        }),
      ),
    );

    await Promise.all(tabCleanupPromises);

    // 清理所有上下文（先保存狀態）
    const contextCleanupPromises = Array.from(this.contexts.entries()).map(
      async ([contextId, context]) => {
        try {
          // 先保存狀態再關閉
          await this.saveContextState(context, contextId);
          await context.close();
        } catch (error) {
          this.logger.warn("上下文清理失敗", {
            contextId,
            error: (error as Error).message,
          });
        }
      },
    );

    await Promise.all(contextCleanupPromises);

    // 最後關閉瀏覽器
    if (this.singleBrowser) {
      try {
        await this.singleBrowser.close();
        this.logger.info("單一瀏覽器實例已關閉");
      } catch (error) {
        this.logger.warn("瀏覽器關閉失敗", {
          error: (error as Error).message,
        });
      }
    }

    // 清理狀態
    this.singleBrowser = null;
    this.contexts.clear();
    this.activeTabs.clear();

    this.logger.info(`瀏覽器池清理完成`, {
      totalTabsClosed: this.totalTabsClosed,
    });
  }

  /**
   * 啟動定期清理定時器（性能優化：更頻繁清理）
   */
  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(async () => {
      await this.cleanupIdleContexts();
    }, 30000);
  }

  /**
   * 清理閒置的瀏覽器上下文
   */
  private async cleanupIdleContexts(): Promise<void> {
    const contextsToClean: string[] = [];

    for (const [contextId, context] of this.contexts.entries()) {
      try {
        const pages = context.pages();
        const isEmpty = pages.length === 0;

        // 保留默認上下文，清理其他空閒上下文
        if (contextId !== "default" && isEmpty) {
          contextsToClean.push(contextId);
        }

        if (this.contexts.size > this.maxTabs && isEmpty) {
          contextsToClean.push(contextId);
        }
      } catch (error) {
        // 如果上下文已失效，標記為清理
        this.logger.warn(`上下文狀態檢查失敗，將被清理`, {
          contextId,
          error: (error as Error).message,
        });
        contextsToClean.push(contextId);
      }
    }

    // 執行清理
    if (contextsToClean.length > 0) {
      this.logger.info(`清理閒置瀏覽器上下文`, {
        count: contextsToClean.length,
        activeContexts: this.contexts.size,
        activeTabs: this.activeTabs.size,
      });

      // 並行清理以提高效率
      await Promise.all(
        contextsToClean.map(async (contextId) => {
          const context = this.contexts.get(contextId);
          if (context) {
            try {
              // 先保存狀態再關閉
              await this.saveContextState(context, contextId);
              await context.close();
              this.contexts.delete(contextId);
            } catch (error) {
              this.logger.warn(`上下文清理失敗`, {
                contextId,
                error: (error as Error).message,
              });
              // 強制移除失效的上下文
              this.contexts.delete(contextId);
            }
          }
        }),
      );
    }

    if (this.activeTabs.size > this.maxTabs * 0.8) {
      this.logger.warn(`標籤頁使用率較高`, {
        active: this.activeTabs.size,
        max: this.maxTabs,
        usage: Math.round((this.activeTabs.size / this.maxTabs) * 100) + "%",
      });
    }
  }

  /**
   * 動態切換瀏覽器模式（學習g-search-mcp策略）
   */
  async switchToHeadedMode(): Promise<void> {
    if (!this.isHeadless) {
      return;
    }

    this.logger.info("開始切換到有界面模式");

    // 保存當前狀態
    await this.saveAllContextStates();

    // 關閉當前瀏覽器實例
    await this.closeBrowserGracefully();

    // 標記為非無頭模式
    this.isHeadless = false;

    // 重新創建瀏覽器實例（headed模式）
    await this.createSingleBrowser();

    this.logger.info("成功切換到有界面模式");
  }

  /**
   * 保存所有上下文狀態
   */
  private async saveAllContextStates(): Promise<void> {
    const savePromises = Array.from(this.contexts.entries()).map(
      async ([contextId, context]) => {
        try {
          await this.saveContextState(context, contextId);
          this.logger.debug("上下文狀態已保存", { contextId });
        } catch (error) {
          this.logger.warn("上下文狀態保存失敗", {
            contextId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );

    await Promise.all(savePromises);
  }

  /**
   * 優雅地關閉瀏覽器實例
   */
  private async closeBrowserGracefully(): Promise<void> {
    if (!this.singleBrowser) {
      return;
    }

    try {
      // 首先關閉所有標籤頁
      const tabClosePromises = Array.from(this.activeTabs).map(async (page) => {
        try {
          await page.close();
        } catch (error) {
          this.logger.debug("標籤頁關閉失敗", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });

      await Promise.all(tabClosePromises);
      this.activeTabs.clear();

      // 然後關閉所有上下文
      const contextClosePromises = Array.from(this.contexts.values()).map(
        async (context) => {
          try {
            await context.close();
          } catch (error) {
            this.logger.debug("上下文關閉失敗", {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        },
      );

      await Promise.all(contextClosePromises);
      this.contexts.clear();

      // 最後關閉瀏覽器
      await this.singleBrowser.close();
      this.singleBrowser = null;

      this.logger.debug("瀏覽器實例已優雅關閉");
    } catch (error) {
      this.logger.warn("瀏覽器關閉失敗", {
        error: error instanceof Error ? error.message : String(error),
      });
      // 強制重置狀態
      this.singleBrowser = null;
      this.activeTabs.clear();
      this.contexts.clear();
    }
  }

  /**
   * 檢查是否為無頭模式
   */
  isHeadlessMode(): boolean {
    return this.isHeadless;
  }

  /**
   * 獲取瀏覽器狀態資訊
   */
  getBrowserStatus(): {
    isHeadless: boolean;
    isConnected: boolean;
    activeTabs: number;
    activeContexts: number;
  } {
    return {
      isHeadless: this.isHeadless,
      isConnected: !!this.singleBrowser?.isConnected(),
      activeTabs: this.activeTabs.size,
      activeContexts: this.contexts.size,
    };
  }

  /**
   * 啟動標籤頁預熱機制
   */
  private async startTabPrewarming(): Promise<void> {
    // 延遲啟動，等待瀏覽器初始化完成
    setTimeout(async () => {
      try {
        await this.prewarmTabs(Math.min(2, this.maxTabs)); // 預熱2個標籤頁
        this.logger.debug("標籤頁預熱完成", {
          prewarmedCount: this.prewarmedTabs.length,
        });
      } catch (error) {
        this.logger.warn("標籤頁預熱失敗", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, 2000);
  }

  /**
   * 預熱指定數量的標籤頁
   */
  private async prewarmTabs(count: number): Promise<void> {
    const browser = await this.getSingleBrowser();
    const context = await this.getOrCreateContext(browser, "prewarmed");

    for (let i = 0; i < count; i++) {
      try {
        const page = await context.newPage();
        this.prewarmedTabs.push(page);

        // 初始化預熱標籤頁的統計
        this.initTabUsageStats(page, true);

        this.logger.debug(`預熱標籤頁創建`, {
          index: i + 1,
          total: count,
        });
      } catch (error) {
        this.logger.warn(`預熱標籤頁創建失敗`, {
          index: i + 1,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * 獲取預熱的標籤頁
   */
  private async getPrewarmedTab(
    contextId?: string,
  ): Promise<ManagedTab | null> {
    if (this.prewarmedTabs.length === 0) {
      return null;
    }

    const page = this.prewarmedTabs.shift()!;
    this.activeTabs.add(page);

    // 更新使用統計
    const stats = this.tabUsageStats.get(page);
    if (stats) {
      stats.lastUsed = Date.now();
      stats.usageCount++;
    }

    this.logger.debug("使用預熱標籤頁", {
      contextId: contextId || "default",
      remainingPrewarmed: this.prewarmedTabs.length,
    });

    // 非同步補充預熱標籤頁
    this.replenishPrewarmedTabs();

    return {
      page,
      context: page.context(),
      contextId: contextId || "default",
      createdAt: Date.now(),
      release: async () => {
        await this.releaseTab(page);
      },
    };
  }

  /**
   * 補充預熱標籤頁
   */
  private async replenishPrewarmedTabs(): Promise<void> {
    const targetCount = Math.min(2, this.maxTabs);
    const needed = targetCount - this.prewarmedTabs.length;

    if (needed > 0) {
      setTimeout(async () => {
        try {
          await this.prewarmTabs(needed);
        } catch (error) {
          this.logger.debug("補充預熱標籤頁失敗", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }, 100); // 延遲100ms，避免阻塞主流程
    }
  }

  /**
   * 初始化標籤頁使用統計
   */
  private initTabUsageStats(page: Page, isPrewarmed: boolean = false): void {
    const stats: TabUsageStats = {
      createdAt: Date.now(),
      lastUsed: Date.now(),
      usageCount: 0,
      totalDuration: 0,
      errorCount: 0,
      successCount: 0,
      isPrewarmed,
    };

    this.tabUsageStats.set(page, stats);
  }

  /**
   * 獲取最佳可用標籤頁（負載均衡）
   */
  private getBestAvailableTab(): Page | null {
    if (this.activeTabs.size === 0) {
      return null;
    }

    // 按使用頻率和最後使用時間排序
    const sortedTabs = Array.from(this.activeTabs).sort((a, b) => {
      const statsA = this.tabUsageStats.get(a);
      const statsB = this.tabUsageStats.get(b);

      if (!statsA || !statsB) {
        return 0;
      }

      // 優先選擇使用次數少且最近使用的標籤頁
      const scoreA =
        statsA.usageCount * 0.7 + (Date.now() - statsA.lastUsed) * 0.3;
      const scoreB =
        statsB.usageCount * 0.7 + (Date.now() - statsB.lastUsed) * 0.3;

      return scoreA - scoreB;
    });

    return sortedTabs[0] || null;
  }

  /**
   * 更新標籤頁統計（成功）
   */
  private updateTabStatsSuccess(page: Page, duration: number): void {
    const stats = this.tabUsageStats.get(page);
    if (stats) {
      stats.successCount++;
      stats.totalDuration += duration;
      stats.lastUsed = Date.now();
    }
  }

  /**
   * 更新標籤頁統計（錯誤）
   */
  private updateTabStatsError(page: Page): void {
    const stats = this.tabUsageStats.get(page);
    if (stats) {
      stats.errorCount++;
      stats.lastUsed = Date.now();
    }
  }

  /**
   * 獲取標籤頁性能統計
   */
  getTabPerformanceStats(): {
    totalTabs: number;
    prewarmedTabs: number;
    averageUsage: number;
    successRate: number;
  } {
    const totalTabs = this.tabUsageStats.size;
    const prewarmedTabs = this.prewarmedTabs.length;

    let totalUsage = 0;
    let totalSuccess = 0;
    let totalErrors = 0;

    for (const stats of this.tabUsageStats.values()) {
      totalUsage += stats.usageCount;
      totalSuccess += stats.successCount;
      totalErrors += stats.errorCount;
    }

    return {
      totalTabs,
      prewarmedTabs,
      averageUsage: totalTabs > 0 ? totalUsage / totalTabs : 0,
      successRate:
        totalSuccess + totalErrors > 0
          ? totalSuccess / (totalSuccess + totalErrors)
          : 0,
    };
  }
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
  // 新架構指標
  hasBrowser: boolean;
  isHealthy: boolean;
  isHeadless: boolean;
  activeTabs: number;
  maxTabs: number;
  activeContexts: number;
  totalTabsCreated: number;
  totalTabsClosed: number;

  // 兼容性指標
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
export function createBrowserPool(
  maxTabs: number = 4,
  maxIdleTime: number = 300000,
  options: PlaywrightOptions = {},
  logger?: Logger,
): BrowserPool {
  return new BrowserPool(maxTabs, maxIdleTime, options, logger);
}
