#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { DuckDuckGoSearcher } from "./searcher.js";
import { RateLimiter } from "./rate-limiter.js";
import { InputValidator } from "./validator.js";
import { Logger } from "./logger.js";
import { WebpageFetcher } from "./fetcher.js";
import { loadConfig, validateConfig, supportedLanguages } from "./config.js";
import {
  SearchResult,
  BatchSearchResult,
  BatchStats,
  BatchFetchResult,
  FetchOptions,
  SearchStructuredOutput,
  FetchStructuredOutput,
  BatchSearchStructuredOutput,
  BatchFetchStructuredOutput,
  ValidationError,
  RateLimitError,
} from "./types.js";

/**
 * 現代化的 DuckDuckGo MCP 伺服器
 * 使用最新的 McpServer API 和 Zod 驗證
 */
export class DuckDuckGoMCPServer {
  private server: McpServer;
  private searcher: DuckDuckGoSearcher;
  private fetcher: WebpageFetcher;
  private rateLimiter: RateLimiter;
  private logger: Logger;
  private config = loadConfig();

  constructor() {
    this.logger = new Logger(this.config.logging);

    try {
      validateConfig(this.config);

      // 使用現代化的 McpServer
      this.server = new McpServer({
        name: this.config.name,
        version: this.config.version,
      });

      this.searcher = new DuckDuckGoSearcher(this.logger);
      this.fetcher = new WebpageFetcher(this.logger);
      this.rateLimiter = new RateLimiter(this.config.rateLimits);

      this.setupTools();
    } catch (error) {
      this.logger.error("初始化失敗", error as Error);
      throw error;
    }
  }

  /**
   * 設置所有 MCP 工具
   */
  private setupTools(): void {
    this.registerDdgSearchTool();
    this.registerWebpageFetchTool();
    this.registerBatchSearchTool();
    this.registerBatchFetchTool();
  }


  /**
   * 註冊 DuckDuckGo 搜索工具
   */
  private registerDdgSearchTool(): void {
    this.server.registerTool(
      "ddg_search",
      {
        title: "DuckDuckGo 搜索",
        description: "根據單一關鍵詞返回相關網頁標題、連結、摘要或發布/修改日期。適合特定主題搜索、最新資訊查詢。獲得結果後，建議用 webpage_fetch 或 batch_fetch 進一步獲取具體內容。",
        inputSchema: {
          query: z.string().min(1).describe('搜索查詢字符串，建議保持主題一致性。支援高級運算符：site:example.com (限制網站)、filetype:pdf (文件類型)、intitle:關鍵詞 (標題搜索)等。'),
          count: z.number().int().min(1).max(this.config.search.maxCount).default(this.config.search.defaultCount).describe(`返回結果數量 (1-${this.config.search.maxCount})`),
          language: z.enum(supportedLanguages as any).default(this.config.search.defaultLanguage).describe("搜索語言/地區代碼。格式: 地區-語言。例如: wt-wt (全球), us-en (美國), tw-tzh (台灣), hk-tzh (香港), cn-zh (中國)"),
          safe_search: z.enum(["strict", "moderate", "off"]).default(this.config.search.defaultSafeSearch).describe("安全搜索級別: strict (嚴格), moderate (中等), off (關閉)"),
          time_range: z.enum(["day", "week", "month", "year"]).optional().describe("時間範圍過濾: day (過去一天), week (過去一週), month (過去一個月), year (過去一年)。適合搜索最新資訊、新聞事件或技術更新。"),
        },
        annotations: {
          title: "DuckDuckGo 搜索",
          readOnlyHint: true,
          openWorldHint: true,
          dangerousOperation: false,
          requiresConfirmation: false,
        },
      },
      async ({ query, count, language, safe_search, time_range }) => {
        const result = await this.handleSearch({
          query,
          count,
          language,
          safe_search,
          time_range,
        });
        return {
          content: result.content.map(item => ({
            type: "text" as const,
            text: item.text,
          })),
          structuredContent: result.structuredContent,
        };
      }
    );
  }

  /**
   * 註冊網頁獲取工具
   */
  private registerWebpageFetchTool(): void {
    this.server.registerTool(
      "webpage_fetch",
      {
        title: "網頁內容獲取",
        description: "當你已有明確URL且需要詳細內容時使用。適用於：閱讀特定文章、分析網頁資料、提取詳細資訊。如果不知道URL，必須先用 ddg_search 搜尋。",
        inputSchema: {
          url: z.string().url().describe("要獲取的網頁 URL"),
          format: z.enum(["html", "markdown", "text", "json"]).default(this.config.fetch.defaultFormat).describe("輸出格式：html (原始HTML), markdown (適合閱讀), text (純文字), json (包含完整元數據)"),
          maxLength: z.number().int().min(100).max(99000).default(10000).describe("返回內容的最大字符數。超過此長度會自動截斷並提供繼續讀取的提示。"),
          useSPA: z.boolean().default(this.config.fetch.defaultUseSPA).describe("是否使用無頭瀏覽器處理網站（推薦）。適用於現代動態網站。若網站載入失敗，可嘗試設為 false。"),
          start_index: z.number().int().min(0).max(1000000).default(0).describe("開始讀取的字符位置。用於獲取長內容的後續部分。當內容被截斷時，系統會提示下一個 start_index 值。"),
          useReadability: z.boolean().default(this.config.fetch.defaultUseReadability).describe("是否使用 Mozilla Readability 提取主要內容。設為 false 可獲取完整頁面內容（包括導航、側邊欄、GitHub 儲存庫檔案列表等），適合瀏覽網站結構或 GitHub 儲存庫。建議同時將 maxLength 調高（如 30000-99000）以獲取完整內容。"),
          userAgentMode: z.enum(["dynamic", "custom", "crawler"]).default("dynamic").describe("User-Agent 模式：dynamic（智能動態，推薦用於反爬蟲網站）, custom（自定義）, crawler（明顯爬蟲標識，可能被封鎖）"),
          customUserAgent: z.string().optional().describe("自定義 User-Agent 字串（僅在 userAgentMode=custom 時使用）。建議使用真實瀏覽器的 User-Agent 字串。"),
        },
        annotations: {
          title: "網頁內容獲取",
          readOnlyHint: true,
          openWorldHint: true,
          dangerousOperation: false,
          requiresConfirmation: false,
        },
      },
      async (args) => {
        const result = await this.handleFetch(args);
        if ('isError' in result && result.isError) {
          return {
            content: result.content.map(item => ({
              type: "text" as const,
              text: item.text,
            })),
            isError: true,
            structuredContent: result.structuredContent,
          };
        }
        return {
          content: result.content.map(item => ({
            type: "text" as const,
            text: item.text,
          })),
          structuredContent: result.structuredContent,
        };
      }
    );
  }

