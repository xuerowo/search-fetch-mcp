/**
 * HTTP Transport 伺服器
 *
 * 使用 MCP SDK 的 StreamableHTTPServerTransport 提供 HTTP/SSE 傳輸支援
 * 支援無狀態模式（推薦用於生產）和有狀態模式（用於開發）
 */

import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
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
export function createHttpServer(
  mcpServer: DuckDuckGoMCPServer,
  options: HttpServerOptions = {}
): ReturnType<typeof createServer> {
  const {
    port = 3000,
    host = "0.0.0.0",
    stateful = false,
    allowedHosts,
    allowedOrigins,
  } = options;

  // 會話管理（僅用於有狀態模式）
  const transports: Map<string, StreamableHTTPServerTransport> = new Map();

  // 創建 HTTP 伺服器
  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // CORS 支援
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id");

    // 處理 OPTIONS 預檢請求
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // 解析請求體（POST 請求）
    let body: unknown;
    if (req.method === "POST") {
      try {
        body = await parseRequestBody(req);
      } catch (_error) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON body" }));
        return;
      }
    }

    // 無狀態模式：每個請求創建新 transport
    if (!stateful) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // 無狀態模式
        enableJsonResponse: true,
        allowedHosts,
        allowedOrigins,
        enableDnsRebindingProtection: !!(allowedHosts || allowedOrigins),
      });

      // 清理 transport
      res.on("close", () => {
        // eslint-disable-next-line no-console
        transport.close().catch(console.error);
      });

      // 連接 MCP 伺服器
      await mcpServer.connectTransport(transport);

      // 處理請求
      await transport.handleRequest(req, res, body);
      return;
    }

    // 有狀態模式：會話管理
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const isInitializeRequest = body && typeof body === "object" && "method" in body && body.method === "initialize";

    if (sessionId && transports.has(sessionId)) {
      // 重用現有 transport
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res, body);
    } else if (!sessionId && isInitializeRequest) {
      // 創建新會話
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => generateSessionId(),
        onsessioninitialized: (sid) => {
          transports.set(sid, transport);
          // eslint-disable-next-line no-console
          console.error(`[HTTP] New session created: ${sid}`);
        },
        enableJsonResponse: true,
        allowedHosts,
        allowedOrigins,
        enableDnsRebindingProtection: !!(allowedHosts || allowedOrigins),
      });

      // 清理 transport
      transport.onclose = () => {
        if (transport.sessionId) {
          transports.delete(transport.sessionId);
          // eslint-disable-next-line no-console
          console.error(`[HTTP] Session closed: ${transport.sessionId}`);
        }
      };

      // 連接 MCP 伺服器
      await mcpServer.connectTransport(transport);

      // 處理初始化請求
      await transport.handleRequest(req, res, body);
    } else {
      // 無效的會話或缺少會話 ID
      res.writeHead(sessionId ? 404 : 400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: sessionId ? "Session not found" : "Session ID required for non-initialization requests",
        })
      );
    }
  });

  // 啟動伺服器
  httpServer.listen(port, host, () => {
    // eslint-disable-next-line no-console
    console.error(`[HTTP] MCP HTTP Server listening on http://${host}:${port}`);
    // eslint-disable-next-line no-console
    console.error(`[HTTP] Mode: ${stateful ? "Stateful (session-based)" : "Stateless"}`);
    if (allowedHosts || allowedOrigins) {
      // eslint-disable-next-line no-console
      console.error(`[HTTP] DNS rebinding protection enabled`);
    }
  });

  // 錯誤處理
  httpServer.on("error", (error) => {
    // eslint-disable-next-line no-console
    console.error(`[HTTP] Server error:`, error);
  });

  return httpServer;
}

/**
 * 解析請求體為 JSON
 */
async function parseRequestBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";

    req.on("data", (chunk) => {
      data += chunk.toString();
    });

    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : undefined);
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

/**
 * 生成安全的會話 ID
 */
function generateSessionId(): string {
  // 使用 crypto 生成安全的隨機 UUID
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // 降級：使用時間戳和隨機數
  return `session-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}
