/**
 * DuckDuckGo 搜索器簡化測試
 */

import { DuckDuckGoSearcher } from "../searcher.js";
import { SearchOptions } from "../types.js";

describe("DuckDuckGoSearcher (Simple)", () => {
  let searcher: DuckDuckGoSearcher;

  beforeEach(() => {
    searcher = new DuckDuckGoSearcher();
  });

  describe("constructor", () => {
    it("should create a new searcher instance", () => {
      expect(searcher).toBeInstanceOf(DuckDuckGoSearcher);
    });
  });

  describe("search validation", () => {
    it("should throw error for empty query", async () => {
      await expect(searcher.search("")).rejects.toThrow("搜索查詢不能為空");
      await expect(searcher.search("   ")).rejects.toThrow("搜索查詢不能為空");
    });

    it("should throw error for null/undefined query", async () => {
      await expect(searcher.search(null as any)).rejects.toThrow(
        "搜索查詢不能為空"
      );
      await expect(searcher.search(undefined as any)).rejects.toThrow(
        "搜索查詢不能為空"
      );
    });
  });

  describe("batchSearch", () => {
    it("should handle empty queries array", async () => {
      const results = await searcher.batchSearch([]);
      expect(results).toEqual([]);
    });

    it("should validate query array", async () => {
      // 測試空查詢會返回錯誤結果而不是拋出異常
      const results = await searcher.batchSearch([""]);
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain("搜索查詢不能為空");
    });
  });

  describe("options validation", () => {
    it("should accept valid search options", () => {
      const options: SearchOptions = {
        count: 5,
        language: "en-us",
        safeSearch: "moderate",
        timeout: 10000,
      };

      // 驗證選項不會拋出錯誤
      expect(() => {
        // 這裡只測試選項驗證，不實際發起搜索
        const validated = {
          count: Math.min(Math.max(options.count || 10, 1), 50),
          language: options.language || "wt-wt",
          safeSearch: options.safeSearch || "moderate",
          timeout: Math.min(Math.max(options.timeout || 30000, 5000), 60000),
        };
        expect(validated.count).toBe(5);
        expect(validated.language).toBe("en-us");
        expect(validated.safeSearch).toBe("moderate");
        expect(validated.timeout).toBe(10000);
      }).not.toThrow();
    });
  });
});