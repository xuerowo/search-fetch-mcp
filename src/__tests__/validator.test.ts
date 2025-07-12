/**
 * 輸入驗證器測試
 */

import { InputValidator } from "../validator.js";
import { ValidationError } from "../types.js";

describe("InputValidator", () => {
  describe("validateQuery", () => {
    it("should accept valid queries", () => {
      const validQueries = [
        "test query",
        "JavaScript programming",
        "如何學習 Python",
        "12345",
        "a".repeat(100) + " valid long query " + "b".repeat(100), // Maximum length without triggering DoS detection
      ];

      validQueries.forEach((query) => {
        try {
          expect(() => InputValidator.validateQuery(query)).not.toThrow();
          const result = InputValidator.validateQuery(query);
          expect(result).toBe(query.trim().replace(/\s+/g, " ")); // 期望清理後的結果
        } catch (error) {
          console.log(
            "Failed query:",
            query,
            "Error:",
            (error as Error).message,
          );
          throw error;
        }
      });
    });

    it("should trim whitespace from queries", () => {
      const queries = [
        "  test query  ",
        "\n\tJavaScript\n\t",
        "   spaced   query   ",
      ];

      queries.forEach((query) => {
        const result = InputValidator.validateQuery(query);
        expect(result).toBe(query.trim().replace(/\s+/g, " ")); // 期望清理後的結果
        expect(result).not.toContain("  "); // No double spaces at ends
      });
    });

    it("should reject null/undefined queries", () => {
      expect(() => InputValidator.validateQuery(null)).toThrow(ValidationError);
      expect(() => InputValidator.validateQuery(undefined)).toThrow(
        ValidationError,
      );

      try {
        InputValidator.validateQuery(null);
      } catch (error) {
        expect((error as any).field).toBe("query");
        expect((error as any).message).toContain("必需的");
      }
    });

    it("should reject non-string queries", () => {
      const invalidQueries = [123, [], {}, true, false];

      invalidQueries.forEach((query) => {
        expect(() => InputValidator.validateQuery(query)).toThrow(
          ValidationError,
        );

        try {
          InputValidator.validateQuery(query);
        } catch (error) {
          expect((error as any).field).toBe("query");
          expect((error as any).message).toContain("字符串");
        }
      });
    });

    it("should reject empty queries", () => {
      const emptyQueries = ["", "   ", "\n\t\r", "    \n    "];

      emptyQueries.forEach((query) => {
        expect(() => InputValidator.validateQuery(query)).toThrow(
          ValidationError,
        );

        try {
          InputValidator.validateQuery(query);
        } catch (error) {
          expect((error as any).field).toBe("query");
          expect((error as any).message).toContain("不能為空");
        }
      });
    });

    it("should reject queries that are too long", () => {
      const longQuery = "a".repeat(501);

      expect(() => InputValidator.validateQuery(longQuery)).toThrow(
        ValidationError,
      );

      try {
        InputValidator.validateQuery(longQuery);
      } catch (error) {
        expect((error as any).field).toBe("query");
        expect((error as any).message).toContain("500 字符");
      }
    });

    it("should reject malicious content", () => {
      const maliciousQueries = [
        '<script>alert("xss")</script>',
        "javascript: alert(1)",
        "' union select * from users",
        "a".repeat(201), // DoS attack pattern
      ];

      maliciousQueries.forEach((query) => {
        expect(() => InputValidator.validateQuery(query)).toThrow(
          ValidationError,
        );

        try {
          InputValidator.validateQuery(query);
        } catch (error) {
          expect((error as any).field).toBe("query");
          expect((error as any).message).toContain("不允許的內容");
        }
      });
    });
  });

  describe("validateCount", () => {
    it("should return default value for null/undefined", () => {
      expect(InputValidator.validateCount(null)).toBe(10);
      expect(InputValidator.validateCount(undefined)).toBe(10);
    });

    it("should accept valid numbers", () => {
      const validCounts = [1, 5, 10, 25, 50];

      validCounts.forEach((count) => {
        expect(InputValidator.validateCount(count)).toBe(count);
      });
    });

    it("should accept valid string numbers", () => {
      const validStringCounts = ["1", "5", "10", "25", "50"];

      validStringCounts.forEach((count) => {
        expect(InputValidator.validateCount(count)).toBe(parseInt(count, 10));
      });
    });

    it("should floor decimal numbers", () => {
      expect(InputValidator.validateCount(5.7)).toBe(5);
      expect(InputValidator.validateCount(10.9)).toBe(10);
      expect(InputValidator.validateCount("15.3")).toBe(15);
    });

    it("should respect custom max count", () => {
      expect(InputValidator.validateCount(20, 25)).toBe(20);
      expect(() => InputValidator.validateCount(30, 25)).toThrow(
        ValidationError,
      );
    });

    it("should reject invalid types", () => {
      const invalidCounts = [[], {}, true, false];

      invalidCounts.forEach((count) => {
        expect(() => InputValidator.validateCount(count)).toThrow(
          ValidationError,
        );

        try {
          InputValidator.validateCount(count);
        } catch (error) {
          expect((error as any).field).toBe("count");
          expect((error as any).message).toContain("數字");
        }
      });
    });

    it("should reject invalid string numbers", () => {
      const invalidStringCounts = ["abc", "12abc", "", "  "];

      invalidStringCounts.forEach((count) => {
        expect(() => InputValidator.validateCount(count)).toThrow(
          ValidationError,
        );

        try {
          InputValidator.validateCount(count);
        } catch (error) {
          expect((error as any).field).toBe("count");
          expect((error as any).message).toContain("有效數字");
        }
      });
    });

    it("should reject numbers below minimum", () => {
      const invalidCounts = [0, -1, -10];

      invalidCounts.forEach((count) => {
        expect(() => InputValidator.validateCount(count)).toThrow(
          ValidationError,
        );

        try {
          InputValidator.validateCount(count);
        } catch (error) {
          expect((error as any).field).toBe("count");
          expect((error as any).message).toContain("至少為 1");
        }
      });
    });

    it("should reject numbers above maximum", () => {
      expect(() => InputValidator.validateCount(51)).toThrow(ValidationError);
      expect(() => InputValidator.validateCount(100)).toThrow(ValidationError);

      try {
        InputValidator.validateCount(51);
      } catch (error) {
        expect((error as any).field).toBe("count");
        expect((error as any).message).toContain("不能超過 50");
      }
    });
  });

  describe("validateLanguage", () => {
    it("should return default value for null/undefined", () => {
      expect(InputValidator.validateLanguage(null)).toBe("wt-wt");
      expect(InputValidator.validateLanguage(undefined)).toBe("wt-wt");
    });

    it("should accept valid language codes", () => {
      const validLanguages = ["wt-wt", "us-en", "tw-tzh", "cn-zh", "jp-jp"];

      validLanguages.forEach((lang) => {
        expect(() => InputValidator.validateLanguage(lang)).not.toThrow();
        expect(InputValidator.validateLanguage(lang)).toBe(lang.toLowerCase());
      });
    });

    it("should normalize language codes to lowercase", () => {
      const mixedCaseCodes = ["US-EN", "Tw-Tzh", "CN-ZH"];

      mixedCaseCodes.forEach((lang) => {
        expect(InputValidator.validateLanguage(lang)).toBe(lang.toLowerCase());
      });
    });

    it("should trim whitespace from language codes", () => {
      expect(InputValidator.validateLanguage("  us-en  ")).toBe("us-en");
      expect(InputValidator.validateLanguage("\nus-en\t")).toBe("us-en");
    });

    it("should reject non-string language codes", () => {
      const invalidTypes = [123, [], {}, true, false];

      invalidTypes.forEach((lang) => {
        expect(() => InputValidator.validateLanguage(lang)).toThrow(
          ValidationError,
        );

        try {
          InputValidator.validateLanguage(lang);
        } catch (error) {
          expect((error as any).field).toBe("language");
          expect((error as any).message).toContain("字符串");
        }
      });
    });

    it("should reject unsupported language codes", () => {
      const unsupportedLanguages = ["xx-xx", "invalid", "zz-zz", "abc-def"];

      unsupportedLanguages.forEach((lang) => {
        expect(() => InputValidator.validateLanguage(lang)).toThrow(
          ValidationError,
        );

        try {
          InputValidator.validateLanguage(lang);
        } catch (error) {
          expect((error as any).field).toBe("language");
          expect((error as any).message).toContain("不支援的語言代碼");
          expect((error as any).message).toContain(lang);
        }
      });
    });
  });

  describe("validateSafeSearch", () => {
    it("should return default value for null/undefined", () => {
      expect(InputValidator.validateSafeSearch(null)).toBe("moderate");
      expect(InputValidator.validateSafeSearch(undefined)).toBe("moderate");
    });

    it("should accept valid safe search levels", () => {
      const validLevels = ["strict", "moderate", "off"];

      validLevels.forEach((level) => {
        expect(() => InputValidator.validateSafeSearch(level)).not.toThrow();
        expect(InputValidator.validateSafeSearch(level)).toBe(
          level.toLowerCase(),
        );
      });
    });

    it("should normalize safe search levels to lowercase", () => {
      const mixedCaseLevels = ["STRICT", "Moderate", "OFF"];
      const expectedLevels = ["strict", "moderate", "off"];

      mixedCaseLevels.forEach((level, index) => {
        expect(InputValidator.validateSafeSearch(level)).toBe(
          expectedLevels[index],
        );
      });
    });

    it("should trim whitespace from safe search levels", () => {
      expect(InputValidator.validateSafeSearch("  strict  ")).toBe("strict");
      expect(InputValidator.validateSafeSearch("\nmoderate\t")).toBe(
        "moderate",
      );
    });

    it("should reject non-string safe search levels", () => {
      const invalidTypes = [123, [], {}, true, false];

      invalidTypes.forEach((level) => {
        expect(() => InputValidator.validateSafeSearch(level)).toThrow(
          ValidationError,
        );

        try {
          InputValidator.validateSafeSearch(level);
        } catch (error) {
          expect((error as any).field).toBe("safeSearch");
          expect((error as any).message).toContain("字符串");
        }
      });
    });

    it("should reject invalid safe search levels", () => {
      const invalidLevels = ["high", "low", "none", "all"];

      invalidLevels.forEach((level) => {
        expect(() => InputValidator.validateSafeSearch(level)).toThrow(
          ValidationError,
        );

        try {
          InputValidator.validateSafeSearch(level);
        } catch (error) {
          expect((error as any).field).toBe("safeSearch");
          expect((error as any).message).toContain("無效的安全搜索級別");
        }
      });
    });
  });

  describe("validateTimeout", () => {
    it("should return default value for null/undefined", () => {
      expect(InputValidator.validateTimeout(null)).toBe(30000);
      expect(InputValidator.validateTimeout(undefined)).toBe(30000);
    });

    it("should accept valid timeout values", () => {
      const validTimeouts = [1000, 5000, 30000, 60000];

      validTimeouts.forEach((timeout) => {
        expect(InputValidator.validateTimeout(timeout)).toBe(timeout);
      });
    });

    it("should accept valid string timeout values", () => {
      const validStringTimeouts = ["1000", "5000", "30000"];

      validStringTimeouts.forEach((timeout) => {
        expect(InputValidator.validateTimeout(timeout)).toBe(
          parseInt(timeout, 10),
        );
      });
    });

    it("should reject invalid types", () => {
      const invalidTypes = [[], {}, true, false];

      invalidTypes.forEach((timeout) => {
        expect(() => InputValidator.validateTimeout(timeout)).toThrow(
          ValidationError,
        );

        try {
          InputValidator.validateTimeout(timeout);
        } catch (error) {
          expect((error as any).field).toBe("timeout");
          expect((error as any).message).toContain("數字");
        }
      });
    });

    it("should reject timeout values below minimum", () => {
      const invalidTimeouts = [0, -1000, 500];

      invalidTimeouts.forEach((timeout) => {
        expect(() => InputValidator.validateTimeout(timeout)).toThrow(
          ValidationError,
        );

        try {
          InputValidator.validateTimeout(timeout);
        } catch (error) {
          expect((error as any).field).toBe("timeout");
          expect((error as any).message).toContain("至少為 1000");
        }
      });
    });

    it("should reject timeout values above maximum", () => {
      const invalidTimeouts = [120001, 200000];

      invalidTimeouts.forEach((timeout) => {
        expect(() => InputValidator.validateTimeout(timeout)).toThrow(
          ValidationError,
        );

        try {
          InputValidator.validateTimeout(timeout);
        } catch (error) {
          expect((error as any).field).toBe("timeout");
          expect((error as any).message).toContain("不能超過 120000");
        }
      });
    });
  });
});
