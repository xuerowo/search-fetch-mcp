/**
 * 全局常量定義
 *
 * 集中管理項目中的所有常量值，避免 Magic Numbers 和硬編碼
 */

/**
 * 內容處理常量
 */
export const CONTENT_LIMITS = {
  /** 最大內容長度（字符） */
  MAX_CONTENT_LENGTH: 50000,
  /** 內容截斷時的安全緩衝區 */
  SAFE_END_BUFFER: 100,
  /** 最大 Cookie 有效期（毫秒） */
  MAX_COOKIE_AGE: 3600000, // 1 小時
} as const;

/**
 * 搜索相關常量
 */
export const SEARCH_CONSTANTS = {
  /** 預設返回結果數量 */
  DEFAULT_COUNT: 10,
  /** 最大返回結果數量 */
  MAX_COUNT: 50,
  /** 最小返回結果數量 */
  MIN_COUNT: 1,
  /** 搜索超時時間（毫秒） */
  DEFAULT_TIMEOUT: 30000, // 30 秒
  /** 批量搜索最大並發數 */
  MAX_BATCH_CONCURRENCY: 5,
} as const;

/**
 * 網頁獲取相關常量
 */
export const FETCH_CONSTANTS = {
  /** 預設獲取超時時間（毫秒） */
  DEFAULT_TIMEOUT: 60000, // 60 秒
  /** 批量獲取最大並發數 */
  MAX_BATCH_CONCURRENCY: 5,
  /** 請求重試次數 */
  MAX_RETRIES: 3,
  /** 重試延遲時間（毫秒） */
  RETRY_DELAY: 1000,
} as const;

/**
 * 速率限制常量
 */
export const RATE_LIMIT_CONSTANTS = {
  /** 預設每秒請求數 */
  DEFAULT_REQUESTS_PER_SECOND: 1,
  /** 最小每秒請求數 */
  MIN_REQUESTS_PER_SECOND: 0.1,
  /** 最大每秒請求數 */
  MAX_REQUESTS_PER_SECOND: 10,
} as const;

/**
 * 輸入驗證常量
 */
export const VALIDATION_CONSTANTS = {
  /** 查詢字串最大長度 */
  MAX_QUERY_LENGTH: 500,
  /** 查詢字串最小長度 */
  MIN_QUERY_LENGTH: 1,
  /** URL 最大長度 */
  MAX_URL_LENGTH: 2048,
  /** 超時最小值（毫秒） */
  MIN_TIMEOUT: 1000,
  /** 超時最大值（毫秒） */
  MAX_TIMEOUT: 300000, // 5 分鐘
} as const;

/**
 * 瀏覽器池常量
 */
export const BROWSER_POOL_CONSTANTS = {
  /** 預設最大瀏覽器實例數 */
  DEFAULT_MAX_INSTANCES: 4,
  /** 預設瀏覽器空閒超時時間（毫秒） */
  DEFAULT_IDLE_TIMEOUT: 300000, // 5 分鐘
  /** 標籤頁預熱數量 */
  PREWARMING_TAB_COUNT: 2,
} as const;

/**
 * 延遲時間常量（毫秒）
 */
export const DELAY_CONSTANTS = {
  /** 最小請求延遲 */
  MIN_REQUEST_DELAY: 500,
  /** 最大請求延遲 */
  MAX_REQUEST_DELAY: 2000,
  /** 標準請求延遲 */
  DEFAULT_REQUEST_DELAY: 300,
  /** 特殊網站延遲（如 DuckDuckGo） */
  SPECIAL_SITE_DELAY: 1000,
} as const;

/**
 * HTTP 狀態碼
 */
export const HTTP_STATUS = {
  /** 成功 */
  OK: 200,
  /** 壞請求 */
  BAD_REQUEST: 400,
  /** 禁止訪問 */
  FORBIDDEN: 403,
  /** 未找到 */
  NOT_FOUND: 404,
  /** 請求過多 */
  TOO_MANY_REQUESTS: 429,
  /** 內部伺服器錯誤 */
  INTERNAL_SERVER_ERROR: 500,
  /** 服務不可用 */
  SERVICE_UNAVAILABLE: 503,
  /** 閘道超時 */
  GATEWAY_TIMEOUT: 504,
} as const;

/**
 * 可重試的 HTTP 狀態碼
 */
export const RETRYABLE_STATUS_CODES = [
  HTTP_STATUS.TOO_MANY_REQUESTS,
  HTTP_STATUS.SERVICE_UNAVAILABLE,
  HTTP_STATUS.GATEWAY_TIMEOUT,
] as const;

/**
 * 輸出格式
 */
export const OUTPUT_FORMATS = {
  HTML: "html",
  MARKDOWN: "markdown",
  TEXT: "text",
  JSON: "json",
} as const;

/**
 * 日誌級別
 */
export const LOG_LEVELS = {
  DEBUG: "debug",
  INFO: "info",
  WARN: "warn",
  ERROR: "error",
} as const;

/**
 * MCP Transport 類型
 */
export const TRANSPORT_TYPES = {
  STDIO: "stdio",
  HTTP: "http",
} as const;

/**
 * 環境變數鍵名
 */
export const ENV_KEYS = {
  // Transport 配置
  MCP_TRANSPORT: "MCP_TRANSPORT",
  MCP_HTTP_PORT: "MCP_HTTP_PORT",
  MCP_HTTP_HOST: "MCP_HTTP_HOST",
  MCP_HTTP_STATEFUL: "MCP_HTTP_STATEFUL",
  MCP_ALLOWED_HOSTS: "MCP_ALLOWED_HOSTS",
  MCP_ALLOWED_ORIGINS: "MCP_ALLOWED_ORIGINS",

  // 速率限制配置
  RATE_LIMIT_RPS: "RATE_LIMIT_RPS",

  // 日誌配置
  LOG_LEVEL: "LOG_LEVEL",
  LOG_QUERIES: "LOG_QUERIES",

  // 搜索配置
  SEARCH_DEFAULT_COUNT: "SEARCH_DEFAULT_COUNT",
  SEARCH_MAX_COUNT: "SEARCH_MAX_COUNT",
  SEARCH_TIMEOUT: "SEARCH_TIMEOUT",

  // 獲取配置
  FETCH_TIMEOUT: "FETCH_TIMEOUT",
  FETCH_DEFAULT_FORMAT: "FETCH_DEFAULT_FORMAT",
  FETCH_DEFAULT_USE_SPA: "FETCH_DEFAULT_USE_SPA",
} as const;
