import { RateLimitConfig } from "./types.js";
/**
 * 簡化速率限制器 - 只限制每秒請求數
 */
export declare class RateLimiter {
    private config;
    private requests;
    constructor(config: RateLimitConfig);
    checkLimit(): Promise<void>;
    getStatus(): {
        perSecond: {
            current: number;
            limit: number;
            remaining: number;
        };
    };
    /**
     * 驗證配置
     */
    private validateConfig;
    /**
     * 手動重置計數器（用於測試）
     */
    reset(): void;
    /**
     * 更新配置
     */
    updateConfig(newConfig: Partial<RateLimitConfig>): void;
}
//# sourceMappingURL=rate-limiter.d.ts.map