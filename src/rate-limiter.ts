import { RateLimitConfig, RateLimitError } from "./types.js";

/**
 * 簡化速率限制器 - 只限制每秒請求數
 */
export class RateLimiter {
  private requests: number[] = [];

  constructor(private config: RateLimitConfig) {
    this.validateConfig();
  }

  async checkLimit(): Promise<void> {
    const now = Date.now();

    // 清理過期的請求記錄（1秒前）
    this.requests = this.requests.filter((time) => now - time < 1000);

    // 檢查每秒限制
    if (this.requests.length >= this.config.requestsPerSecond) {
      const oldestRequest = Math.min(...this.requests);
      const waitTime = 1000 - (now - oldestRequest);

      if (waitTime > 0) {
        throw new RateLimitError(
          `請求過於頻繁，請等待 ${Math.ceil(waitTime / 1000)} 秒`,
          Math.ceil(waitTime / 1000),
        );
      }
    }

    // 記錄此次請求
    this.requests.push(now);
  }

  getStatus() {
    const now = Date.now();
    this.requests = this.requests.filter((time) => now - time < 1000);

    return {
      perSecond: {
        current: this.requests.length,
        limit: this.config.requestsPerSecond,
        remaining: Math.max(
          0,
          this.config.requestsPerSecond - this.requests.length,
        ),
      },
    };
  }

  /**
   * 驗證配置
   */
  private validateConfig(): void {
    if (this.config.requestsPerSecond <= 0) {
      throw new Error("每秒請求數必須大於 0");
    }
  }

  /**
   * 手動重置計數器（用於測試）
   */
  reset(): void {
    this.requests = [];
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.validateConfig();
  }
}
