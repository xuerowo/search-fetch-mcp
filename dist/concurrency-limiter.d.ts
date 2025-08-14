import { Logger } from "./logger.js";
/**
 * 並行控制器
 */
export declare class ConcurrencyLimiter {
    readonly maxConcurrency: number;
    private running;
    private queue;
    private completedCount;
    private failedCount;
    private totalDuration;
    private logger;
    private recentFailures;
    private baseDelay;
    constructor(maxConcurrency?: number, logger?: Logger);
    execute<T>(task: () => Promise<T>, priority?: TaskPriority, taskName?: string): Promise<T>;
    /**
     * 批量執行任務，返回所有結果
     */
    executeAll<T>(tasks: Array<{
        task: () => Promise<T>;
        name?: string;
        priority?: TaskPriority;
    }>, options?: BatchExecuteOptions): Promise<BatchResult<T>[]>;
    /**
     * 將任務加入隊列（按優先級排序）
     */
    private addToQueue;
    /**
     * 處理隊列，執行下一個任務
     */
    private processQueue;
    /**
     * 獲取當前統計信息
     */
    getStats(): ConcurrencyStats;
    /**
     * 記錄失敗（用於智能退避）
     */
    private recordFailure;
    /**
     * 計算智能退避延遲
     */
    getBackoffDelay(): number;
    /**
     * 重置統計信息
     */
    resetStats(): void;
    /**
     * 等待所有任務完成
     */
    waitForCompletion(): Promise<void>;
    /**
     * 清理隊列（取消等待中的任務）
     */
    clearQueue(): number;
}
/**
 * 任務優先級
 */
export type TaskPriority = "high" | "normal" | "low";
/**
 * 批量執行選項
 */
export interface BatchExecuteOptions {
    /** 是否在第一個失敗時停止 */
    failFast?: boolean;
    /** 單個任務超時時間（毫秒） */
    timeout?: number;
    /** 進度回調 */
    onProgress?: (completed: number, total: number, error: Error | null) => void;
}
/**
 * 批量執行結果
 */
export interface BatchResult<T> {
    success: boolean;
    result?: T;
    error?: Error;
    duration: number;
    taskName: string;
    index: number;
}
/**
 * 並行統計信息
 */
export interface ConcurrencyStats {
    running: number;
    queued: number;
    completed: number;
    failed: number;
    averageDuration: number;
    maxConcurrency: number;
}
/**
 * 創建並行控制器的工廠函數
 */
export declare function createConcurrencyLimiter(maxConcurrency?: number, logger?: Logger): ConcurrencyLimiter;
//# sourceMappingURL=concurrency-limiter.d.ts.map