  /**
   * 註冊批量搜索工具
   */
  private registerBatchSearchTool(): void {
    this.server.registerTool(
      "ddg_batch_search",
      {
        title: "DuckDuckGo 批量搜索",
        description: "並行搜索多個相關查詢返回多個查詢各自相關網頁標題、連結、摘要或發布/修改日期，適合比較分析、多角度研究。每個查詢保持獨立焦點，避免單一查詢包含多個對比概念。獲得結果後，建議用 batch_fetch 一次性獲取多個頁面完整內容。",
        inputSchema: {
          queries: z.array(z.string().min(1)).min(1).max(5).describe("要並行搜索的查詢列表，每個查詢聚焦單一角度或概念"),
          count: z.number().int().min(1).max(20).default(5).describe("每個查詢返回的結果數量"),
          language: z.enum(supportedLanguages as any).default(this.config.search.defaultLanguage).describe("搜索語言/地區代碼（所有查詢使用相同設定）"),
          safe_search: z.enum(["strict", "moderate", "off"]).default(this.config.search.defaultSafeSearch).describe("安全搜索級別（所有查詢使用相同設定）"),
          time_range: z.enum(["day", "week", "month", "year"]).optional().describe("時間範圍過濾（所有查詢使用相同設定）"),
        },
        annotations: {
          title: "DuckDuckGo 批量搜索",
          readOnlyHint: true,
          openWorldHint: true,
          dangerousOperation: false,
          requiresConfirmation: false,
        },
      },
      async (args) => {
        const result = await this.handleBatchSearch(args);
        return {
          content: result.content.map(item => ({
            type: "text" as const,
            text: item.text,
          })),
          structuredContent: result.structuredContent,
        };
      }
    );
  }

  /**
   * 註冊批量獲取工具
   */
  private registerBatchFetchTool(): void {
    this.server.registerTool(
      "batch_fetch",
      {
        title: "批量網頁獲取",
        description: "當需要同時閱讀多個相關網頁時使用，比多次 webpage_fetch 更高效。適合：比較不同來源、分析多篇文章、整合多方觀點。通常搭配 ddg_batch_search 的結果使用。",
        inputSchema: {
          urls: z.array(z.string().url()).min(1).max(10).describe("要並行獲取的 URL 列表"),
          format: z.enum(["html", "markdown", "text", "json"]).default(this.config.fetch.defaultFormat).describe("輸出格式：html (原始HTML), markdown (適合閱讀), text (純文字), json (完整元數據)"),
          maxLength: z.number().int().min(100).max(50000).default(8000).describe("每個網頁的最大內容長度"),
          useSPA: z.boolean().default(this.config.fetch.defaultUseSPA).describe("是否使用無頭瀏覽器處理（推薦）。適用於現代動態網站。若網站載入失敗，可嘗試設為 false。"),
          useReadability: z.boolean().default(this.config.fetch.defaultUseReadability).describe("是否使用 Mozilla Readability 提取主要內容。設為 false 可獲取完整頁面內容（包括導航、側邊欄、GitHub 儲存庫檔案列表等），適合瀏覽網站結構或 GitHub 儲存庫。建議同時將 maxLength 調高（如 30000-50000）以獲取完整內容。"),
          userAgentMode: z.enum(["dynamic", "custom", "crawler"]).default("dynamic").describe("User-Agent 模式：dynamic（智能動態，推薦用於反爬蟲網站）, custom（自定義）, crawler（明顯爬蟲標識，可能被封鎖）"),
          customUserAgent: z.string().optional().describe("自定義 User-Agent 字串（僅在 userAgentMode=custom 時使用）。建議使用真實瀏覽器的 User-Agent 字串。"),
        },
        annotations: {
          title: "批量網頁獲取",
          readOnlyHint: true,
          openWorldHint: true,
          dangerousOperation: false,
          requiresConfirmation: false,
        },
      },
      async (args) => {
        const result = await this.handleBatchFetch(args);
        if ('isError' in result && result.isError) {
          return {
            content: result.content.map(item => ({
              type: "text" as const,
              text: item.text,
            })),
            isError: true,
            structuredContent: result.structuredContent,
          };
        }
        return {
          content: result.content.map(item => ({
            type: "text" as const,
            text: item.text,
          })),
          structuredContent: result.structuredContent,
        };
      }
    );
  }

