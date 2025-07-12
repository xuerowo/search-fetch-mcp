# Search-Fetch-MCP

🚀 現代化的 MCP (Model Context Protocol) 伺服器，提供強大的網路搜索和網頁內容獲取功能。基於 Bun + TypeScript 構建，支援 DuckDuckGo 搜索、智能網頁獲取、SPA 網站支援和批量處理。

## ✨ 主要特色

- 🔍 **DuckDuckGo 搜索**：支援單一和批量搜索，包含高級搜索運算符
- 📱 **智能網頁獲取**：自動適配靜態網站和 SPA 應用
- 🌍 **多語言支援**：覆蓋全球 50+ 國家和地區
- ⚡ **批量處理**：高效的並發搜索和網頁獲取
- 🛡️ **反爬蟲機制**：智能 User-Agent 輪換、請求延遲、重試策略
- 📄 **多格式輸出**：Markdown、HTML、純文字、JSON 格式
- 🔧 **豐富配置**：環境變數和配置檔案完全自訂

## 🛠️ 技術架構

### 核心技術棧
- **Runtime**: Bun (>=1.0.0)
- **語言**: TypeScript (ES2022, ESNext modules)
- **MCP SDK**: @modelcontextprotocol/sdk ^1.0.1
- **網頁處理**: 
  - 標準 HTTP: node-fetch + jsdom + @mozilla/readability
  - SPA 支援: Playwright + turndown
- **驗證**: Zod schemas
- **代碼品質**: ESLint + TypeScript + Prettier

### 核心模組
- **searcher.ts**: DuckDuckGo 搜索實作
- **fetcher.ts**: 網頁內容獲取（支援標準 HTTP 和 SPA）
- **playwright-node-bridge.ts**: Node.js Playwright 橋接器
- **rate-limiter.ts**: 請求速率限制
- **validator.ts**: 輸入驗證
- **browser-pool.ts**: 瀏覽器實例池管理
- **concurrency-limiter.ts**: 並發控制

## 📦 安裝與設置

### 系統需求
- Bun >= 1.0.0
- Node.js >= 18 (用於 Playwright)
- Linux/macOS/Windows (支援 WSL)

### 安裝步驟

1. **克隆項目**
```bash
git clone <repository-url>
cd search-fetch-mcp
```

2. **安裝依賴**
```bash
bun install
```

3. **安裝 Playwright 瀏覽器** (WSL 環境)
```bash
# Windows PowerShell 中執行
npx playwright install-deps
npx playwright install chromium
```

4. **啟動伺服器**
```bash
# 開發模式（監控文件變化）
bun run dev

# 正常啟動
bun start
```

### WSL 環境特殊設定

如果在 WSL 環境中運行，需要額外設定 Playwright：

```bash
# 在 Windows PowerShell 中執行
npx playwright install chromium
npx playwright install-deps
```

## 🔧 MCP 配置

### Claude Desktop 配置

在 Claude Desktop 中使用此 MCP 伺服器，需要修改配置文件：

**配置文件位置**：
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

**配置內容**：
```json
{
  "mcpServers": {
    "search-fetch-mcp": {
      "command": "bun",
      "args": ["run", "/path/to/search-fetch-mcp/src/index.ts"],
      "env": {
        "LOG_LEVEL": "warn",
        "RATE_LIMIT_RPS": "1",
        "DEFAULT_LANGUAGE": "tw-tzh",
        "DEFAULT_FETCH_FORMAT": "markdown",
        "DEFAULT_USE_SPA": "true"
      }
    }
  }
}
```

### 配置參數說明

| 參數 | 描述 | 預設值 | 可選值 |
|------|------|--------|--------|
| `LOG_LEVEL` | 日誌級別 | `warn` | `debug`, `info`, `warn`, `error` |
| `RATE_LIMIT_RPS` | 每秒請求數限制 | `1` | 正整數 |
| `DEFAULT_LANGUAGE` | 預設搜索語言 | `wt-wt` | 見語言代碼表 |
| `DEFAULT_FETCH_FORMAT` | 預設獲取格式 | `markdown` | `html`, `markdown`, `text`, `json` |
| `DEFAULT_USE_SPA` | 預設使用 SPA 模式 | `true` | `true`, `false` |
| `DEFAULT_USE_READABILITY` | 預設使用內容提取 | `true` | `true`, `false` |

### 配置範例

**基本配置**（適合一般使用）：
```json
{
  "mcpServers": {
    "search-fetch-mcp": {
      "command": "bun",
      "args": ["run", "C:/path/to/search-fetch-mcp/src/index.ts"]
    }
  }
}
```

**高級配置**（自訂設定）：
```json
{
  "mcpServers": {
    "search-fetch-mcp": {
      "command": "bun",
      "args": ["run", "C:/path/to/search-fetch-mcp/src/index.ts"],
      "env": {
        "LOG_LEVEL": "info",
        "RATE_LIMIT_RPS": "2",
        "DEFAULT_LANGUAGE": "us-en",
        "DEFAULT_FETCH_FORMAT": "json",
        "DEFAULT_USE_SPA": "true",
        "DEFAULT_USE_READABILITY": "false",
        "SEARCH_TIMEOUT": "45000"
      }
    }
  }
}
```

