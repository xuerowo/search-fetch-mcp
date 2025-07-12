import { Browser, BrowserContext, Page, chromium } from "playwright";
import { Logger } from "./logger.js";
import { PlaywrightOptions } from "./types.js";
import {
  FingerprintService,
  FingerprintConfig,
} from "./fingerprint-service.js";
import fs from "fs";

/**
 * 專業的瀏覽器服務，包含反檢測和隱身功能
 * 基於 fetcher-mcp 的最佳實踐
 */
export class BrowserService {
  private options: PlaywrightOptions;
  private isDebugMode: boolean;
  private logger: Logger;
  private fingerprintService: FingerprintService;
  private isWSL: boolean;

  constructor(options: PlaywrightOptions, logger: Logger) {
    this.options = options;
    this.logger = logger;
    this.isDebugMode = options.debug || false;
    this.fingerprintService = new FingerprintService(logger);
    this.isWSL = this.detectWSL();
    
    if (this.isWSL) {
      this.logger.info("檢測到 WSL 環境，將使用優化配置");
    }
  }

  /**
   * 檢測運行環境
   */
  private detectWSL(): boolean {
    // 在 WSL 環境中運行，但需要檢測實際的運行環境
    // 檢查是否在 WSL 中運行，如果是則需要特殊處理瀏覽器啟動參數
    try {
      return fs.existsSync('/proc/version') && 
             fs.readFileSync('/proc/version', 'utf8').includes('microsoft');
    } catch {
      return false;
    }
  }

  /**
   * 根據語言生成Accept-Language標頭
   */
  private getAcceptLanguage(locale: string): string {
    const localeMap: Record<string, string> = {
      "zh-TW": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
      "zh-CN": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
      "en-US": "en-US,en;q=0.9",
      "ja-JP": "ja,en-US;q=0.9,en;q=0.8",
      "ko-KR": "ko,en-US;q=0.9,en;q=0.8",
      "de-DE": "de,en-US;q=0.9,en;q=0.8",
      "fr-FR": "fr,en-US;q=0.9,en;q=0.8",
    };

    return localeMap[locale] || "en-US,en;q=0.9";
  }

  /**
   * 重設指紋配置
   */
  public async resetFingerprint(): Promise<void> {
    await this.fingerprintService.resetFingerprint();
    this.logger.info("指紋配置已重設");
  }

  /**
   * 獲取當前指紋配置
   */
  public async getCurrentFingerprint(): Promise<FingerprintConfig> {
    return await this.fingerprintService.getFingerprint();
  }