  /**
   * 處理搜索請求
   */
  private async handleSearch(args: any) {
    try {
      const query = InputValidator.validateQuery(args.query);
      const count = args.count || this.config.search.defaultCount;
      const language = args.language || this.config.search.defaultLanguage;
      const safeSearch = args.safe_search || this.config.search.defaultSafeSearch;
      const timeRange = args.time_range;

      await this.rateLimiter.checkLimit();

      const startTime = Date.now();

      try {
        const results = await this.searcher.search(query, {
          count,
          language,
          safeSearch: safeSearch as "strict" | "moderate" | "off",
          timeRange: timeRange as "day" | "week" | "month" | "year" | undefined,
        });

        const duration = Date.now() - startTime;

        this.logger.info("搜索完成", {
          query: this.sanitizeQuery(query),
          resultCount: results.length,
          duration: `${duration}ms`,
          source: "duckduckgo",
        });

        return this.formatSearchResults(results, query, language, safeSearch, timeRange);
      } catch (error) {
        const duration = Date.now() - startTime;

        this.logger.error("搜索執行失敗", error as Error, {
          query: this.sanitizeQuery(query),
          duration: `${duration}ms`,
        });

        // 工具執行錯誤：返回帶有 isError 的結果
        return {
          content: [
            {
              type: "text",
              text: `❌ 搜索失敗: ${(error as Error).message}\n\n💡 建議：\n- 檢查網路連接\n- 嘗試簡化搜索詞\n- 稍後重試`,
            },
          ],
          isError: true,
          structuredContent: {
            totalResults: 0,
            query: args.query || "",
            results: [],
            searchOptions: {
              language,
              safeSearch,
              timeRange,
            },
          },
        };
      }
    } catch (error) {
      // 協議錯誤：直接拋出異常
      if (error instanceof ValidationError) {
        throw new Error(`Invalid search parameters: ${error.message}`);
      }
      if (error instanceof RateLimitError) {
        throw new Error(`Rate limit exceeded: ${error.message}`);
      }
      
      // 其他協議錯誤
      throw new Error(`Search request failed: ${(error as Error).message}`);
    }
  }

  /**
   * 處理網頁獲取請求
   */
  private async handleFetch(args: any) {
    try {
      const validated = InputValidator.validateFetchRequest(args, {
        format: this.config.fetch.defaultFormat,
        useSPA: this.config.fetch.defaultUseSPA,
        useReadability: this.config.fetch.defaultUseReadability,
      });

      // 檢查速率限制
      await this.rateLimiter.checkLimit();

      this.logger.info("執行網頁獲取", {
        url: this.sanitizeUrl(validated.url),
        format: validated.format,
        maxLength: validated.maxLength,
        useSPA: validated.useSPA,
      });

      const startTime = Date.now();

      try {
        // 執行獲取 - 根據 useSPA 選擇方法
        let result: any;

        if (validated.useSPA) {
          try {
            // 嘗試使用 SPA 模式
            result = await this.fetcher.fetchSPAWebpage({
              url: validated.url,
              format: validated.format as any,
              maxLength: validated.maxLength,
              startIndex: validated.startIndex,
              timeout: validated.timeout,
              headers: validated.headers,
              useReadability: validated.useReadability,
              respectRobots: validated.respectRobots,
              includeImages: validated.includeImages,
              waitUntil: validated.waitUntil as
                | "load"
                | "domcontentloaded"
                | "networkidle"
                | "commit",
            });
          } catch (spaError) {
            // SPA 模式失敗，降級到標準模式
            this.logger.warn("SPA 模式失敗，降級到標準模式", {
              url: validated.url,
              error:
                spaError instanceof Error ? spaError.message : String(spaError),
            });

            result = await this.fetcher.fetchWebpage({
              url: validated.url,
              format: validated.format as any,
              maxLength: validated.maxLength,
              startIndex: validated.startIndex,
              timeout: validated.timeout,
              headers: validated.headers,
              useReadability: validated.useReadability,
              respectRobots: validated.respectRobots,
              includeImages: validated.includeImages,
            });
          }
        } else {
          // 使用標準模式
          result = await this.fetcher.fetchWebpage({
            url: validated.url,
            format: validated.format as any,
            maxLength: validated.maxLength,
            startIndex: validated.startIndex,
            timeout: validated.timeout,
            headers: validated.headers,
            useReadability: validated.useReadability,
            respectRobots: validated.respectRobots,
            includeImages: validated.includeImages,
          });
        }

        const duration = Date.now() - startTime;

        this.logger.info("網頁獲取完成", {
          url: this.sanitizeUrl(validated.url),
          format: result.format,
          contentLength: result.content.length,
          imageCount: result.images?.length || 0,
          duration: `${duration}ms`,
        });

        return this.formatFetchResult(result);
      } catch (error) {
        this.logger.error("網頁獲取執行失敗", error as Error, {
          url: this.sanitizeUrl(validated.url),
          args: this.sanitizeFetchArgs(args),
        });

        // 工具執行錯誤：返回帶有 isError 的結果
        return {
          content: [
            {
              type: "text",
              text: `❌ 網頁獲取失敗: ${(error as Error).message}\n\n💡 建議：\n- 檢查 URL 是否正確\n- 確認網站是否可訪問\n- 嘗試設置 useSPA: false 參數（針對靜態網站）\n- 嘗試設置 useSPA: true 參數（針對 SPA 網站）`,
            },
          ],
          isError: true,
          structuredContent: {
            success: false,
            url: validated.url || args.url || "",
            format: validated.format || "unknown",
            contentLength: 0,
            timestamp: new Date().toISOString(),
            error: (error as Error).message,
          },
        };
      }
    } catch (error) {
      // 協議錯誤：直接拋出異常
      if (error instanceof ValidationError) {
        throw new Error(`Invalid fetch parameters: ${error.message}`);
      }
      if (error instanceof RateLimitError) {
        throw new Error(`Rate limit exceeded: ${error.message}`);
      }
      
      // 其他協議錯誤
      throw new Error(`Fetch request failed: ${(error as Error).message}`);
    }
  }