**多語言配置**（台灣使用者）：
```json
{
  "mcpServers": {
    "search-fetch-mcp": {
      "command": "bun",
      "args": ["run", "/path/to/search-fetch-mcp/src/index.ts"],
      "env": {
        "DEFAULT_LANGUAGE": "tw-tzh",
        "DEFAULT_SAFE_SEARCH": "moderate",
        "LOG_LEVEL": "warn"
      }
    }
  }
}
```

### 重新啟動 Claude Desktop

配置完成後，請重新啟動 Claude Desktop 以載入新的 MCP 伺服器。成功後，您就可以在對話中使用以下工具：

- `ddg_search` - DuckDuckGo 搜索
- `webpage_fetch` - 網頁內容獲取  
- `ddg_batch_search` - 批量搜索
- `batch_fetch` - 批量網頁獲取

## 🎯 MCP 工具說明

### 1. DuckDuckGo 搜索 (`ddg_search`)

根據單一關鍵詞返回相關網頁標題、連結、摘要和日期資訊。

**參數**：
- `query` (必需): 搜索查詢字符串
- `count` (可選): 返回結果數量 (預設: 10, 最大: 50)
- `language` (可選): 語言/地區代碼 (預設: "wt-wt")
- `safe_search` (可選): 安全搜索級別 ("strict", "moderate", "off")
- `time_range` (可選): 時間範圍 ("day", "week", "month", "year")

**高級搜索運算符**：
- `site:example.com` - 限制網站
- `"完整詞組"` - 精確搜索
- `filetype:pdf` - 文件類型
- `intitle:關鍵詞` - 標題搜索

**使用範例**：
```javascript
// 基本搜索
await mcp.call("ddg_search", {
  query: "TypeScript 最佳實踐",
  count: 10
});

// 高級搜索
await mcp.call("ddg_search", {
  query: 'site:github.com "MCP server"',
  language: "us-en",
  time_range: "month"
});
```

### 2. 網頁內容獲取 (`webpage_fetch`)

當您已有明確 URL 且需要詳細內容時使用。

**參數**：
- `url` (必需): 要獲取的網頁 URL
- `format` (可選): 輸出格式 ("html", "markdown", "text", "json")
- `maxLength` (可選): 最大字符數 (預設: 10000, 最大: 99000)
- `useSPA` (可選): 是否使用無頭瀏覽器 (預設: true)
- `start_index` (可選): 開始讀取的字符位置
- `useReadability` (可選): 是否提取主要內容 (預設: true)
- `userAgentMode` (可選): User-Agent 模式 ("dynamic", "custom", "crawler")

**使用範例**：
```javascript
// 標準網頁獲取
await mcp.call("webpage_fetch", {
  url: "https://example.com/article",
  format: "markdown",
  maxLength: 5000
});

// SPA 網站獲取
await mcp.call("webpage_fetch", {
  url: "https://spa-website.com",
  useSPA: true,
  format: "json"
});

// 獲取完整頁面內容（包含導航等）
await mcp.call("webpage_fetch", {
  url: "https://github.com/user/repo",
  useReadability: false,
  maxLength: 30000
});
```

### 3. 批量搜索 (`ddg_batch_search`)

並行搜索多個相關查詢，適合比較分析和多角度研究。

**參數**：
- `queries` (必需): 查詢列表 (最多 5 個)
- `count` (可選): 每個查詢的結果數量 (預設: 5, 最大: 20)
- `language`, `safe_search`, `time_range`: 同單一搜索

**使用範例**：
```javascript
await mcp.call("ddg_batch_search", {
  queries: [
    "Vue.js 3 新功能",
    "React 18 更新",
    "Angular 17 變化"
  ],
  count: 5,
  language: "tw-tzh"
});
```

### 4. 批量網頁獲取 (`batch_fetch`)

同時獲取多個網頁內容，比多次單一獲取更高效。

**參數**：
- `urls` (必需): URL 列表 (最多 10 個)
- `format`, `maxLength`, `useSPA`, `useReadability`: 同單一獲取

**使用範例**：
```javascript
await mcp.call("batch_fetch", {
  urls: [
    "https://example1.com/article1",
    "https://example2.com/article2",
    "https://example3.com/article3"
  ],
  format: "markdown",
  maxLength: 8000
});
```

## ⚙️ 配置選項

### 環境變數

```bash
# 速率限制
RATE_LIMIT_RPS=1                    # 每秒請求數

# 搜索設定
SEARCH_TIMEOUT=30000                # 搜索超時 (毫秒)
DEFAULT_LANGUAGE=wt-wt              # 預設語言
DEFAULT_SAFE_SEARCH=moderate        # 預設安全搜索

# 獲取設定
DEFAULT_FETCH_FORMAT=markdown       # 預設格式
DEFAULT_USE_SPA=true               # 預設使用 SPA 模式
DEFAULT_USE_READABILITY=true       # 預設使用 Readability

# 日誌設定
LOG_LEVEL=warn                     # 日誌級別 (debug, info, warn, error)
LOG_QUERIES=false                  # 是否記錄查詢 (安全考量)
```