  /**
   * 設置反檢測腳本
   */
  private async setupAntiDetection(context: BrowserContext): Promise<void> {
    await context.addInitScript(() => {
      // 覆蓋 navigator.webdriver
      Object.defineProperty(navigator, "webdriver", {
        get: () => false,
      });

      // 移除自動化指紋
      delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Array;
      delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Promise;
      delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Symbol;

      // 添加 Chrome 物件
      const chrome = {
        runtime: {},
      };
      (window as any).chrome = chrome;

      // 修改螢幕和導航器屬性
      Object.defineProperty(screen, "width", { value: window.innerWidth });
      Object.defineProperty(screen, "height", { value: window.innerHeight });
      Object.defineProperty(screen, "availWidth", { value: window.innerWidth });
      Object.defineProperty(screen, "availHeight", {
        value: window.innerHeight,
      });

      // 添加語言特性
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en", "zh-TW", "zh"],
      });

      // 模擬隨機數量的插件
      Object.defineProperty(navigator, "plugins", {
        get: () => {
          const plugins = [];
          for (let i = 0; i < 5 + Math.floor(Math.random() * 5); i++) {
            plugins.push({
              name: "Plugin " + i,
              description: "Description " + i,
              filename: "plugin" + i + ".dll",
            });
          }
          return plugins;
        },
      });
    });
  }

  /**
   * 設置媒體處理
   */
  private async setupMediaHandling(context: BrowserContext): Promise<void> {
    if (this.options.disableMedia) {
      await context.route("**/*", async (route) => {
        const resourceType = route.request().resourceType();
        if (["image", "stylesheet", "font", "media"].includes(resourceType)) {
          await route.abort();
        } else {
          await route.continue();
        }
      });
    }
  }

  /**
   * 創建隱身瀏覽器實例
   */
  public async createBrowser(customOptions?: {
    headless?: boolean;
    args?: string[];
    ignoreDefaultArgs?: boolean | string[];
  }): Promise<Browser> {
    // 獲取指紋配置以設定視窗大小
    const fingerprint = await this.fingerprintService.getFingerprint();
    const headless =
      customOptions?.headless ?? this.options.headless ?? !this.isDebugMode;
    
    // 優化的 WSL 友善啟動參數
    const args = customOptions?.args ?? [
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-webgl",
      "--disable-infobars",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--disable-features=TranslateUI",
      "--disable-ipc-flooding-protection",
      "--window-size=" +
        fingerprint.viewport.width +
        "," +
        fingerprint.viewport.height,
      "--disable-extensions",
      // WSL 特定優化
      "--virtual-time-budget=5000",
      "--run-all-compositor-stages-before-draw",
      "--no-first-run",
      "--no-default-browser-check",
    ];

    const launchOptions = {
      headless,
      args,
      ignoreDefaultArgs: customOptions?.ignoreDefaultArgs,
      // 增加超時時間以適應 WSL 環境
      timeout: 60000, // 60 秒
    };

    this.logger.debug("啟動瀏覽器", { headless, args: args.length });

    try {
      return await chromium.launch(launchOptions);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error("瀏覽器啟動失敗", err);
      
      // 回退策略：使用 Windows 優化的最小配置重試
      this.logger.info("嘗試使用 Windows 優化的最小配置重新啟動瀏覽器");
      const fallbackArgs = [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--headless=new",
        "--disable-web-security",
        "--disable-features=VizDisplayCompositor",
        "--no-first-run",
        "--disable-background-timer-throttling",
      ];
      
      return await chromium.launch({
        headless: true,
        args: fallbackArgs,
        timeout: 30000,
      });
    }
  }

  /**
   * 創建隱身瀏覽器上下文（使用智能指紋配置）
   */
  public async createContext(
    browser: Browser,
  ): Promise<{
    context: BrowserContext;
    viewport: { width: number; height: number };
  }> {
    // 獲取指紋配置
    const fingerprint = await this.fingerprintService.getFingerprint();

    this.logger.debug("使用指紋配置創建上下文", {
      deviceName: fingerprint.deviceName,
      locale: fingerprint.locale,
      timezone: fingerprint.timezoneId,
      viewport: fingerprint.viewport,
    });

    const context = await browser.newContext({
      javaScriptEnabled: true,
      ignoreHTTPSErrors: true,
      userAgent: fingerprint.userAgent,
      viewport: fingerprint.viewport,
      deviceScaleFactor: fingerprint.deviceScaleFactor,
      isMobile: false,
      hasTouch: false,
      locale: fingerprint.locale,
      timezoneId: fingerprint.timezoneId,
      colorScheme: fingerprint.colorScheme,
      reducedMotion: fingerprint.reducedMotion,
      forcedColors: fingerprint.forcedColors,
      acceptDownloads: true,
      extraHTTPHeaders: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": this.getAcceptLanguage(fingerprint.locale),
        "Accept-Encoding": "gzip, deflate, br",
        DNT: "1",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Cache-Control": "max-age=0",
      },
    });

    // 設置反檢測措施
    await this.setupAntiDetection(context);

    // 配置媒體處理
    await this.setupMediaHandling(context);

    return { context, viewport: fingerprint.viewport };
  }

  /**
   * 創建新頁面
   */
  public async createPage(context: BrowserContext): Promise<Page> {
    const page = await context.newPage();
    return page;
  }

  /**
   * 清理資源
   */
  public async cleanup(
    browser: Browser | null,
    page: Page | null,
  ): Promise<void> {
    if (!this.isDebugMode) {
      if (page) {
        await page.close().catch((e) => this.logger.error("關閉頁面失敗", e));
      }
      if (browser) {
        await browser
          .close()
          .catch((e) => this.logger.error("關閉瀏覽器失敗", e));
      }
    } else {
      this.logger.info("調試模式：保持瀏覽器開啟");
    }
  }

  /**
   * 清理上下文
   */
  public async cleanupContext(context: BrowserContext): Promise<void> {
    try {
      await context.close();
    } catch (error) {
      this.logger.error("關閉上下文失敗", error as Error);
    }
  }

  /**
   * 清理頁面
   */
  public async cleanupPage(page: Page): Promise<void> {
    try {
      if (!page.isClosed()) {
        await page.close();
      }
    } catch (error) {
      this.logger.error("關閉頁面失敗", error as Error);
    }
  }
}
