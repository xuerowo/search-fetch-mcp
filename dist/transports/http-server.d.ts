/**
 * HTTP Transport 伺服器
 *
 * 使用 MCP SDK 的 StreamableHTTPServerTransport 提供 HTTP/SSE 傳輸支援
 * 支援無狀態模式（推薦用於生產）和有狀態模式（用於開發）
 */
import { createServer } from "node:http";
import type { DuckDuckGoMCPServer } from "../index.js";
/**
 * HTTP 伺服器配置選項
 */
export interface HttpServerOptions {
    /** 監聽端口 */
    port?: number;
    /** 監聽主機 */
    host?: string;
    /** 是否啟用有狀態模式（預設：false，無狀態） */
    stateful?: boolean;
    /** DNS 重綁定保護 - 允許的主機名 */
    allowedHosts?: string[];
    /** DNS 重綁定保護 - 允許的來源 */
    allowedOrigins?: string[];
}
/**
 * 創建並啟動 HTTP MCP 伺服器
 *
 * @param mcpServer - DuckDuckGo MCP 伺服器實例
 * @param options - HTTP 伺服器配置選項
 * @returns HTTP 伺服器實例
 *
 * @example
 * ```typescript
 * // 無狀態模式（推薦用於生產）
 * const httpServer = createHttpServer(mcpServer, { port: 3000 });
 *
 * // 有狀態模式（用於開發）
 * const httpServer = createHttpServer(mcpServer, {
 *   port: 3000,
 *   stateful: true,
 *   allowedHosts: ['127.0.0.1', 'localhost']
 * });
 * ```
 */
export declare function createHttpServer(mcpServer: DuckDuckGoMCPServer, options?: HttpServerOptions): ReturnType<typeof createServer>;
//# sourceMappingURL=http-server.d.ts.map