### 支援的語言/地區代碼

| 代碼 | 地區 | 語言 |
|------|------|------|
| `wt-wt` | 全球 | 所有語言 |
| `us-en` | 美國 | 英語 |
| `tw-tzh` | 台灣 | 繁體中文 |
| `hk-tzh` | 香港 | 繁體中文 |
| `cn-zh` | 中國 | 簡體中文 |
| `jp-jp` | 日本 | 日語 |
| `kr-kr` | 韓國 | 韓語 |

查看完整清單請參考 [config.ts](src/config.ts)。

## 🔧 開發指南

### 開發命令

```bash
# 開發模式（監控文件變化）
bun run dev

# 執行測試
bun test

# 代碼檢查和格式化
bun run lint           # 檢查代碼風格
bun run lint:fix       # 自動修復問題
bun run typecheck      # TypeScript 類型檢查
bun run format         # 格式化代碼
```

### 項目結構

```
src/
├── __tests__/              # 測試文件
├── index.ts               # 主入口，MCP 伺服器
├── config.ts              # 配置管理
├── types.ts               # TypeScript 型別定義
├── validator.ts           # 輸入驗證
├── logger.ts              # 日誌記錄
├── rate-limiter.ts        # 速率限制
├── searcher.ts            # DuckDuckGo 搜索實作
├── fetcher.ts             # 網頁獲取實作
├── browser-pool.ts        # 瀏覽器實例池
├── browser-service.ts     # 瀏覽器服務
├── concurrency-limiter.ts # 並發控制
├── fingerprint-service.ts # 指紋管理
├── playwright-node-bridge.ts    # Playwright 橋接器
└── playwright-processor.ts      # Playwright 處理器
```

### 代碼規範

- 使用嚴格的 TypeScript 設定
- ES Module 語法，import 路徑包含 `.js` 擴展名
- 函數和變數使用 camelCase，類和型別使用 PascalCase
- 偏好 async/await 而非 Promise chains
- 敏感資訊在日誌中進行清理

### 測試

```bash
# 執行所有測試
bun test

# 執行特定測試檔案
bun test src/__tests__/searcher-simple.test.ts
```

## 🚨 故障排除

### Playwright 相關問題

**問題**: "missing dependencies" 錯誤
```bash
# 解決方案
npx playwright install-deps
```

**問題**: "executable doesn't exist" 錯誤
```bash
# 解決方案
npx playwright install chromium
```

### 網站訪問問題

**403 錯誤**: 
- 系統會自動觸發智能重試機制
- 支援動態 User-Agent 模式避免封鎖
- 可嘗試調整 `userAgentMode` 參數

**SPA 網站無法載入**:
- 確保 `useSPA: true`
- 檢查 Playwright 瀏覽器安裝
- SPA 模式失敗會自動降級到標準 HTTP 模式

**內容提取不完整**:
- 嘗試設定 `useReadability: false` 獲取完整頁面
- 增加 `maxLength` 參數
- 對於 GitHub 儲存庫等結構化網站，建議關閉 Readability

### 效能最佳化

- 批量操作使用並發限制器控制並發數
- 瀏覽器實例採用池化管理
- 內容截斷機制避免記憶體過載
- 智能延遲策略平衡效能與反爬蟲

### WSL 環境問題

如果在 WSL 中遇到 Playwright 問題：

1. 確保在 Windows PowerShell 中安裝瀏覽器
2. 檢查 WSL 與 Windows 的網路連接
3. 必要時可嘗試在 Windows 原生環境運行

## 📋 API 參考

### 輸出格式

- **markdown**: 適合閱讀的 Markdown 格式（預設）
- **html**: 原始 HTML 內容
- **text**: 純文字內容
- **json**: 包含完整元數據的 JSON 格式

### 錯誤處理

所有工具都提供詳細的錯誤資訊和修復建議：

- 輸入驗證錯誤
- 網路連接問題
- 速率限制提示
- 網站訪問限制
- 瀏覽器相關錯誤

### 結構化輸出

所有 MCP 工具都提供 `structuredContent` 欄位，包含：

- 搜索統計資訊
- 網頁元數據（標題、發布時間、修改時間等）
- 批量處理統計
- 錯誤詳情

## 🎯 最佳實踐

1. **搜索策略**：先用 `ddg_search` 找到相關 URL，再用 `webpage_fetch` 獲取詳細內容
2. **批量處理**：使用 `ddg_batch_search` + `batch_fetch` 組合進行大規模資料收集
3. **格式選擇**：Markdown 適合閱讀，JSON 適合數據處理
4. **SPA 支援**：現代動態網站建議啟用 `useSPA: true`
5. **內容控制**：根據需求調整 `useReadability` 和 `maxLength`
6. **速率管理**：適當的請求間隔避免被封鎖

---

*Built with ❤️ using Bun + TypeScript*