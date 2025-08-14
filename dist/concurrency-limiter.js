import { Logger } from "./logger.js";
/**
 * 並行控制器
 */
export class ConcurrencyLimiter {
    maxConcurrency;
    running = 0;
    queue = [];
    completedCount = 0;
    failedCount = 0;
    totalDuration = 0;
    logger;
    recentFailures = [];
    baseDelay = 1000;
    constructor(maxConcurrency = 3, logger) {
        this.maxConcurrency = maxConcurrency;
        this.logger = logger || new Logger({ level: "info", logQueries: false });
    }
    async execute(task, priority = "normal", taskName) {
        return new Promise((resolve, reject) => {
            const queueItem = {
                task: async () => {
                    const startTime = Date.now();
                    try {
                        this.running++;
                        const result = await task();
                        const duration = Date.now() - startTime;
                        this.completedCount++;
                        this.totalDuration += duration;
                        resolve(result);
                    }
                    catch (error) {
                        const duration = Date.now() - startTime;
                        this.failedCount++;
                        this.totalDuration += duration;
                        this.logger.warn(`任務執行失敗`, {
                            taskName,
                            duration,
                            error: error.message,
                        });
                        reject(error);
                    }
                    finally {
                        this.running--;
                        this.processQueue();
                    }
                },
                priority,
                taskName: taskName || "unnamed",
                addedAt: Date.now(),
            };
            if (this.running < this.maxConcurrency) {
                queueItem.task();
            }
            else {
                this.addToQueue(queueItem);
            }
        });
    }
    /**
     * 批量執行任務，返回所有結果
     */
    async executeAll(tasks, options = {}) {
        const { failFast = false, timeout, onProgress } = options;
        this.logger.info(`開始批量執行任務`, {
            taskCount: tasks.length,
            maxConcurrency: this.maxConcurrency,
            failFast,
        });
        const startTime = Date.now();
        let completedTasks = 0;
        const executeTask = async (taskInfo, index) => {
            const taskStartTime = Date.now();
            try {
                let result;
                if (timeout) {
                    // 使用超時控制
                    result = await Promise.race([
                        this.execute(taskInfo.task, taskInfo.priority, taskInfo.name || `Task-${index}`),
                        new Promise((_, reject) => setTimeout(() => reject(new Error(`Task timeout after ${timeout}ms`)), timeout)),
                    ]);
                }
                else {
                    result = await this.execute(taskInfo.task, taskInfo.priority, taskInfo.name || `Task-${index}`);
                }
                const duration = Date.now() - taskStartTime;
                completedTasks++;
                if (onProgress) {
                    onProgress(completedTasks, tasks.length, null);
                }
                return {
                    success: true,
                    result,
                    duration,
                    taskName: taskInfo.name || `Task-${index}`,
                    index,
                };
            }
            catch (error) {
                const duration = Date.now() - taskStartTime;
                completedTasks++;
                this.recordFailure();
                if (onProgress) {
                    onProgress(completedTasks, tasks.length, error);
                }
                if (failFast) {
                    throw error;
                }
                return {
                    success: false,
                    error: error,
                    duration,
                    taskName: taskInfo.name || `Task-${index}`,
                    index,
                };
            }
        };
        try {
            const results = await Promise.all(tasks.map((taskInfo, index) => executeTask(taskInfo, index)));
            const totalDuration = Date.now() - startTime;
            const successCount = results.filter((r) => r.success).length;
            this.logger.info(`批量執行完成`, {
                total: tasks.length,
                success: successCount,
                failed: tasks.length - successCount,
                totalDuration,
                averageDuration: Math.round(totalDuration / tasks.length),
            });
            // 按原始順序排序
            return results.sort((a, b) => a.index - b.index);
        }
        catch (error) {
            this.logger.error(`批量執行失敗`, error);
            throw error;
        }
    }
    /**
     * 將任務加入隊列（按優先級排序）
     */
    addToQueue(item) {
        // 按優先級插入（high > normal > low）
        const priorityOrder = { high: 3, normal: 2, low: 1 };
        const itemPriority = priorityOrder[item.priority];
        let insertIndex = this.queue.length;
        for (let i = 0; i < this.queue.length; i++) {
            const queuePriority = priorityOrder[this.queue[i].priority];
            if (itemPriority > queuePriority) {
                insertIndex = i;
                break;
            }
        }
        this.queue.splice(insertIndex, 0, item);
    }
    /**
     * 處理隊列，執行下一個任務
     */
    processQueue() {
        if (this.queue.length > 0 && this.running < this.maxConcurrency) {
            const nextItem = this.queue.shift();
            if (nextItem) {
                nextItem.task();
            }
        }
    }
    /**
     * 獲取當前統計信息
     */
    getStats() {
        return {
            running: this.running,
            queued: this.queue.length,
            completed: this.completedCount,
            failed: this.failedCount,
            averageDuration: this.completedCount > 0
                ? Math.round(this.totalDuration / this.completedCount)
                : 0,
            maxConcurrency: this.maxConcurrency,
        };
    }
    /**
     * 記錄失敗（用於智能退避）
     */
    recordFailure() {
        const now = Date.now();
        this.recentFailures.push(now);
        const fiveMinutesAgo = now - 5 * 60 * 1000;
        this.recentFailures = this.recentFailures.filter((time) => time > fiveMinutesAgo);
        this.failedCount++;
    }
    /**
     * 計算智能退避延遲
     */
    getBackoffDelay() {
        const recentFailureCount = this.recentFailures.length;
        if (recentFailureCount === 0) {
            return 0;
        }
        const conservativeBaseDelay = 2000;
        const exponentialDelay = conservativeBaseDelay *
            Math.pow(1.8, Math.min(recentFailureCount - 1, 5));
        const maxDelay = 45000;
        const delay = Math.min(exponentialDelay, maxDelay);
        this.logger.debug("智能退避延遲（保守模式）", {
            recentFailures: recentFailureCount,
            calculatedDelay: delay,
            conservativeBaseDelay,
            exponentialFactor: 1.8,
        });
        return delay;
    }
    /**
     * 重置統計信息
     */
    resetStats() {
        this.completedCount = 0;
        this.failedCount = 0;
        this.totalDuration = 0;
        this.recentFailures = []; // 清空失敗記錄
    }
    /**
     * 等待所有任務完成
     */
    async waitForCompletion() {
        while (this.running > 0 || this.queue.length > 0) {
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
    }
    /**
     * 清理隊列（取消等待中的任務）
     */
    clearQueue() {
        const cancelledCount = this.queue.length;
        this.queue.length = 0;
        this.logger.info(`已清理隊列`, { cancelledCount });
        return cancelledCount;
    }
}
/**
 * 創建並行控制器的工廠函數
 */
export function createConcurrencyLimiter(maxConcurrency = 3, logger) {
    return new ConcurrencyLimiter(maxConcurrency, logger);
}
//# sourceMappingURL=concurrency-limiter.js.map