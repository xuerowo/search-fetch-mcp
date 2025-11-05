/**
 * 錯誤訊息和提示文字集中管理
 *
 * 集中管理所有用戶可見的訊息文字，便於維護和國際化
 */

/**
 * 搜索相關錯誤訊息
 */
export const SEARCH_MESSAGES = {
  FAILED: (error: string) => `❌ 搜索失敗: ${error}`,
  NO_RESULTS: "未找到相關結果",
  TIMEOUT: "搜索請求超時",
  NETWORK_ERROR: "網路連接失敗，請檢查網路設定",
  RATE_LIMITED: "請求過於頻繁，請稍後重試",
} as const;

/**
 * 網頁獲取相關錯誤訊息
 */
export const FETCH_MESSAGES = {
  FAILED: (error: string) => `❌ 網頁獲取失敗: ${error}`,
  TIMEOUT: "網頁獲取超時",
  NETWORK_ERROR: "無法連接到目標網站",
  ACCESS_DENIED: "訪問被拒絕（403 Forbidden）",
  NOT_FOUND: "網頁不存在（404 Not Found）",
  SERVER_ERROR: "伺服器錯誤（5xx）",
  INVALID_URL: "無效的 URL 格式",
  CONTENT_TOO_LARGE: "內容過大，已截斷",
} as const;

/**
 * 驗證相關錯誤訊息
 */
export const VALIDATION_MESSAGES = {
  QUERY_EMPTY: "查詢字串不能為空",
  QUERY_TOO_LONG: (maxLength: number) => `查詢字串過長，最大長度為 ${maxLength} 字符`,
  QUERY_INVALID: "查詢字串包含無效字符",
  COUNT_INVALID: (min: number, max: number) => `結果數量必須在 ${min} 到 ${max} 之間`,
  TIMEOUT_INVALID: (min: number, max: number) => `超時時間必須在 ${min} 到 ${max} 毫秒之間`,
  URL_INVALID: "URL 格式無效",
  URL_TOO_LONG: (maxLength: number) => `URL 過長，最大長度為 ${maxLength} 字符`,
  LANGUAGE_UNSUPPORTED: (language: string) => `不支援的語言代碼: ${language}`,
  FORMAT_UNSUPPORTED: (format: string) => `不支援的輸出格式: ${format}`,
} as const;

/**
 * 速率限制相關錯誤訊息
 */
export const RATE_LIMIT_MESSAGES = {
  EXCEEDED: (retryAfter: number) => `超過速率限制，請在 ${retryAfter} 秒後重試`,
  CONFIG_INVALID: "速率限制配置無效",
} as const;

/**
 * 伺服器相關訊息
 */
export const SERVER_MESSAGES = {
  STARTED: (transport: string) => `MCP 伺服器已啟動 (transport: ${transport})`,
  START_FAILED: (error: string) => `伺服器啟動失敗: ${error}`,
  STOPPING: "正在停止伺服器...",
  STOPPED: "伺服器已停止",
} as const;

/**
 * HTTP Transport 相關訊息
 */
export const HTTP_MESSAGES = {
  SERVER_LISTENING: (host: string, port: number) => `MCP HTTP Server listening on http://${host}:${port}`,
  MODE: (stateful: boolean) => `Mode: ${stateful ? "Stateful (session-based)" : "Stateless"}`,
  DNS_PROTECTION_ENABLED: "DNS rebinding protection enabled",
  SESSION_CREATED: (sessionId: string) => `New session created: ${sessionId}`,
  SESSION_CLOSED: (sessionId: string) => `Session closed: ${sessionId}`,
  SESSION_NOT_FOUND: "Session not found",
  SESSION_REQUIRED: "Session ID required for non-initialization requests",
  INVALID_JSON: "Invalid JSON body",
  SERVER_ERROR: (error: string) => `Server error: ${error}`,
} as const;

/**
 * 日誌相關訊息
 */
export const LOG_MESSAGES = {
  MCP_LOG_FAILED: (error: unknown) => `Failed to send MCP log: ${error}`,
} as const;

/**
 * 批量操作相關訊息
 */
export const BATCH_MESSAGES = {
  EMPTY_INPUT: "批量操作的輸入列表不能為空",
  PARTIAL_SUCCESS: (success: number, total: number) =>
    `批量操作部分成功：${success}/${total} 個請求成功`,
  ALL_FAILED: "批量操作全部失敗",
} as const;

/**
 * 操作建議訊息
 */
export const SUGGESTIONS = {
  CHECK_NETWORK: "- 檢查網路連接",
  RETRY_LATER: "- 稍後重試",
  USE_SPA_MODE: "- 嘗試啟用 SPA 模式（useSPA=true）",
  USE_STANDARD_MODE: "- 嘗試使用標準 HTTP 模式（useSPA=false）",
  CHANGE_USER_AGENT: "- 嘗試更換 User-Agent",
  REDUCE_FREQUENCY: "- 降低請求頻率",
  CHECK_URL: "- 檢查 URL 是否正確",
  USE_PAGINATION: "- 對於長內容，使用 startIndex 參數分段讀取",
  CLEAR_COOKIES: "- 清除 Cookie 後重試",
  CHECK_ROBOTS_TXT: "- 檢查網站的 robots.txt 政策",
} as const;

/**
 * 格式化完整的錯誤訊息（包含建議）
 */
export function formatErrorWithSuggestions(error: string, suggestions: string[]): string {
  const suggestionText = suggestions.length > 0 ? `\n\n💡 建議：\n${suggestions.join("\n")}` : "";
  return `${error}${suggestionText}`;
}

/**
 * 格式化批量操作統計訊息
 */
export function formatBatchStats(stats: {
  total: number;
  success: number;
  failed: number;
  duration: number;
}): string {
  const { total, success, failed, duration } = stats;
  const successRate = total > 0 ? ((success / total) * 100).toFixed(1) : "0.0";

  return `
📊 批量操作統計：
- 總計：${total} 個請求
- 成功：${success} 個 (${successRate}%)
- 失敗：${failed} 個
- 耗時：${(duration / 1000).toFixed(2)} 秒
  `.trim();
}

/**
 * 格式化內容截斷提示
 */
export function formatContentTruncated(actualLength: number, maxLength: number): string {
  const truncated = actualLength - maxLength;
  return `\n\n⚠️ 內容已截斷：原始長度 ${actualLength} 字符，截斷了 ${truncated} 字符。使用 startIndex 參數可讀取後續內容。`;
}

/**
 * 格式化日期資訊
 */
export function formatDateInfo(publishedDate?: string, modifiedDate?: string): string {
  const parts: string[] = [];

  if (publishedDate) {
    parts.push(`📅 發布日期：${publishedDate}`);
  }

  if (modifiedDate) {
    parts.push(`🔄 修改日期：${modifiedDate}`);
  }

  return parts.length > 0 ? `\n\n${parts.join("\n")}` : "";
}