  /**
   * 處理批量搜索請求
   */
  private async handleBatchSearch(args: any) {
    try {
      // 輸入驗證
      const queries = this.validateBatchQueries(args.queries);
      const count = Math.min(args.count || 5, 20); // 批量搜索時限制更低
      const language = args.language || this.config.search.defaultLanguage;
      const safeSearch = args.safe_search || this.config.search.defaultSafeSearch;
      const timeRange = args.time_range;

      const maxConcurrency = this.calculateOptimalConcurrency(queries.length);
      const queryDelay = this.calculateQueryDelay(queries.length);

      // 檢查速率限制
      await this.rateLimiter.checkLimit();

      const startTime = Date.now();

      try {
        const results = await this.searcher.batchSearch(queries, {
          count,
          language,
          safeSearch: safeSearch as "strict" | "moderate" | "off",
          timeRange: timeRange as "day" | "week" | "month" | "year" | undefined,
          maxConcurrency,
          queryDelay,
        });

        const duration = Date.now() - startTime;
        const stats = this.calculateBatchStats(results, duration);

        this.logger.info("批量搜索完成", {
          queryCount: queries.length,
          ...stats,
        });

        return this.formatBatchSearchResults(results, stats);
      } catch (error) {
        const duration = Date.now() - startTime;

        this.logger.error("批量搜索執行失敗", error as Error, {
          queryCount: queries.length,
          duration: `${duration}ms`,
        });

        // 工具執行錯誤：返回帶有 isError 的結果
        const emptyStats = {
          total: queries.length,
          success: 0,
          failed: queries.length,
          totalDuration: duration,
          averageDuration: 0,
          successRate: 0,
        };

        const emptyResults = queries.map((query, index) => ({
          query,
          success: false,
          results: [],
          error: (error as Error).message,
          duration: 0,
          index,
        }));

        return {
          content: [
            {
              type: "text",
              text: `❌ 批量搜索失敗: ${(error as Error).message}\n\n💡 建議：\n- 檢查網路連接\n- 減少查詢數量\n- 稍後重試`,
            },
          ],
          isError: true,
          structuredContent: {
            statistics: {
              totalQueries: emptyStats.total,
              successfulQueries: emptyStats.success,
              failedQueries: emptyStats.failed,
              totalResults: 0,
              totalDuration: emptyStats.totalDuration,
              averageDuration: emptyStats.averageDuration,
              successRate: emptyStats.successRate,
            },
            results: emptyResults.map(result => ({
              query: result.query,
              success: result.success,
              results: result.results,
              error: result.error,
              duration: result.duration,
              index: result.index,
            })),
          },
        };
      }
    } catch (error) {
      // 協議錯誤：直接拋出異常
      if (error instanceof ValidationError) {
        throw new Error(`Invalid batch search parameters: ${error.message}`);
      }
      if (error instanceof RateLimitError) {
        throw new Error(`Rate limit exceeded: ${error.message}`);
      }
      
      // 其他協議錯誤
      throw new Error(`Batch search request failed: ${(error as Error).message}`);
    }
  }

