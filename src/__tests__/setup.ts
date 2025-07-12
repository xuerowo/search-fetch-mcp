/**
 * Bun 測試設置檔案
 */

// 設置環境變數
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "error";

// Mock console 方法避免測試輸出噪音（Bun 原生支援）
const originalConsole = console;
global.console = {
  ...originalConsole,
  log: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
