/**
 * 速率限制器測試
 */

import { RateLimiter } from "../rate-limiter.js";
import { RateLimitConfig, RateLimitError } from "../types.js";

describe("RateLimiter", () => {
  let rateLimiter: RateLimiter;
  let config: RateLimitConfig;

  beforeEach(() => {
    config = {
      requestsPerSecond: 2,
    };
    rateLimiter = new RateLimiter(config);
  });

  describe("constructor", () => {
    it("should create rate limiter with valid config", () => {
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
    });

    it("should throw error for invalid config", () => {
      const invalidConfigs = [
        { requestsPerSecond: 0 },
        { requestsPerSecond: -1 },
      ];

      invalidConfigs.forEach((invalidConfig) => {
        expect(() => new RateLimiter(invalidConfig)).toThrow();
      });
    });
  });

  describe("per-second rate limiting", () => {
    it("should allow requests within per-second limit", async () => {
      const limiter = new RateLimiter({ requestsPerSecond: 3 });

      // Should allow 3 requests per second
      await limiter.checkLimit(); // Should not throw
      await limiter.checkLimit(); // Should not throw
      await limiter.checkLimit(); // Should not throw

      // If we reach here, the test passes
      expect(true).toBe(true);
    });

    it("should block requests exceeding per-second limit", async () => {
      const limiter = new RateLimiter({ requestsPerSecond: 2 });

      // First 2 requests should pass
      await limiter.checkLimit(); // Should not throw
      await limiter.checkLimit(); // Should not throw

      // Third request should be blocked
      await expect(limiter.checkLimit()).rejects.toThrow(RateLimitError);
    });

    it("should reset per-second limit after time window", async () => {
      const limiter = new RateLimiter({ requestsPerSecond: 1 });

      // First request should pass
      await limiter.checkLimit(); // Should not throw

      // Second request should be blocked
      await expect(limiter.checkLimit()).rejects.toThrow(RateLimitError);

      // Wait for time window to pass
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Should allow new request after time window
      await limiter.checkLimit(); // Should not throw
    });

    it("should provide correct wait time in error", async () => {
      const limiter = new RateLimiter({ requestsPerSecond: 1 });

      await limiter.checkLimit();

      try {
        await limiter.checkLimit();
        fail("Expected RateLimitError to be thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        expect((error as RateLimitError).retryAfter).toBeGreaterThan(0);
        expect((error as RateLimitError).retryAfter).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("getStatus", () => {
    it("should return correct status information", async () => {
      const limiter = new RateLimiter({ requestsPerSecond: 3 });

      // Initial status
      let status = limiter.getStatus();
      expect(status.perSecond.current).toBe(0);
      expect(status.perSecond.limit).toBe(3);
      expect(status.perSecond.remaining).toBe(3);

      // After one request
      await limiter.checkLimit();
      status = limiter.getStatus();
      expect(status.perSecond.current).toBe(1);
      expect(status.perSecond.remaining).toBe(2);

      // After two requests
      await limiter.checkLimit();
      status = limiter.getStatus();
      expect(status.perSecond.current).toBe(2);
      expect(status.perSecond.remaining).toBe(1);
    });

    it("should clean up expired requests in status", async () => {
      const limiter = new RateLimiter({ requestsPerSecond: 2 });

      await limiter.checkLimit();
      await limiter.checkLimit();

      // Should show 2 current requests
      let status = limiter.getStatus();
      expect(status.perSecond.current).toBe(2);
      expect(status.perSecond.remaining).toBe(0);

      // Wait for requests to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Should show 0 current requests after expiration
      status = limiter.getStatus();
      expect(status.perSecond.current).toBe(0);
      expect(status.perSecond.remaining).toBe(2);
    });
  });

  describe("reset", () => {
    it("should reset all counters", async () => {
      await rateLimiter.checkLimit();
      await rateLimiter.checkLimit();

      let status = rateLimiter.getStatus();
      expect(status.perSecond.current).toBe(2);

      rateLimiter.reset();

      status = rateLimiter.getStatus();
      expect(status.perSecond.current).toBe(0);
      expect(status.perSecond.remaining).toBe(2);
    });

    it("should allow requests after reset", async () => {
      // Fill up the limit
      await rateLimiter.checkLimit();
      await rateLimiter.checkLimit();

      // Should be blocked
      await expect(rateLimiter.checkLimit()).rejects.toThrow(RateLimitError);

      // Reset and try again
      rateLimiter.reset();
      await rateLimiter.checkLimit(); // Should not throw
    });
  });

  describe("updateConfig", () => {
    it("should update configuration", () => {
      const newConfig = { requestsPerSecond: 5 };

      rateLimiter.updateConfig(newConfig);

      const status = rateLimiter.getStatus();
      expect(status.perSecond.limit).toBe(5);
    });

    it("should validate new configuration", () => {
      const invalidConfig = { requestsPerSecond: -1 };

      expect(() => rateLimiter.updateConfig(invalidConfig)).toThrow();
    });

    it("should allow partial updates", () => {
      const originalLimit = rateLimiter.getStatus().perSecond.limit;
      expect(originalLimit).toBe(2);

      // Partial update
      rateLimiter.updateConfig({ requestsPerSecond: 4 });

      const newLimit = rateLimiter.getStatus().perSecond.limit;
      expect(newLimit).toBe(4);
    });
  });

  describe("error handling", () => {
    it("should throw RateLimitError with correct message", async () => {
      const limiter = new RateLimiter({ requestsPerSecond: 1 });

      await limiter.checkLimit();

      await expect(limiter.checkLimit()).rejects.toThrow("請求過於頻繁");
    });

    it("should handle zero requests per second gracefully", () => {
      expect(() => new RateLimiter({ requestsPerSecond: 0 })).toThrow(
        "每秒請求數必須大於 0",
      );
    });

    it("should handle negative requests per second", () => {
      expect(() => new RateLimiter({ requestsPerSecond: -5 })).toThrow(
        "每秒請求數必須大於 0",
      );
    });
  });

  describe("concurrent requests", () => {
    it("should handle concurrent requests correctly", async () => {
      const limiter = new RateLimiter({ requestsPerSecond: 3 });

      const promises = [
        limiter.checkLimit(),
        limiter.checkLimit(),
        limiter.checkLimit(),
        limiter.checkLimit(), // This should fail
      ];

      const results = await Promise.allSettled(promises);

      // First 3 should succeed
      expect(results[0].status).toBe("fulfilled");
      expect(results[1].status).toBe("fulfilled");
      expect(results[2].status).toBe("fulfilled");

      // Fourth should be rejected
      expect(results[3].status).toBe("rejected");
      if (results[3].status === "rejected") {
        expect(results[3].reason).toBeInstanceOf(RateLimitError);
      }
    });
  });
});