  /**
   * 處理批量網頁獲取請求
   */
  private async handleBatchFetch(args: any) {
    try {
      // 輸入驗證
      const urls = this.validateBatchUrls(args.urls);

      const options = {
        format: args.format || this.config.fetch.defaultFormat,
        maxLength: Math.min(args.maxLength || 8000, 50000),
        timeout: 45000, // 固定超時時間
        useSPA: args.useSPA !== undefined ? args.useSPA : this.config.fetch.defaultUseSPA,
        waitUntil: "domcontentloaded" as const, // 固定等待條件
        debug: false, // 固定禁用調試
        useReadability: args.useReadability !== undefined ? args.useReadability : this.config.fetch.defaultUseReadability,
        userAgentMode: args.userAgentMode || 'dynamic',
        customUserAgent: args.customUserAgent,
        respectRobots: true,
        includeImages: false, // 批量處理時禁用圖片提取
      };

      // 檢查速率限制
      await this.rateLimiter.checkLimit();

      const startTime = Date.now();

      try {
        const results = await this.fetcher.batchFetch(
          urls,
          options as Omit<FetchOptions, "url">,
        );

        const duration = Date.now() - startTime;
        const stats = this.calculateBatchFetchStats(results, duration);

        this.logger.info("批量獲取完成", {
          urlCount: urls.length,
          ...stats,
        });

        return this.formatBatchFetchResults(results, stats, options.format);
      } catch (error) {
        const duration = Date.now() - startTime;

        this.logger.error("批量獲取執行失敗", error as Error, {
          urlCount: urls.length,
          duration: `${duration}ms`,
        });

        // 工具執行錯誤：返回帶有 isError 的結果
        const emptyStats = {
          total: urls.length,
          success: 0,
          failed: urls.length,
          totalDuration: duration,
          averageDuration: 0,
          successRate: 0,
        };

        const emptyResults = urls.map((url, index) => ({
          url,
          success: false,
          result: {
            success: false,
            content: "",
            error: (error as Error).message,
            format: options.format,
            title: undefined,
            originalLength: undefined,
            publishedDate: undefined,
            modifiedDate: undefined,
          },
          duration: 0,
          index,
        }));

        return {
          content: [
            {
              type: "text",
              text: `❌ 批量獲取失敗: ${(error as Error).message}\n\n💡 建議：\n- 檢查網路連接\n- 減少 URL 數量\n- 確認所有 URL 都可以訪問\n- 稍後重試`,
            },
          ],
          isError: true,
          structuredContent: {
            statistics: {
              totalUrls: emptyStats.total,
              successfulFetches: emptyStats.success,
              failedFetches: emptyStats.failed,
              totalDuration: emptyStats.totalDuration,
              averageDuration: emptyStats.averageDuration,
              successRate: emptyStats.successRate,
            },
            results: emptyResults.map(result => ({
              url: result.url,
              success: result.success,
              title: result.result.title,
              format: result.result.format,
              contentLength: result.result.content?.length || 0,
              originalLength: result.result.originalLength,
              publishedDate: result.result.publishedDate,
              modifiedDate: result.result.modifiedDate,
              error: result.result.error,
              duration: result.duration,
              index: result.index,
            })),
          },
        };
      }
    } catch (error) {
      // 協議錯誤：直接拋出異常
      if (error instanceof ValidationError) {
        throw new Error(`Invalid batch fetch parameters: ${error.message}`);
      }
      if (error instanceof RateLimitError) {
        throw new Error(`Rate limit exceeded: ${error.message}`);
      }
      
      // 其他協議錯誤
      throw new Error(`Batch fetch request failed: ${(error as Error).message}`);
    }
  }

  // 保持所有現有的輔助方法不變
  private validateBatchQueries(queries: any): string[] {
    if (!Array.isArray(queries)) {
      throw new Error("查詢列表必須是陣列");
    }

    if (queries.length === 0) {
      throw new Error("查詢列表不能為空");
    }

    if (queries.length > 5) {
      throw new Error("最多只能同時搜索 5 個查詢");
    }

    const validQueries = queries.filter(
      (q) => typeof q === "string" && q.trim().length > 0,
    );

    if (validQueries.length === 0) {
      throw new Error("沒有有效的查詢字串");
    }

    return validQueries.map((q) => q.trim());
  }

  private calculateBatchStats(
    results: BatchSearchResult[],
    totalDuration: number,
  ): BatchStats {
    const total = results.length;
    const success = results.filter((r) => r.success).length;
    const failed = total - success;
    const averageDuration = Math.round(
      results.reduce((sum, r) => sum + r.duration, 0) / total,
    );
    const successRate = Math.round((success / total) * 100);

    return {
      total,
      success,
      failed,
      totalDuration,
      averageDuration,
      successRate,
    };
  }

