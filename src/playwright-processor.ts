import { Page } from "playwright";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";
// @ts-ignore - turndown-plugin-gfm 沒有型別定義
import { gfm } from "turndown-plugin-gfm";
import { FetchOptions, FetchResult } from "./types.js";
import { Logger } from "./logger.js";

/**
 * 專業的網頁內容處理器，支援 SPA 和複雜網站
 * 基於 fetcher-mcp 的 WebContentProcessor 最佳實踐
 */
export class PlaywrightProcessor {
  private options: FetchOptions;
  private logger: Logger;
  private logPrefix: string;
  private turndownService: TurndownService;

  constructor(
    options: FetchOptions,
    logger: Logger,
    logPrefix = "[PlaywrightProcessor]",
  ) {
    this.options = options;
    this.logger = logger;
    this.logPrefix = logPrefix;

    // 設置 Markdown 轉換器
    this.turndownService = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      emDelimiter: "*",
      strongDelimiter: "**",
      linkStyle: "inlined",
      linkReferenceStyle: "full",
    });

    // @ts-ignore
    this.turndownService.use(gfm);

    // 自定義規則
    this.turndownService.addRule("removeScript", {
      filter: ["script", "style", "noscript"],
      replacement: () => "",
    });
  }

  /**
   * 處理頁面內容的主要方法
   */
  public async processPageContent(
    page: Page,
    url: string,
  ): Promise<FetchResult> {
    try {
      this.logger.info(`${this.logPrefix} 開始處理 URL: ${url}`);

      // 等待頁面穩定（包含超時降級策略）
      let pageTitle = "無標題";
      let rawHtml = "";

      try {
        await this.waitForPageStability(page, url);

        // 安全地獲取頁面資訊（支援重試）
        const pageInfo = await this.safelyGetPageInfo(page, url);
        pageTitle = pageInfo.pageTitle;
        rawHtml = pageInfo.html;
      } catch (gotoError: any) {
        // 如果是超時錯誤，嘗試降級獲取內容
        if (
          gotoError.message.includes("Timeout") ||
          gotoError.message.includes("timeout")
        ) {
          this.logger.warn(
            `${this.logPrefix} 導航超時: ${gotoError.message}。嘗試獲取已載入的內容...`,
          );

          // 嘗試獲取已載入的內容
          try {
            const pageInfo = await this.safelyGetPageInfo(page, url);
            pageTitle = pageInfo.pageTitle;
            rawHtml = pageInfo.html;

            // 如果獲取到內容，繼續處理
            if (rawHtml && rawHtml.trim().length > 0) {
              this.logger.info(
                `${this.logPrefix} 超時後成功獲取內容，長度: ${rawHtml.length}`,
              );
            } else {
              throw gotoError; // 沒有內容，拋出原始錯誤
            }
          } catch (retrieveError: any) {
            this.logger.error(
              `${this.logPrefix} 超時後獲取內容失敗: ${retrieveError.message}`,
            );
            throw gotoError;
          }
        } else {
          // 非超時錯誤，直接拋出
          throw gotoError;
        }
      }

      this.logger.debug(
        `${this.logPrefix} 獲取到原始 HTML，長度: ${rawHtml.length}`,
      );

      // 處理內容
      let processedContent: string;
      let finalTitle: string;

      if (this.options.format === "html") {
        processedContent = rawHtml;
        finalTitle = pageTitle !== "無標題" ? pageTitle : "無標題";
      } else {
        // 使用 Readability 提取主要內容
        const { content: readabilityContent, title: readabilityTitle } =
          this.extractWithReadability(rawHtml, url);

        // 優先使用頁面實際標題，其次使用 Readability 提取的標題
        finalTitle =
          pageTitle !== "無標題" ? pageTitle : readabilityTitle || "無標題";

        if (this.options.format === "markdown") {
          processedContent = this.convertToMarkdown(
            readabilityContent,
            finalTitle,
          );
        } else if (this.options.format === "text") {
          processedContent = this.convertToText(readabilityContent);
        } else {
          // JSON 格式 - 包含更完整的信息
          const textContent = this.convertToText(readabilityContent);
          const markdownContent = this.convertToMarkdown(
            readabilityContent,
            finalTitle,
          );

          processedContent = JSON.stringify(
            {
              url,
              title: finalTitle,
              content: textContent,
              markdown: markdownContent,
              html: readabilityContent,
              extractedAt: new Date().toISOString(),
              contentLength: textContent.length,
              originalLength: readabilityContent.length,
              processingMode: "SPA",
            },
            null,
            2,
          );
        }
      }

      // 記錄原始長度
      const originalLength = processedContent.length;

      // 應用長度限制（僅處理 startIndex）
      const finalContent = this.applyLengthLimit(processedContent);

      this.logger.info(
        `${this.logPrefix} 內容處理完成，原始長度: ${originalLength}，最終長度: ${finalContent.length}`,
      );

      return {
        success: true,
        content: finalContent,
        url,
        title: finalTitle,
        originalLength,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`${this.logPrefix} 處理失敗: ${errorMessage}`);

      return {
        success: false,
        content: "",
        error: errorMessage,
        url,
      };
    }
  }

  /**
   * 等待頁面穩定（重要的 SPA 支援功能）
   */
  private async waitForPageStability(page: Page, url: string): Promise<void> {
    try {
      // 導航到 URL
      await page.goto(url, {
        waitUntil: this.options.waitUntil || "domcontentloaded",
        timeout: this.options.timeout || 60000,
      });


      // 等待網路穩定（優化後的邏輯）
      try {
        await page.waitForLoadState("networkidle", {
          timeout: 10000,
        });
      } catch {
        // 網路閒置等待超時，繼續處理
      }

      // 對於 SPA，等待 DOM 穩定
      await this.waitForDOMStability(page);

      // 滾動到底部以觸發懶載入內容
      await this.scrollToLoadContent(page);
    } catch (error) {
      this.logger.error(`${this.logPrefix} 頁面導航失敗: ${error}`);
      throw error;
    }
  }

  /**
   * 等待 DOM 穩定（對 SPA 很重要）
   */
  private async waitForDOMStability(page: Page): Promise<void> {
    try {
      await page
        .waitForFunction(
          () => {
            // 檢查 Vue.js
            if (typeof window !== "undefined" && (window as any).Vue) {
              return true;
            }

            // 檢查 React
            if (typeof window !== "undefined" && (window as any).React) {
              return true;
            }

            // 檢查 Angular
            if (typeof window !== "undefined" && (window as any).ng) {
              return true;
            }

            // 通用檢查：等待載入指示器消失
            const loadingElements = document.querySelectorAll(
              '.loading, .spinner, .loader, [class*="loading"], [class*="spinner"]',
            );
            return loadingElements.length === 0;
          },
          { timeout: 5000 },
        )
        .catch(() => {
          this.logger.debug(`${this.logPrefix} DOM 穩定性檢查超時，繼續處理`);
        });
    } catch (error) {
      this.logger.debug(`${this.logPrefix} DOM 穩定性檢查失敗: ${error}`);
    }
  }

  /**
   * 滾動載入內容
   */
  private async scrollToLoadContent(page: Page): Promise<void> {
    try {
      await page.evaluate(() => {
        return new Promise<void>((resolve) => {
          let totalHeight = 0;
          const distance = 100;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;

            if (totalHeight >= scrollHeight) {
              clearInterval(timer);
              resolve();
            }
          }, 100);

          // 最多滾動 5 秒
          setTimeout(() => {
            clearInterval(timer);
            resolve();
          }, 5000);
        });
      });

      // 滾動回頂部
      await page.evaluate(() => window.scrollTo(0, 0));
    } catch (error) {
      this.logger.debug(`${this.logPrefix} 滾動載入失敗: ${error}`);
    }
  }

  /**
   * 安全地獲取頁面資訊（支援重試機制）
   * 參考 fetcher-mcp 的 safelyGetPageInfo 方法
   */
  private async safelyGetPageInfo(
    page: Page,
    url: string,
    retries = 3,
  ): Promise<{ pageTitle: string; html: string }> {
    let pageTitle = "無標題";
    let html = "";
    let attempt = 0;

    while (attempt < retries) {
      try {
        attempt++;

        // 獲取頁面標題
        pageTitle = await page.title();
        this.logger.debug(`${this.logPrefix} 頁面標題: ${pageTitle}`);

        // 獲取 HTML 內容
        html = await page.content();

        // 如果成功獲取，退出循環
        return { pageTitle, html };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        // 檢查是否為 "execution context was destroyed" 錯誤
        if (
          errorMessage.includes("Execution context was destroyed") &&
          attempt < retries
        ) {
          this.logger.warn(
            `${this.logPrefix} Context 已銷毀，等待頁面導航完成 (嘗試 ${attempt}/${retries})...`,
          );

          // 等待頁面穩定
          await new Promise((resolve) => setTimeout(resolve, 1000));
          await this.ensurePageStability(page);

          // 如果是最後一次重試，記錄錯誤但繼續
          if (attempt === retries) {
            this.logger.error(
              `${this.logPrefix} ${retries} 次嘗試後仍無法獲取頁面資訊`,
            );
          }
        } else {
          // 其他錯誤，記錄並重新拋出
          this.logger.error(
            `${this.logPrefix} 獲取頁面資訊錯誤: ${errorMessage}`,
          );
          throw error;
        }
      }
    }

    return { pageTitle, html };
  }

  /**
   * 確保頁面穩定性（參考 fetcher-mcp 的 ensurePageStability）
   */
  private async ensurePageStability(page: Page): Promise<void> {
    try {
      // 檢查頁面是否有正在進行的網絡請求或導航
      await page.waitForFunction(
        () => {
          return window.document.readyState === "complete";
        },
        { timeout: this.options.timeout || 60000 },
      );

      // 額外等待一小段時間確保頁面穩定
      await page.waitForTimeout(500);

      this.logger.debug(`${this.logPrefix} 頁面已穩定`);
    } catch (error) {
      this.logger.warn(
        `${this.logPrefix} 確保頁面穩定性時發生錯誤: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 使用 Readability 提取主要內容
   */
  private extractWithReadability(
    html: string,
    url: string,
  ): { content: string; title: string } {
    try {
      const dom = new JSDOM(html, { url });
      const document = dom.window.document;
      const reader = new Readability(document);
      const article = reader.parse();

      if (article) {
        return {
          content: article.content || "",
          title: article.title || "",
        };
      }
    } catch (error) {
      this.logger.error(`${this.logPrefix} Readability 提取失敗: ${error}`);
    }

    // 回退到原始 HTML
    return {
      content: html,
      title: "",
    };
  }

  /**
   * 轉換為 Markdown
   */
  private convertToMarkdown(html: string, title?: string): string {
    try {
      let markdown = this.turndownService.turndown(html);

      if (title) {
        markdown = `# ${title}\n\n${markdown}`;
      }

      return markdown;
    } catch (error) {
      this.logger.error(`${this.logPrefix} Markdown 轉換失敗: ${error}`);
      return html;
    }
  }

  /**
   * 轉換為純文字
   */
  private convertToText(html: string): string {
    try {
      const dom = new JSDOM(html);
      return dom.window.document.body.textContent || "";
    } catch (error) {
      this.logger.error(`${this.logPrefix} 文字轉換失敗: ${error}`);
      return html;
    }
  }

  /**
   * 應用長度限制
   */
  private applyLengthLimit(content: string): string {
    const startIndex = this.options.startIndex || 0;

    // 只處理 startIndex，不處理 maxLength（讓 fetcher.ts 統一處理截斷）
    if (startIndex > 0) {
      return content.slice(startIndex);
    }

    return content;
  }
}
