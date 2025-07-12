/**
 * Playwright Node.js 橋接器
 * 使用 Node.js 子進程來運行 Playwright，解決 Bun 兼容性問題
 */

import { spawn } from "child_process";
import { Logger } from "./logger.js";
import { FetchOptions, FetchResult } from "./types.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PlaywrightNodeBridge {
  private logger: Logger;
  private playwrightAvailable: boolean | null = null;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * 檢查 Playwright 是否可用
   */
  private async checkPlaywrightAvailability(): Promise<boolean> {
    if (this.playwrightAvailable !== null) {
      return this.playwrightAvailable;
    }

    try {
      this.logger.debug("檢查 Playwright 可用性");
      
      // 快速檢查：嘗試啟動最小化的 Playwright 實例
      const result = await this.quickPlaywrightTest();
      this.playwrightAvailable = result;
      
      if (!result) {
        this.logger.warn("Playwright 不可用，將使用降級模式");
      }
      
      return result;
    } catch (error) {
      this.logger.warn("Playwright 可用性檢查失敗", { error: error instanceof Error ? error.message : String(error) });
      this.playwrightAvailable = false;
      return false;
    }
  }

  /**
   * 快速 Playwright 測試
   */
  private async quickPlaywrightTest(): Promise<boolean> {
    return new Promise((resolve) => {
      const workerScript = path.join(__dirname, "..", "scripts", "playwright-worker.cjs");
      
      const child = spawn("node", [workerScript], {
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 15000, // 快速超時
      });

      let resolved = false;
      
      // 快速超時
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          child.kill('SIGTERM');
          resolve(false);
        }
      }, 15000);

      child.on("close", (code) => {
        clearTimeout(timeoutId);
        if (!resolved) {
          resolved = true;
          resolve(code === 0);
        }
      });

      child.on("error", () => {
        clearTimeout(timeoutId);
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      });

      // 發送測試請求
      try {
        child.stdin.write(JSON.stringify({
          url: "data:text/html,<html><body>test</body></html>",
          format: "text",
          maxLength: 100,
          timeout: 10000
        }));
        child.stdin.end();
      } catch {
        clearTimeout(timeoutId);
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      }
    });
  }

  /**
   * 使用 Node.js 子進程獲取 SPA 網頁
   * 支援多層次錯誤處理和自動重試機制
   * 包含 Playwright 可用性預檢查
   */
  async fetchSPA(options: FetchOptions, retries: number = 1): Promise<FetchResult> {
    // 預檢查 Playwright 可用性
    const isAvailable = await this.checkPlaywrightAvailability();
    if (!isAvailable) {
      this.logger.info("Playwright 不可用，直接拋出錯誤以觸發降級");
      throw new Error("Playwright 不可用 - 環境缺少必要依賴或配置");
    }

    let attempt = 0;
    
    while (attempt <= retries) {
      try {
        attempt++;
        this.logger.debug("啟動 Node.js Playwright 子進程", { 
          url: options.url, 
          attempt, 
          maxRetries: retries + 1 
        });

        const result = await this.executeFetchWithTimeout(options, attempt);
        
        // 檢查結果質量
        if (result.success && result.content && result.content.length > 50) {
          this.logger.debug("Node.js Playwright 執行成功", { 
            contentLength: result.content.length,
            attempt 
          });
          return result;
        } else if (result.success) {
          // 內容太短，可能是頁面未完全載入
          this.logger.warn("Playwright 獲取的內容過短，嘗試重試", { 
            contentLength: result.content?.length || 0,
            attempt 
          });
          if (attempt <= retries) {
            await this.delay(1000 * attempt); // 漸進延遲
            continue;
          }
        }
        
        return result;
        
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logger.warn("Playwright 子進程執行失敗", { 
          error: errorMsg, 
          attempt, 
          url: options.url 
        });
        
        if (attempt <= retries && this.isRetryableError(errorMsg)) {
          this.logger.info("準備重試 Playwright 操作", { 
            attempt: attempt + 1, 
            maxRetries: retries + 1,
            delay: 1000 * attempt 
          });
          await this.delay(1000 * attempt); // 漸進延遲
          continue;
        }
        
        // 最後一次嘗試失敗，拋出錯誤
        this.logger.error("Node.js Playwright 所有重試已用盡", new Error(errorMsg), { 
          totalAttempts: attempt,
          url: options.url 
        });
        throw new Error(`Playwright 執行失敗 (${attempt} 次嘗試): ${errorMsg}`);
      }
    }
    
    throw new Error("不應該執行到這裡");
  }

  /**
   * 執行單次 Playwright 獲取（帶超時控制）
   */
  private async executeFetchWithTimeout(options: FetchOptions, attempt: number): Promise<FetchResult> {
    return new Promise((resolve, reject) => {
      const workerScript = path.join(__dirname, "..", "scripts", "playwright-worker.cjs");
      
      // 更長的超時時間和更快的失敗檢測
      const timeoutMs = Math.min((options.timeout || 60000) + (attempt - 1) * 15000, 120000);
      
      const child = spawn("node", [workerScript], {
        stdio: ["pipe", "pipe", "pipe"],
        timeout: timeoutMs,
        cwd: path.dirname(workerScript),
      });

      let stdout = "";
      let stderr = "";
      let completed = false;

      // 設置手動超時
      const timeoutId = setTimeout(() => {
        if (!completed) {
          completed = true;
          child.kill('SIGTERM');
          reject(new Error(`Playwright 操作超時 (${timeoutMs}ms)`));
        }
      }, timeoutMs);

      // 發送選項到子進程
      try {
        child.stdin.write(JSON.stringify(options));
        child.stdin.end();
      } catch (error) {
        clearTimeout(timeoutId);
        reject(new Error(`發送參數失敗: ${error}`));
        return;
      }

      // 收集輸出
      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      // 處理完成
      child.on("close", (code) => {
        clearTimeout(timeoutId);
        if (completed) {return;}
        completed = true;

        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            resolve(result);
          } catch {
            reject(new Error(`解析結果失敗: 無效的 JSON 格式`));
          }
        } else {
          const errorMsg = `子進程失敗 (code: ${code}): ${stderr || '無錯誤訊息'}`;
          reject(new Error(errorMsg));
        }
      });

      // 處理進程錯誤
      child.on("error", (error) => {
        clearTimeout(timeoutId);
        if (completed) {return;}
        completed = true;
        reject(error);
      });
    });
  }

  /**
   * 判斷錯誤是否可重試
   */
  private isRetryableError(errorMsg: string): boolean {
    const retryablePatterns = [
      /timeout/i,
      /connection.*refused/i,
      /network.*error/i,
      /execution context.*destroyed/i,
      /target.*closed/i,
      /page.*crashed/i,
      /navigation.*failed/i,
    ];
    
    return retryablePatterns.some(pattern => pattern.test(errorMsg));
  }

  /**
   * 延遲函數
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

}