  private formatBatchSearchResults(
    results: BatchSearchResult[],
    stats: BatchStats,
  ) {
    // 計算總結果數
    const totalResults = results.reduce(
      (sum, r) => sum + (r.success ? r.results.length : 0),
      0,
    );

    // 建立結構化輸出
    const structuredOutput: BatchSearchStructuredOutput = {
      statistics: {
        totalQueries: stats.total,
        successfulQueries: stats.success,
        failedQueries: stats.failed,
        totalResults,
        totalDuration: stats.totalDuration,
        averageDuration: stats.averageDuration,
        successRate: stats.successRate,
      },
      results: results.map(result => ({
        query: result.query,
        success: result.success,
        results: result.results.map(r => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet,
          publishedDate: r.publishedDate,
          modifiedDate: r.modifiedDate,
          language: r.language,
          source: r.source,
        })),
        error: result.error,
        duration: result.duration,
        index: result.index,
      })),
    };

    if (totalResults === 0) {
      return {
        content: [
          {
            type: "text",
            text: "🔍 未找到相關搜索結果。\n\n💡 建議：\n- 嘗試使用不同的關鍵詞\n- 檢查拼寫是否正確\n- 使用更通用的搜索詞",
          },
        ],
        structuredContent: structuredOutput,
      };
    }

    let formattedText = `找到 ${stats.total} 個查詢的搜索結果：\n\n`;

    results.forEach((result, queryIndex) => {
      formattedText += `查詢 ${queryIndex + 1}: "${result.query}"\n`;

      if (result.success && result.results.length > 0) {
        result.results.forEach((searchResult, resultIndex) => {
          const number = (resultIndex + 1).toString().padStart(2, " ");

          formattedText += `${number}. **${searchResult.title}**\n`;
          formattedText += `    URL: ${searchResult.url}\n`;
          formattedText += `    摘要: ${searchResult.snippet}\n`;

          // 智能日期顯示邏輯
          if (searchResult.publishedDate && searchResult.modifiedDate) {
            if (searchResult.publishedDate === searchResult.modifiedDate) {
              formattedText += `    發布日期: ${searchResult.publishedDate}\n`;
            } else {
              formattedText += `    修改日期: ${searchResult.modifiedDate}\n`;
            }
          } else if (searchResult.publishedDate) {
            formattedText += `    發布日期: ${searchResult.publishedDate}\n`;
          } else if (searchResult.modifiedDate) {
            formattedText += `    修改日期: ${searchResult.modifiedDate}\n`;
          }

          formattedText += "\n";
        });
      } else if (!result.success) {
        formattedText += `❌ 搜索失敗: ${result.error || "未知錯誤"}\n\n`;
      } else {
        formattedText += `未找到相關內容\n\n`;
      }

      // 查詢間分隔
      if (queryIndex < results.length - 1) {
        formattedText += "---\n\n";
      }
    });

    return {
      content: [
        {
          type: "text",
          text: formattedText,
        },
      ],
      structuredContent: structuredOutput,
    };
  }

  private validateBatchUrls(urls: any): string[] {
    if (!Array.isArray(urls)) {
      throw new Error("URL 列表必須是陣列");
    }

    if (urls.length === 0) {
      throw new Error("URL 列表不能為空");
    }

    if (urls.length > 10) {
      throw new Error("最多只能同時獲取 10 個網頁");
    }

    const validUrls = urls.filter((url) => {
      if (typeof url !== "string") {
        return false;
      }
      try {
        new URL(url);
        return true;
      } catch {
        return false;
      }
    });

    if (validUrls.length === 0) {
      throw new Error("沒有有效的 URL");
    }

    return validUrls;
  }

  private calculateBatchFetchStats(
    results: BatchFetchResult[],
    totalDuration: number,
  ): BatchStats {
    const total = results.length;
    const success = results.filter((r) => r.success).length;
    const failed = total - success;
    const averageDuration = Math.round(
      results.reduce((sum, r) => sum + r.duration, 0) / total,
    );
    const successRate = Math.round((success / total) * 100);

    return {
      total,
      success,
      failed,
      totalDuration,
      averageDuration,
      successRate,
    };
  }

  private formatBatchFetchResults(
    results: BatchFetchResult[],
    stats: BatchStats,
    format?: string,
  ) {
    // 記錄詳細統計到日誌，保持輸出簡潔
    this.logger.info("批量獲取統計", {
      total: stats.total,
      success: stats.success,
      failed: stats.failed,
      successRate: stats.successRate,
      totalDuration: stats.totalDuration,
      averageDuration: stats.averageDuration,
    });

    // 建立結構化輸出
    const structuredOutput: BatchFetchStructuredOutput = {
      statistics: {
        totalUrls: stats.total,
        successfulFetches: stats.success,
        failedFetches: stats.failed,
        totalDuration: stats.totalDuration,
        averageDuration: stats.averageDuration,
        successRate: stats.successRate,
      },
      results: results.map(result => ({
        url: result.url,
        success: result.success,
        title: result.result.title,
        format: result.result.format || format || "unknown",
        contentLength: result.result.content?.length || 0,
        originalLength: result.result.originalLength,
        publishedDate: result.result.publishedDate,
        modifiedDate: result.result.modifiedDate,
        error: result.result.error,
        duration: result.duration,
        index: result.index,
      })),
    };

    // 檢查是否為 JSON 格式
    let combinedResults: string;
    
    if (format === 'json') {
      // JSON 格式：返回結果陣列
      const jsonResults = results.map((result) => {
        if (result.success && result.result.content) {
          // 成功的結果
          if (result.result.format === 'json') {
            // JSON 格式：直接解析已經是 JSON 字符串的內容
            try {
              const parsed = JSON.parse(result.result.content);
              // 確保解析後的物件包含所有必要欄位，特別是發布時間
              return parsed;
            } catch (parseError) {
              // 嘗試修復破壞的 JSON
              const repairedJson = this.attemptJsonRepair(result.result.content);
              if (repairedJson) {
                return repairedJson;
              }
              
              // 如果修復失敗，嘗試從原始內容中提取關鍵資訊
              const extractedData = this.extractDataFromBrokenJson(result.result.content);
              
              return {
                title: result.result.title || extractedData.title || "無標題",
                url: result.url,
                published_at: extractedData.published_at,
                content: extractedData.content || "JSON 解析失敗，無法提取內容",
                note: `JSON 解析失敗: ${parseError instanceof Error ? parseError.message : String(parseError)}。已嘗試提取部分資訊。`
              };
            }
          } else {
            // 非 JSON 格式的結果：包裝成 JSON 物件
            return {
              title: result.result.title || "無標題",
              url: result.url,
              content: result.result.content
            };
          }
        } else {
          // 失敗的結果
          return {
            url: result.url,
            error: result.result.error || "未知錯誤"
          };
        }
      });
      
      combinedResults = JSON.stringify(jsonResults, null, 2);
    } else {
      // 其他格式：使用原始的包裝格式
      const webpageResults = results
        .map((result, index) => {
          const webpageNumber = index + 1;

          if (result.success && result.result.content) {
            // 成功的結果
            const title = result.result.title || "無標題";
            const contentLength = (
              result.result.originalLength || result.result.content.length
            ).toLocaleString();

            let content = `網頁 ${webpageNumber}: "${title}"\n`;
            content += `URL: ${result.url}\n`;
            
            // 添加日期信息（在 URL 和網頁完整長度之間）
            if (result.result.publishedDate) {
              content += `發布日期: ${result.result.publishedDate}\n`;
            }
            
            if (result.result.modifiedDate) {
              content += `修改日期: ${result.result.modifiedDate}\n`;
            }
            
            content += `網頁完整長度: ${contentLength} 字符\n`;
            content += `內容:\n`;
            content += result.result.content;

            return content;
          } else {
            // 失敗的結果
            let content = `網頁 ${webpageNumber}: "錯誤"\n`;
            content += `❌ 網頁獲取失敗: ${result.result.error || "未知錯誤"}\n`;
            content += `URL: ${result.url}\n\n`;
            content += `💡 建議：\n`;
            content += `- 檢查 URL 是否正確\n`;
            content += `- 確認網站是否可訪問\n`;
            content += `- 嘗試設置 useSPA: false 參數（針對靜態網站）`;

            return content;
          }
        })
        .join("\n\n---\n\n");
      
      combinedResults = webpageResults;
    }

    return {
      content: [
        {
          type: "text",
          text: combinedResults,
        },
      ],
      structuredContent: structuredOutput,
    };
  }

  private sanitizeBatchUrls(urls: any[]): string[] {
    if (!Array.isArray(urls)) {
      return ["[無效格式]"];
    }
    return urls.map((url) =>
      typeof url === "string" ? this.sanitizeUrl(url) : "[無效URL]",
    );
  }

  private attemptJsonRepair(brokenJson: string): any | null {
    try {
      // 嘗試基本修復：添加缺失的結束大括號
      let repaired = brokenJson.trim();
      
      // 計算大括號平衡
      let openBraces = 0;
      for (const char of repaired) {
        if (char === '{') {openBraces++;}
        else if (char === '}') {openBraces--;}
      }
      
      // 如果缺少結束大括號，添加它們
      if (openBraces > 0) {
        repaired += '}'.repeat(openBraces);
        return JSON.parse(repaired);
      }
      
      // 嘗試移除尾部的不完整內容
      const lastValidJson = repaired.lastIndexOf('"}');
      if (lastValidJson > 0) {
        repaired = repaired.substring(0, lastValidJson + 2) + '}';
        return JSON.parse(repaired);
      }
      
      return null;
    } catch {
      return null;
    }
  }

  private extractDataFromBrokenJson(brokenJson: string): {
    title?: string;
    published_at?: string;
    content?: string;
  } {
    const data: any = {};
    
    // 提取標題
    const titleMatch = brokenJson.match(/"title"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/);
    if (titleMatch) {
      data.title = titleMatch[1].replace(/\\"/g, '"');
    }
    
    // 提取發布時間
    const publishedMatch = brokenJson.match(/"published_at"\s*:\s*"([^"]+)"/);
    if (publishedMatch) {
      data.published_at = publishedMatch[1];
    }
    
    // 提取內容（取前1000字符）
    const contentMatch = brokenJson.match(/"content"\s*:\s*"([^"]*(?:\\.[^"]*)*)/);
    if (contentMatch) {
      let content = contentMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
      if (content.length > 1000) {
        content = content.substring(0, 1000) + "...";
      }
      data.content = content;
    }
    
    return data;
  }

  private formatFetchResult(result: any) {
    // 調試日誌
    this.logger.debug("格式化獲取結果", {
      success: result?.success,
      contentLength: result?.content?.length,
      hasError: !!result?.error,
      url: result?.url,
    });

    // 建立結構化輸出
    const structuredOutput: FetchStructuredOutput = {
      success: result?.success || false,
      url: result?.url || "",
      title: result?.title,
      description: result?.description,
      format: result?.format || "unknown",
      contentLength: result?.content?.length || 0,
      originalLength: result?.originalLength,
      publishedDate: result?.publishedDate,
      modifiedDate: result?.modifiedDate,
      language: result?.language,
      siteName: result?.siteName,
      imageCount: result?.images?.length || 0,
      timestamp: new Date().toISOString(),
      error: result?.error,
    };

    // 處理失敗情況
    if (!result?.success || result?.error) {
      const errorMessage = result?.error || "未知錯誤";
      return {
        content: [
          {
            type: "text",
            text: `❌ 網頁獲取失敗: ${errorMessage}\n\n💡 建議：\n- 檢查 URL 是否正確\n- 確認網站是否可訪問\n- 嘗試設置 useSPA: false 參數（針對靜態網站）\n- 嘗試設置 useSPA: true 參數（針對 SPA 網站）`,
          },
        ],
        structuredContent: structuredOutput,
      };
    }

    // 檢查內容是否存在
    if (!result?.content || result.content.trim().length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `⚠️ 網頁內容為空\n\nURL: ${result?.url || "Unknown"}\n\n💡 建議：\n- 該網頁可能需要 JavaScript 渲染，嘗試 useSPA: true\n- 檢查網站是否需要登錄或有訪問限制\n- 確認網站是否正常運行`,
          },
        ],
        structuredContent: structuredOutput,
      };
    }

    // JSON 格式直接返回，其他格式添加元信息
    if (result.format === 'json') {
      // JSON 格式直接返回純 JSON，不添加額外包裝
      return {
        content: [
          {
            type: "text", 
            text: result.content,
          },
        ],
        structuredContent: structuredOutput,
      };
    }

    // 其他格式的標準包裝
    let formattedText = "";

    if (result.title) {
      formattedText += `標題: ${result.title}\n`;
    }

    if (result.url) {
      formattedText += `URL: ${result.url}\n`;
    }

    // 添加時間信息（在 URL 和網頁完整長度之間）
    if (result.publishedDate) {
      formattedText += `發布時間: ${result.publishedDate}\n`;
    }
    
    if (result.modifiedDate) {
      formattedText += `修改時間: ${result.modifiedDate}\n`;
    }

    const displayLength = result.originalLength || result.content.length;

    this.logger.debug("格式化結果長度信息", {
      originalLength: result.originalLength,
      contentLength: result.content.length,
      displayLength,
    });

    formattedText += `網頁完整長度: ${displayLength} 字符\n`;

    formattedText += "內容:\n";
    formattedText += result.content;

    return {
      content: [
        {
          type: "text",
          text: formattedText,
        },
      ],
      structuredContent: structuredOutput,
    };
  }

  private sanitizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
    } catch {
      return url.length > 100 ? url.substring(0, 100) + "..." : url;
    }
  }

  private sanitizeFetchArgs(args: any): any {
    const sanitized = { ...args };

    // 移除敏感的請求頭
    if (sanitized.headers) {
      const cleanHeaders: any = {};
      for (const [key, value] of Object.entries(sanitized.headers)) {
        if (typeof key === "string" && typeof value === "string") {
          // 隱藏可能的認證資訊
          if (
            key.toLowerCase().includes("auth") ||
            key.toLowerCase().includes("token")
          ) {
            cleanHeaders[key] = "[隱藏]";
          } else {
            cleanHeaders[key] =
              value.length > 50 ? value.substring(0, 50) + "..." : value;
          }
        }
      }
      sanitized.headers = cleanHeaders;
    }

    return sanitized;
  }

  private formatSearchResults(
    results: SearchResult[],
    query: string,
    language: string,
    safeSearch: string,
    timeRange?: string
  ) {
    // 建立結構化輸出
    const structuredOutput: SearchStructuredOutput = {
      totalResults: results.length,
      query: query,
      results: results.map(result => ({
        title: result.title,
        url: result.url,
        snippet: result.snippet,
        publishedDate: result.publishedDate,
        modifiedDate: result.modifiedDate,
        language: result.language,
        source: result.source,
      })),
      searchOptions: {
        language,
        safeSearch,
        timeRange,
      },
    };

    if (results.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "🔍 未找到相關搜索結果。\n\n💡 建議：\n- 嘗試使用不同的關鍵詞\n- 檢查拼寫是否正確\n- 使用更通用的搜索詞",
          },
        ],
        structuredContent: structuredOutput,
      };
    }

    let formattedText = `找到 ${results.length} 個搜索結果：\n\n`;

    results.forEach((result, index) => {
      const number = (index + 1).toString().padStart(2, " ");

      formattedText += `${number}. **${result.title}**\n`;
      formattedText += `    URL: ${result.url}\n`;
      formattedText += `    摘要: ${result.snippet}\n`;

      // 智能日期顯示邏輯
      if (result.publishedDate && result.modifiedDate) {
        if (result.publishedDate === result.modifiedDate) {
          formattedText += `    發布日期: ${result.publishedDate}\n`;
        } else {
          formattedText += `    修改日期: ${result.modifiedDate}\n`;
        }
      } else if (result.publishedDate) {
        formattedText += `    發布日期: ${result.publishedDate}\n`;
      } else if (result.modifiedDate) {
        formattedText += `    修改日期: ${result.modifiedDate}\n`;
      }

      formattedText += "\n";
    });

    return {
      content: [
        {
          type: "text",
          text: formattedText,
        },
      ],
      structuredContent: structuredOutput,
    };
  }

  private sanitizeQuery(_query: string): string {
    return "[隱藏]";
  }

  private calculateOptimalConcurrency(queryCount: number): number {
    // 基於測試結果優化的並發策略
    if (queryCount === 1) {
      return 1;
    }
    if (queryCount === 2) {
      return 2;
    }
    if (queryCount <= 3) {
      return 2;
    } // 3個查詢時保持穩定
    if (queryCount === 4) {
      return 2;
    } // 4個查詢時保守並發
    if (queryCount === 5) {
      return 3;
    } // 5個查詢時提升並發以改善性能

    return Math.min(Math.ceil(queryCount / 2), 3); // 大量查詢時最大並發為3
  }

  private calculateQueryDelay(queryCount: number): number {
    // 平衡性能與反爬蟲檢測的優化延遲策略
    if (queryCount === 1) {
      return 0;
    }
    if (queryCount === 2) {
      return 300;
    } // 0.3秒
    if (queryCount === 3) {
      return 500;
    } // 0.5秒
    if (queryCount === 4) {
      return 700;
    } // 0.7秒，稍微降低
    if (queryCount === 5) {
      return 800;
    } // 0.8秒，顯著降低以提升性能
    if (queryCount >= 6) {
      return 1000;
    } // 1.0秒，大量查詢時適度延遲

    return 300; // 預設延遲
  }

  /**
   * 啟動 MCP 伺服器
   */
  async run(): Promise<void> {
    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
    } catch (error) {
      this.logger.error("伺服器啟動失敗", error as Error);
      throw error;
    }
  }
}

/**
 * 主函數：啟動 DuckDuckGo MCP 伺服器
 */
async function main() {
  try {
    const server = new DuckDuckGoMCPServer();
    await server.run();
  } catch (error) {
    process.stderr.write(`伺服器啟動失敗: ${error}\n`);
    process.exit(1);
  }
}

main();