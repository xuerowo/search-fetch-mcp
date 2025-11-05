# 🚀 部署指南

本指南將幫助您將 search-fetch-mcp 部署到 Render.com，實現 24/7 運行。

## 📋 前置需求

- ✅ GitHub 帳號
- ✅ Render.com 帳號（https://render.com）
- ✅ 已將代碼推送到 GitHub

## 🌐 Render.com 部署（完全免費）

### 特點
- ✅ **完全免費**（無需信用卡）
- ⚠️ 15 分鐘無活動會休眠
- ⚠️ 首次請求需要 30-60 秒喚醒
- ✅ 自動從 GitHub 部署
- ✅ 支援自訂網域

### 部署步驟

#### 1. 登入 Render
前往 https://dashboard.render.com/

#### 2. 創建新的 Web Service
1. 點擊 **"New +"** 按鈕
2. 選擇 **"Web Service"**
3. 選擇 **"Build and deploy from a Git repository"**
4. 點擊 **"Next"**

#### 3. 連接 GitHub 倉庫
1. 如果首次使用，點擊 **"Connect account"** 連接 GitHub
2. 授權 Render 訪問您的倉庫
3. 在倉庫列表中找到 **`xuerowo/search-fetch-mcp`**
4. 點擊 **"Connect"**

#### 4. 配置 Web Service

Render 會自動檢測 `render.yaml` 配置文件。您應該看到：

- **Name**: `search-fetch-mcp`
- **Region**: `Singapore`（最接近台灣）
- **Branch**: `main`
- **Runtime**: `Node`
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm run start:dist`

環境變數（已預設）：
```
MCP_TRANSPORT=http
MCP_HTTP_PORT=10000
MCP_HTTP_HOST=0.0.0.0
NODE_ENV=production
LOG_LEVEL=info
```

#### 5. 選擇免費方案
- **Instance Type**: 選擇 **"Free"**
- 確認所有設置無誤

#### 6. 創建 Web Service
1. 滑到最下方
2. 點擊 **"Create Web Service"**
3. 等待部署完成（約 3-5 分鐘）

### 部署完成

部署成功後，您會看到：
- ✅ 狀態顯示為 **"Live"**（綠色）
- ✅ 獲得一個 URL，例如：`https://search-fetch-mcp.onrender.com`

### 測試部署

#### 測試健康檢查
在瀏覽器訪問您的 URL：
```
https://your-app.onrender.com/
```

應該看到：
```json
{
  "status": "ok",
  "service": "search-fetch-mcp",
  "version": "1.1.0",
  "transport": "http"
}
```

#### 測試 MCP 端點
MCP 端點位於：
```
https://your-app.onrender.com/mcp
```

## 🔗 在 Claude Web 中使用

1. 前往 Claude Web 設置
2. 點擊 **"Add custom connector"**
3. 填寫：
   - **Name**: `Search-Fetch-MCP`
   - **Remote MCP server URL**: `https://your-app.onrender.com/mcp`
4. 點擊 **"Add"**

完成！現在您可以在 Claude Web 中使用搜索和網頁獲取功能了。

## ⚠️ 免費方案限制

### 休眠機制
- **觸發條件**: 15 分鐘無請求
- **喚醒時間**: 30-60 秒
- **影響**: 第一次請求會比較慢

### 如何避免休眠？
使用 **UptimeRobot** 或 **Cron-job.org** 定期 ping 您的伺服器：

1. 註冊 https://uptimerobot.com（免費）
2. 添加新監控：
   - **URL**: `https://your-app.onrender.com/`
   - **Monitoring Interval**: 5 分鐘
3. 這樣伺服器永遠不會休眠

## 🔄 自動更新

當您推送新代碼到 GitHub `main` 分支時，Render 會自動：
1. 檢測變更
2. 重新構建
3. 部署新版本

無需手動操作！

## 🐛 故障排除

### 部署失敗
1. 檢查 Render Dashboard 的 **Logs** 標籤
2. 確認所有環境變數正確設置
3. 確認 GitHub 倉庫有最新的 `render.yaml`

### 無法連接
1. 確認服務狀態為 **"Live"**
2. 測試健康檢查端點（`/`）
3. 檢查 Render Logs 是否有錯誤

### 喚醒太慢
1. 設置 UptimeRobot 定期 ping
2. 或考慮升級到付費方案（$7/月，無休眠）

## 📊 監控

在 Render Dashboard 中您可以查看：
- 📈 CPU 和記憶體使用率
- 📝 即時日誌
- 🔄 部署歷史
- 📊 請求統計

## 🆙 升級到付費方案

如果需要：
- ✅ 無休眠
- ✅ 更快的 CPU
- ✅ 更多記憶體

可以在 Render Dashboard 中升級：
- **Starter**: $7/月
- **Standard**: $25/月

## 📝 其他部署選項

本項目也支援部署到：
- Railway.app
- Heroku
- Fly.io
- 自己的 VPS

詳見各平台文檔。

---

**需要幫助？**
- GitHub Issues: https://github.com/xuerowo/search-fetch-mcp/issues
- 查看伺服器日誌: Render Dashboard → Logs
