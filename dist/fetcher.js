import fetch from "node-fetch";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
// @ts-ignore - turndown-plugin-gfm 沒有型別定義
import { gfm } from "turndown-plugin-gfm";
import robotsParser from "robots-parser";
import { PlaywrightNodeBridge } from "./playwright-node-bridge.js";
import { Logger } from "./logger.js";
import { FetchError, getErrorMessage, } from "./types.js";
import { ConcurrencyLimiter } from "./concurrency-limiter.js";
import { BrowserPool } from "./browser-pool.js";
import { FingerprintService } from "./fingerprint-service.js";
/**
 * 網頁內容獲取器
 */
export class WebpageFetcher {
    crawlerUserAgent = "Search-Fetch-MCP/1.0 (+https://github.com/anthropics/claude-code)";
    defaultTimeout = 10000;
    turndownService;
    logger;
    concurrencyLimiter;
    browserPool;
    playwrightBridge;
    fingerprintService;
    cookieStore = {};
    lastRequestTime = 0;
    constructor(logger) {
        this.logger = logger || new Logger({ level: "info", logQueries: false });
        this.turndownService = new TurndownService({
            headingStyle: "atx",
            codeBlockStyle: "fenced",
            fence: "```",
            emDelimiter: "*",
            strongDelimiter: "**",
            linkStyle: "inlined",
            bulletListMarker: "-",
            hr: "---",
        });
        this.turndownService.use(gfm);
        this.setupTurndownRules();
        this.concurrencyLimiter = new ConcurrencyLimiter(3, this.logger);
        // 禁用瀏覽器池預熱，因為使用 Node.js 橋接器
        this.browserPool = new BrowserPool(4, 300000, { enablePrewarming: false }, this.logger);
        this.playwrightBridge = new PlaywrightNodeBridge(this.logger);
        this.fingerprintService = new FingerprintService(this.logger);
    }
    async fetchWebpage(options, _isFromSpaFallback = false) {
        const { url, format = "markdown", maxLength = 5000, startIndex = 0, timeout = this.defaultTimeout, headers = {}, useReadability = true, respectRobots = true, includeImages = false, } = options;
        try {
            this.validateUrl(url);
            // 防爬蟲延遲：在連續請求之間添加延遲
            await this.applyAntiCrawlerDelay(url);
            // 獲取 User-Agent
            const userAgent = await this.getUserAgent(options);
            // robots.txt 檢查（如果啟用）
            if (respectRobots) {
                const allowed = await this.checkRobotsTxt(url, userAgent);
                if (!allowed) {
                    throw new FetchError(`robots.txt 禁止訪問: ${url}`, "ROBOTS_FORBIDDEN");
                }
            }
            this.logger.info("開始獲取網頁", { url, method: "standard" });
            // 預訪問處理（如需要）
            await this.performPreAccessIfNeeded();
            const html = await this.fetchHtml(url, timeout, headers, userAgent);
            // 處理內容
            const processedContent = await this.processContent(html, {
                format,
                useReadability,
                includeImages,
                baseUrl: url,
                maxLength, // 傳遞 maxLength 給 processContent
            });
            // 應用分片邏輯（JSON 格式不分片）
            const originalLength = processedContent.content.length;
            // 所有格式都使用統一的截斷處理
            const finalContent = this.applyContentSlicing(processedContent.content, startIndex, maxLength, format);
            // 標準 HTTP 模式下不需要 useSPA 提示，因為本來就是 useSPA: false
            const contentWithTip = finalContent;
            return {
                success: true,
                url,
                title: processedContent.metadata?.title,
                description: processedContent.metadata?.description,
                content: contentWithTip,
                format,
                images: processedContent.images,
                metadata: processedContent.metadata,
                timestamp: new Date().toISOString(),
                originalLength,
                publishedDate: processedContent.dateInfo?.publishedDate,
                modifiedDate: processedContent.dateInfo?.modifiedDate,
            };
        }
        catch (error) {
            // 嘗試智能重試（特別針對 403 和 Access Denied 錯誤）
            const retryResult = await this.handleErrorWithRetry(error, url, options);
            if (retryResult) {
                return retryResult;
            }
            return {
                success: false,
                content: "",
                error: this.handleFetchError(error, url).message,
                url,
                originalLength: 0,
            };
        }
    }
    /**
     * SPA 網頁獲取方法（使用 Node.js Playwright 橋接器）
     * 適用於 Vue.js、React、Angular 等單頁應用
     * 當 Playwright 失敗時自動降級為簡單 HTTP 模式
     */
    async fetchSPAWebpage(options) {
        const { url, format = "markdown", maxLength = 5000, startIndex = 0, timeout = 60000, respectRobots = true, useReadability = true, } = options;
        try {
            this.validateUrl(url);
            // 獲取 User-Agent
            const userAgent = await this.getUserAgent(options);
            // robots.txt 檢查（如果啟用）
            if (respectRobots) {
                const allowed = await this.checkRobotsTxt(url, userAgent);
                if (!allowed) {
                    throw new FetchError(`robots.txt 禁止訪問: ${url}`, "ROBOTS_FORBIDDEN");
                }
            }
            this.logger.info("使用 Node.js Playwright 橋接器獲取 SPA 網頁", { url });
            try {
                // 使用 Node.js 橋接器
                const result = await this.playwrightBridge.fetchSPA({
                    url,
                    format,
                    maxLength,
                    startIndex,
                    timeout,
                    useReadability,
                });
                return result;
            }
            catch (playwrightError) {
                // Playwright 失敗時自動降級為簡單 HTTP 模式
                const errorMsg = getErrorMessage(playwrightError);
                this.logger.warn("Playwright 失敗，自動降級為標準 HTTP 模式", {
                    url,
                    error: errorMsg,
                    suggestion: this.getPlaywrightErrorSuggestion(errorMsg)
                });
                this.logger.info("正在使用標準 HTTP 模式重新獲取", { url });
                return await this.fetchWebpage({
                    url,
                    format,
                    maxLength,
                    startIndex,
                    timeout,
                    respectRobots: false, // 已經檢查過了
                    userAgentMode: options.userAgentMode,
                    customUserAgent: options.customUserAgent
                });
            }
        }
        catch (error) {
            const errorMessage = getErrorMessage(error);
            this.logger.error("SPA 網頁獲取失敗", error instanceof Error ? error : new Error(errorMessage), { url });
            return {
                success: false,
                content: "",
                error: `SPA 模式獲取失敗: ${errorMessage}`,
                url,
                format,
                timestamp: new Date().toISOString(),
                originalLength: 0,
            };
        }
    }
    /**
     * 獲取 Playwright 錯誤的解決建議
     */
    getPlaywrightErrorSuggestion(errorMsg) {
        if (errorMsg.includes("missing dependencies") || errorMsg.includes("install-deps")) {
            return "建議在 Windows PowerShell 中運行: npx playwright install-deps && npx playwright install chromium";
        }
        if (errorMsg.includes("timeout") || errorMsg.includes("Timeout")) {
            return "建議增加超時時間或檢查網路連接";
        }
        if (errorMsg.includes("executable doesn't exist")) {
            return "建議執行: npx playwright install chromium";
        }
        if (errorMsg.includes("not a function")) {
            return "Playwright API 兼容性問題，已自動降級為標準模式";
        }
        return "已自動切換到標準 HTTP 模式，功能正常";
    }
    /**
     * URL 驗證
     */
    validateUrl(url) {
        try {
            const parsedUrl = new URL(url);
            // 只允許 HTTP/HTTPS 協議
            if (!["http:", "https:"].includes(parsedUrl.protocol)) {
                throw new FetchError("只支援 HTTP 和 HTTPS 協議");
            }
            // 防止內網訪問（可選）
            if (this.isPrivateNetwork(parsedUrl.hostname)) {
                throw new FetchError("不允許訪問私有網路地址");
            }
        }
        catch (error) {
            if (error instanceof FetchError) {
                throw error;
            }
            throw new FetchError(`無效的 URL 格式: ${url}`);
        }
    }
    /**
     * 檢查是否為私有網路地址
     */
    isPrivateNetwork(hostname) {
        const privateRanges = [
            /^127\./,
            /^192\.168\./,
            /^10\./,
            /^172\.(1[6-9]|2[0-9]|3[01])\./,
            /^localhost$/i,
            /^::1$/,
            /^fe80:/i,
        ];
        return privateRanges.some((range) => range.test(hostname));
    }
    /**
     * robots.txt 檢查
     */
    async checkRobotsTxt(url, userAgent) {
        try {
            const urlObj = new URL(url);
            const robotsUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`;
            const response = await fetch(robotsUrl, {
                // @ts-ignore - node-fetch timeout 設定
                timeout: 5000,
                headers: { "User-Agent": userAgent },
            });
            if (!response.ok) {
                // 如果無法獲取 robots.txt，允許訪問
                return true;
            }
            const robotsContent = await response.text();
            const robots = robotsParser(robotsUrl, robotsContent);
            return robots.isAllowed(url, userAgent) ?? true;
        }
        catch {
            // 錯誤時預設允許訪問
            return true;
        }
    }
    /**
     * 獲取適當的 User-Agent
     */
    async getUserAgent(options) {
        const { userAgentMode = 'dynamic', customUserAgent } = options;
        switch (userAgentMode) {
            case 'crawler':
                return this.crawlerUserAgent;
            case 'custom':
                return customUserAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.7204.96 Safari/537.36";
            case 'dynamic':
            default:
                try {
                    const fingerprint = await this.fingerprintService.getFingerprint();
                    return fingerprint.userAgent;
                }
                catch {
                    // 如果指紋服務失敗，使用預設瀏覽器 User-Agent 作為備用
                    this.logger.warn("指紋服務失敗，使用預設瀏覽器 User-Agent");
                    return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.7204.96 Safari/537.36";
                }
        }
    }
    /**
     * 獲取 HTML 內容
     */
    async fetchHtml(url, timeout, headers, userAgent) {
        const response = await fetch(url, {
            headers: {
                "User-Agent": userAgent,
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
                "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
                "Accept-Encoding": "gzip, deflate, br, zstd",
                "Cache-Control": "no-cache",
                "Pragma": "no-cache",
                "Sec-Ch-Ua": '"Chromium";v="138", "Not=A?Brand";v="8", "Google Chrome";v="138"',
                "Sec-Ch-Ua-Mobile": "?0",
                "Sec-Ch-Ua-Platform": '"Windows"',
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "none",
                "Sec-Fetch-User": "?1",
                "Upgrade-Insecure-Requests": "1",
                Connection: "keep-alive",
                ...headers,
            },
            // @ts-ignore - node-fetch timeout 設定
            timeout: timeout,
            follow: 5, // 最多 5 次重定向
        });
        if (!response.ok) {
            throw new FetchError(`HTTP ${response.status}: ${response.statusText}`, "HTTP_ERROR", response.status);
        }
        // 從回應中提取並存儲 cookies
        const urlObj = new URL(url);
        this.extractAndStoreCookies(urlObj.hostname, response);
        return await response.text();
    }
    /**
     * 應用防爬蟲延遲
     */
    async applyAntiCrawlerDelay(url) {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        // 基本延遲：最少 500ms
        let minDelay = 500;
        // 特定網站的特殊延遲設定
        const hostname = new URL(url).hostname.toLowerCase();
        if (hostname.includes('ptt.cc') || hostname.includes('dcard.tw')) {
            // 台灣其他熱門網站
            minDelay = 1000; // 1 秒
        }
        // 添加隨機延遲，模擬人類行為
        const randomDelay = Math.random() * 500; // 0-500ms 隨機延遲
        const totalMinDelay = minDelay + randomDelay;
        if (timeSinceLastRequest < totalMinDelay) {
            const delayNeeded = totalMinDelay - timeSinceLastRequest;
            this.logger.debug(`防爬蟲延遲: ${Math.round(delayNeeded)}ms`, {
                hostname,
                minDelay,
                randomDelay: Math.round(randomDelay),
                timeSinceLastRequest
            });
            await new Promise(resolve => setTimeout(resolve, delayNeeded));
        }
        this.lastRequestTime = Date.now();
    }
    /**
     * 建立增強的 HTTP Headers（針對反爬蟲優化）
     */
    buildEnhancedHeaders(url, userAgent, customHeaders) {
        // 基本瀏覽器 headers
        const baseHeaders = {
            "User-Agent": userAgent,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
            "Cache-Control": "max-age=0",
        };
        // 合併自定義 headers（允許覆蓋）
        return {
            ...baseHeaders,
            ...customHeaders,
        };
    }
    /**
     * 將存儲的 cookies 添加到請求 headers
     */
    addCookiesToHeaders(hostname, headers) {
        const cookies = this.cookieStore[hostname];
        if (cookies && cookies.length > 0) {
            headers["Cookie"] = cookies.join("; ");
            this.logger.debug("添加 cookies 到請求", {
                hostname,
                cookieCount: cookies.length
            });
        }
    }
    /**
     * 從回應中提取並存儲 cookies
     */
    extractAndStoreCookies(hostname, response) {
        const setCookieHeaders = response.headers.raw()["set-cookie"];
        if (setCookieHeaders) {
            if (!this.cookieStore[hostname]) {
                this.cookieStore[hostname] = [];
            }
            const newCookies = [];
            setCookieHeaders.forEach((cookieHeader) => {
                // 解析 cookie 字符串，提取 name=value 部分
                const cookieParts = cookieHeader.split(';');
                const nameValue = cookieParts[0].trim();
                if (nameValue) {
                    // 檢查是否已存在相同名稱的 cookie
                    const cookieName = nameValue.split('=')[0];
                    const existingIndex = this.cookieStore[hostname].findIndex(cookie => cookie.startsWith(`${cookieName}=`));
                    if (existingIndex >= 0) {
                        // 更新現有 cookie
                        this.cookieStore[hostname][existingIndex] = nameValue;
                    }
                    else {
                        // 添加新 cookie
                        this.cookieStore[hostname].push(nameValue);
                    }
                    newCookies.push(nameValue);
                }
            });
            if (newCookies.length > 0) {
                this.logger.debug("存儲新 cookies", {
                    hostname,
                    newCookies: newCookies.map(c => c.split('=')[0])
                });
            }
        }
    }
    /**
     * 為特定網站執行預訪問（獲取 session cookies）
     */
    async performPreAccessIfNeeded() {
        // 預訪問功能已移除，此方法保留以維持介面相容性
        return;
    }
    /**
     * 處理錯誤並智能重試
     */
    async handleErrorWithRetry(error, url, originalOptions) {
        const errorMessage = getErrorMessage(error);
        const is403Error = error instanceof FetchError && error.statusCode === 403;
        const isAccessDenied = errorMessage.toLowerCase().includes('access denied') ||
            errorMessage.includes('don\'t have permission');
        if (!is403Error && !isAccessDenied) {
            return null; // 不是需要重試的錯誤類型
        }
        const urlObj = new URL(url);
        this.logger.warn("檢測到訪問被拒絕，嘗試智能重試", {
            url: this.sanitizeUrl(url),
            errorType: is403Error ? 'HTTP 403' : 'Access Denied'
        });
        // 重試策略
        const retryStrategies = [
            {
                name: "清除 cookies 並重新獲取 session",
                action: async () => {
                    // 清除該域名的 cookies
                    delete this.cookieStore[urlObj.hostname];
                    this.logger.info("已清除域名 cookies，準備重新獲取");
                    return await this.retryWithOptions(originalOptions, "清除cookies重試");
                }
            },
            {
                name: "更換 User-Agent 重試",
                action: async () => {
                    const newFingerprint = await this.fingerprintService.resetFingerprint();
                    const retryOptions = {
                        ...originalOptions,
                        userAgentMode: 'dynamic',
                        customUserAgent: newFingerprint.userAgent
                    };
                    return await this.retryWithOptions(retryOptions, "更換UA重試");
                }
            },
            {
                name: "使用 SPA 模式重試",
                action: async () => {
                    if (!originalOptions.useSPA) {
                        const retryOptions = { ...originalOptions, useSPA: true };
                        return await this.fetchSPAWebpage(retryOptions);
                    }
                    return null;
                }
            }
        ];
        // 依次嘗試每個重試策略
        for (const strategy of retryStrategies) {
            try {
                this.logger.info(`嘗試重試策略: ${strategy.name}`);
                // 添加延遲避免過快重試
                await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));
                const result = await strategy.action();
                if (result && result.success) {
                    this.logger.info(`重試策略 "${strategy.name}" 成功`, {
                        contentLength: result.content.length
                    });
                    return result;
                }
            }
            catch (retryError) {
                this.logger.debug(`重試策略 "${strategy.name}" 失敗`, {
                    error: getErrorMessage(retryError)
                });
            }
        }
        this.logger.warn("所有重試策略均失敗", { url: this.sanitizeUrl(url) });
        return null;
    }
    /**
     * 使用指定選項重試獲取
     */
    async retryWithOptions(options, context) {
        this.logger.debug(`${context} - 重新嘗試獲取`, { url: this.sanitizeUrl(options.url) });
        return await this.fetchWebpage(options);
    }
    /**
     * 處理網頁內容
     */
    async processContent(html, options) {
        const { format, useReadability, includeImages, baseUrl, maxLength } = options;
        try {
            let processedHtml = html;
            let metadata;
            // 提取元數據
            metadata = this.extractMetadata(html);
            // 提取日期資訊
            const dateInfo = this.extractDateInfo(html);
            // 針對論壇網站，根據格式決定是否使用 Readability
            const urlObj = new URL(baseUrl);
            const isForumSite = urlObj.hostname.includes('ptt.cc') || urlObj.hostname.includes('dcard.tw');
            // 論壇網站在 markdown 和 text 格式時不使用 Readability，保留完整內容
            const shouldUseReadability = useReadability && !(isForumSite && (format === 'markdown' || format === 'text'));
            if (shouldUseReadability) {
                const readabilityResult = this.extractWithReadability(html);
                if (readabilityResult) {
                    processedHtml = readabilityResult.content;
                    // 更新元數據
                    metadata = {
                        ...metadata,
                        title: readabilityResult.title || metadata?.title,
                        description: readabilityResult.excerpt || metadata?.description,
                    };
                }
            }
            // 提取圖片資訊（如果啟用）
            let images;
            if (includeImages) {
                images = await this.extractImages(html, baseUrl);
            }
            // 根據格式返回相應內容
            let content;
            // 決定使用原始 HTML 還是處理後的 HTML
            const sourceHtml = shouldUseReadability ? processedHtml : html;
            switch (format) {
                case "html":
                    content = html; // 直接返回原始 HTML，不使用 Readability 處理
                    break;
                case "markdown":
                    content = this.convertToMarkdown(sourceHtml);
                    break;
                case "text":
                    content = this.extractPlainText(sourceHtml);
                    // 對純文字進行清理
                    content = this.cleanTextOutput(content);
                    break;
                case "json":
                    content = this.createJsonOutput(html, sourceHtml, metadata, images, baseUrl, maxLength, // 傳遞 maxLength 參數
                    dateInfo);
                    break;
                default:
                    content = this.convertToMarkdown(sourceHtml);
            }
            return { content, images, metadata, dateInfo };
        }
        catch {
            // 降級處理
            return this.fallbackExtraction(html, format);
        }
    }
    /**
     * Mozilla Readability 提取（參考 fetch 專案的簡潔方式）
     */
    extractWithReadability(html) {
        try {
            const dom = new JSDOM(html);
            const reader = new Readability(dom.window.document, {
                debug: false,
                maxElemsToParse: 0,
                nbTopCandidates: 5,
                charThreshold: 500,
            });
            const article = reader.parse();
            if (article?.content) {
                return {
                    content: article.content, // 保持 HTML 格式，讓 TurndownService 處理
                    title: article.title ?? undefined,
                    excerpt: article.excerpt ?? undefined,
                };
            }
            return null;
        }
        catch (error) {
            this.logger.warn("Readability 提取失敗:", error);
            return null;
        }
    }
    /**
     * 簡潔的 Markdown 轉換（參考 fetch 和 fetcher-mcp 專案）
     */
    convertToMarkdown(html) {
        try {
            // 如果已經是純文字，直接返回
            if (!html.includes("<")) {
                return html.trim();
            }
            // 預處理：徹底移除 CSS 和 JavaScript
            let processedHtml = html;
            // 移除 style 標籤及其內容
            processedHtml = processedHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
            // 移除 script 標籤及其內容
            processedHtml = processedHtml.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
            // 移除內聯樣式屬性
            processedHtml = processedHtml.replace(/\s+style\s*=\s*["'][^"']*["']/gi, '');
            // 移除 CSS 相關屬性
            processedHtml = processedHtml.replace(/\s+class\s*=\s*["'][^"']*["']/gi, '');
            // 移除 CSS 註釋
            processedHtml = processedHtml.replace(/\/\*[\s\S]*?\*\//g, '');
            // 使用 TurndownService 進行轉換
            let markdown = this.turndownService.turndown(processedHtml);
            // 基本清理
            markdown = this.cleanMarkdownOutput(markdown);
            return markdown.trim();
        }
        catch (error) {
            this.logger.error("Markdown 轉換失敗，使用純文字提取:", error);
            return this.extractPlainText(html);
        }
    }
    /**
     * 清理 Markdown 輸出（簡潔版本）
     */
    cleanMarkdownOutput(markdown) {
        return (markdown
            // 移除 HTML 註釋
            .replace(/<!--[\s\S]*?-->/g, "")
            // 處理常見的 HTML 實體
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            // 清理多餘的空白行
            .replace(/\n\s*\n\s*\n/g, "\n\n")
            // 移除行尾空白
            .replace(/[ \t]+$/gm, "")
            .trim());
    }
    /**
     * 設置 TurndownService 規則（簡化版本，參考 fetcher-mcp）
     */
    setupTurndownRules() {
        // 移除不需要的元素（包括內容）
        this.turndownService.remove([
            "script",
            "style",
            "noscript",
            "template",
            "nav",
            "menu",
            "aside",
            "footer",
            "form",
            "input",
            "button",
            "select",
            "textarea",
            "iframe",
            "embed",
            "object",
            "video",
            "audio",
        ]);
        // 處理容器標籤 - 移除但保留內容
        this.turndownService.addRule("containers", {
            filter: ["div", "span", "section", "article", "header", "main"],
            replacement: (content) => content,
        });
        // 處理換行和水平線
        this.turndownService.addRule("lineBreaks", {
            filter: "br",
            replacement: () => "\n",
        });
        this.turndownService.addRule("horizontalRule", {
            filter: "hr",
            replacement: () => "\n---\n",
        });
        // 改進鏈接處理
        this.turndownService.addRule("links", {
            filter: "a",
            replacement: (content, node) => {
                const href = node.getAttribute("href") || "";
                const text = content.trim();
                if (!href ||
                    href.startsWith("javascript:") ||
                    href.startsWith("data:")) {
                    return text;
                }
                if (!text || text === href) {
                    return href;
                }
                return `[${text}](${href})`;
            },
        });
        // 改進圖片處理
        this.turndownService.addRule("images", {
            filter: "img",
            replacement: (content, node) => {
                const alt = node.getAttribute("alt") || "";
                const src = node.getAttribute("src") || "";
                const title = node.getAttribute("title") || "";
                if (!src || src.includes("pixel.gif") || src.includes("spacer.gif")) {
                    return alt || "";
                }
                let result = `![${alt}](${src}`;
                if (title) {
                    result += ` "${title}"`;
                }
                result += ")";
                return result;
            },
        });
        // 簡化表格處理
        this.turndownService.addRule("simpleTables", {
            filter: ["table", "thead", "tbody", "tfoot", "tr", "td", "th"],
            replacement: (content, node) => {
                const tagName = node.nodeName.toLowerCase();
                if (tagName === "tr") {
                    return content + "\n";
                }
                else if (tagName === "td" || tagName === "th") {
                    return content + " | ";
                }
                return content;
            },
        });
    }
    /**
     * 清理純文字輸出（簡化版本）
     */
    cleanTextOutput(text) {
        return (text
            // 移除 HTML 標籤
            .replace(/<[^>]*>/g, "")
            // 處理常見的 HTML 實體
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            // 規範化空白
            .replace(/\s+/g, " ")
            .replace(/\n{3,}/g, "\n\n")
            .trim());
    }
    /**
     * 提取純文字
     */
    extractPlainText(html) {
        try {
            const dom = new JSDOM(html);
            return dom.window.document.body?.textContent?.trim() || "";
        }
        catch {
            // 降級處理
            return html
                .replace(/<[^>]+>/g, "")
                .replace(/\s+/g, " ")
                .trim();
        }
    }
    /**
     * 創建 JSON 格式輸出
     */
    createJsonOutput(originalHtml, processedHtml, metadata, images, url, maxLength, dateInfo) {
        // 使用傳入的 maxLength，如果未定義則使用預設值 5000（與 fetchWebpage 一致）
        const maxContentLength = maxLength ?? 5000;
        const truncatedHtml = processedHtml.length > maxContentLength
            ? processedHtml.substring(0, maxContentLength) + "..."
            : processedHtml;
        // 清理內容中的控制字符（為 Markdown 轉換準備）
        const cleanMarkdown = this.cleanControlCharacters(this.convertToMarkdown(truncatedHtml));
        // 清理 metadata 中的所有字符串字段
        const cleanMetadata = {};
        if (metadata) {
            for (const [key, value] of Object.entries(metadata)) {
                if (typeof value === "string") {
                    cleanMetadata[key] = this.cleanControlCharacters(value);
                }
                else {
                    cleanMetadata[key] = value;
                }
            }
        }
        // 使用傳入的日期資訊，如果未提供則提取
        const finalDateInfo = dateInfo || this.extractDateInfo(originalHtml);
        // 安全截斷 Markdown 內容以避免破壞 JSON 格式
        const wasTruncated = cleanMarkdown.length > maxContentLength;
        let truncatedMarkdown = cleanMarkdown;
        if (wasTruncated) {
            // 安全截斷：避免在特殊字符中間截斷
            let safeEnd = maxContentLength;
            const unsafeChars = ['"', "'", '`', '\\', '\n', '\r'];
            // 往前找安全的截斷位置（避免在特殊字符中間）
            while (safeEnd > maxContentLength - 100 && safeEnd > 0) {
                const char = cleanMarkdown[safeEnd];
                if (!unsafeChars.includes(char) && char !== undefined) {
                    break;
                }
                safeEnd--;
            }
            truncatedMarkdown = cleanMarkdown.substring(0, safeEnd) + "...";
            // 確保截斷後的內容能安全轉換為 JSON
            try {
                JSON.stringify(truncatedMarkdown);
            }
            catch {
                // 如果仍有問題，進一步清理並重新添加標記
                truncatedMarkdown = this.cleanControlCharacters(cleanMarkdown.substring(0, Math.min(safeEnd - 100, cleanMarkdown.length))) + "...";
            }
        }
        // 構建有序的 JSON 結果
        const jsonResult = {
            title: metadata?.title
                ? this.cleanControlCharacters(metadata.title)
                : undefined,
            url,
        };
        // 添加日期資訊（只有當存在時才添加），放在 content 之前
        if (finalDateInfo.publishedDate) {
            jsonResult.published_at = finalDateInfo.publishedDate;
        }
        if (finalDateInfo.modifiedDate) {
            jsonResult.modified_at = finalDateInfo.modifiedDate;
        }
        // 添加網頁完整長度資訊
        jsonResult.total_length = cleanMarkdown.length;
        // 最後添加內容
        jsonResult.content = truncatedMarkdown;
        // 如果內容被截斷，添加截斷提示（與其他格式保持一致）
        if (wasTruncated) {
            // 計算實際內容長度（不包括 "..." 標記）
            const actualContentLength = truncatedMarkdown.endsWith("...")
                ? truncatedMarkdown.length - 3
                : truncatedMarkdown.length;
            const nextStart = actualContentLength;
            jsonResult.note = `[內容截斷] 當前顯示: ${actualContentLength}/${cleanMarkdown.length} 字符\n如當前內容無法滿足分析需求，可使用 webpage_fetch 並設置 start_index: ${nextStart} 獲取後續內容`;
        }
        // 安全的 JSON 生成
        try {
            return JSON.stringify(jsonResult, null, 2);
        }
        catch (_jsonStringifyError) {
            // 如果 JSON.stringify 失敗，創建最小安全版本
            const safeResult = {
                title: metadata?.title
                    ? this.cleanControlCharacters(metadata.title).replace(/[^\x20-\x7E\u4e00-\u9fff]/g, '')
                    : undefined,
                url,
                content: '內容包含無法解析的字符，已清理',
                error: 'JSON 格式化過程中發現問題，已使用安全模式'
            };
            if (finalDateInfo.publishedDate) {
                safeResult.published_at = finalDateInfo.publishedDate;
            }
            if (finalDateInfo.modifiedDate) {
                safeResult.modified_at = finalDateInfo.modifiedDate;
            }
            return JSON.stringify(safeResult, null, 2);
        }
    }
    /**
     * 提取圖片資訊（參考 mcp-image-extractor）
     */
    async extractImages(html, baseUrl) {
        try {
            const dom = new JSDOM(html);
            const document = dom.window.document;
            const images = document.querySelectorAll("img");
            const imagePromises = Array.from(images).map(async (img) => {
                const src = img.getAttribute("src") || "";
                if (!src) {
                    return null;
                }
                const absoluteUrl = this.resolveUrl(src, baseUrl);
                const imageInfo = {
                    src: src,
                    alt: img.getAttribute("alt") || "",
                    title: img.getAttribute("title") ?? undefined,
                    width: img.getAttribute("width") ?? undefined,
                    height: img.getAttribute("height") ?? undefined,
                    absoluteUrl: absoluteUrl,
                };
                return imageInfo;
            });
            const results = await Promise.all(imagePromises);
            return results.filter((img) => img !== null);
        }
        catch {
            return [];
        }
    }
    /**
     * 提取網頁元數據
     */
    extractMetadata(html) {
        try {
            const dom = new JSDOM(html);
            const document = dom.window.document;
            return {
                title: this.getMetaContent(document, [
                    "title",
                    "og:title",
                    "twitter:title",
                ]) || document.querySelector("title")?.textContent?.trim(),
                description: this.getMetaContent(document, [
                    "description",
                    "og:description",
                    "twitter:description",
                ]),
                keywords: this.getMetaContent(document, ["keywords"]),
                author: this.getMetaContent(document, ["author", "og:author"]),
                publishedDate: this.getMetaContent(document, [
                    "article:published_time",
                    "datePublished",
                ]),
                modifiedDate: this.getMetaContent(document, [
                    "article:modified_time",
                    "dateModified",
                ]),
                language: this.getMetaContent(document, ["language"]) ||
                    document.documentElement.lang,
                siteName: this.getMetaContent(document, ["og:site_name"]),
                image: this.getMetaContent(document, ["og:image", "twitter:image"]),
            };
        }
        catch {
            return {};
        }
    }
    /**
     * 獲取 meta 標籤內容
     */
    getMetaContent(document, names) {
        for (const name of names) {
            const selectors = [
                `meta[name="${name}"]`,
                `meta[property="${name}"]`,
                `meta[itemprop="${name}"]`,
            ];
            for (const selector of selectors) {
                const element = document.querySelector(selector);
                if (element) {
                    const content = element.getAttribute("content");
                    if (content) {
                        return content.trim();
                    }
                }
            }
        }
        return undefined;
    }
    /**
     * 提取網頁發布時間和修改時間（增強版）
     */
    extractDateInfo(html) {
        try {
            const dom = new JSDOM(html);
            const document = dom.window.document;
            const result = {};
            // 1. 檢查 meta 標籤 - 分別處理修改日期和發布日期
            const modifiedSelectors = [
                'meta[itemprop="dateModified"]',
                'meta[property="article:modified_time"]',
                'meta[name="article:modified_time"]',
                'meta[property="og:updated_time"]',
            ];
            const publishedSelectors = [
                'meta[itemprop="datePublished"]',
                'meta[property="article:published_time"]',
                'meta[name="article:published_time"]',
                'meta[name="publishdate"]',
                'meta[name="date"]',
                'meta[property="og:published_time"]',
            ];
            // 提取修改日期
            for (const selector of modifiedSelectors) {
                const metaElement = document.querySelector(selector);
                if (metaElement) {
                    const content = metaElement.getAttribute("content");
                    if (content) {
                        const cleanDate = content.trim();
                        if (cleanDate) {
                            result.modifiedDate = cleanDate;
                            break;
                        }
                    }
                }
            }
            // 提取發布日期
            for (const selector of publishedSelectors) {
                const metaElement = document.querySelector(selector);
                if (metaElement) {
                    const content = metaElement.getAttribute("content");
                    if (content) {
                        const cleanDate = content.trim();
                        if (cleanDate) {
                            result.publishedDate = cleanDate;
                            break;
                        }
                    }
                }
            }
            // 2. 檢查 JSON-LD 結構化資料
            const scriptElements = document.querySelectorAll('script[type="application/ld+json"]');
            for (const script of scriptElements) {
                try {
                    const jsonData = JSON.parse(script.textContent || "");
                    const dateInfo = this.extractDateFromJsonLd(jsonData);
                    // 如果還沒有相應的日期，則設定它們
                    if (dateInfo.modifiedDate && !result.modifiedDate) {
                        result.modifiedDate = dateInfo.modifiedDate;
                    }
                    if (dateInfo.publishedDate && !result.publishedDate) {
                        result.publishedDate = dateInfo.publishedDate;
                    }
                    // 如果兩個日期都找到了，就停止搜索
                    if (result.modifiedDate && result.publishedDate) {
                        break;
                    }
                }
                catch {
                    // 忽略 JSON 解析錯誤
                }
            }
            // 3. 檢查 time 元素作為備用
            if (!result.publishedDate && !result.modifiedDate) {
                const timeElement = document.querySelector("time[datetime]");
                if (timeElement) {
                    const datetime = timeElement.getAttribute("datetime");
                    if (datetime) {
                        const cleanDate = datetime.trim();
                        if (cleanDate) {
                            // 如果不確定是哪種日期，優先當作發布日期
                            result.publishedDate = cleanDate;
                        }
                    }
                }
            }
            // 4. 嘗試從傳統 CSS 類名中提取（降級選項）
            if (!result.publishedDate) {
                const traditionalSelectors = [
                    'time[pubdate]',
                    '.published',
                    '.date',
                    '.post-date',
                    '.article-date'
                ];
                for (const selector of traditionalSelectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        let dateStr = element.getAttribute('datetime') ||
                            element.textContent;
                        if (dateStr) {
                            dateStr = dateStr.trim();
                            const cleanDate = dateStr;
                            if (cleanDate) {
                                result.publishedDate = cleanDate;
                                break;
                            }
                        }
                    }
                }
            }
            return result;
        }
        catch {
            return {};
        }
    }
    /**
     * 從 JSON-LD 結構化資料中提取日期
     */
    extractDateFromJsonLd(jsonData) {
        const result = {};
        if (!jsonData) {
            return result;
        }
        // 處理陣列格式的 JSON-LD
        if (Array.isArray(jsonData)) {
            for (const item of jsonData) {
                const dateInfo = this.extractDateFromJsonLd(item);
                // 合併結果，優先保留已找到的日期
                if (dateInfo.modifiedDate && !result.modifiedDate) {
                    result.modifiedDate = dateInfo.modifiedDate;
                }
                if (dateInfo.publishedDate && !result.publishedDate) {
                    result.publishedDate = dateInfo.publishedDate;
                }
                // 如果兩個日期都找到了，就停止搜索
                if (result.modifiedDate && result.publishedDate) {
                    break;
                }
            }
            return result;
        }
        // 檢查修改日期欄位
        const modifiedFields = ["dateModified"];
        for (const field of modifiedFields) {
            if (jsonData[field] && !result.modifiedDate) {
                result.modifiedDate = jsonData[field];
                break;
            }
        }
        // 檢查發布日期欄位
        const publishedFields = [
            "datePublished",
            "dateCreated",
            "publishDate",
            "uploadDate",
        ];
        for (const field of publishedFields) {
            if (jsonData[field] && !result.publishedDate) {
                result.publishedDate = jsonData[field];
                break;
            }
        }
        // 檢查嵌套的對象
        if (jsonData["@graph"] && (!result.modifiedDate || !result.publishedDate)) {
            const nestedInfo = this.extractDateFromJsonLd(jsonData["@graph"]);
            if (nestedInfo.modifiedDate && !result.modifiedDate) {
                result.modifiedDate = nestedInfo.modifiedDate;
            }
            if (nestedInfo.publishedDate && !result.publishedDate) {
                result.publishedDate = nestedInfo.publishedDate;
            }
        }
        return result;
    }
    /**
     * 分片內容處理
     */
    applyContentSlicing(content, startIndex, maxLength, format) {
        if (startIndex >= content.length) {
            return "<error>起始位置超出內容長度</error>";
        }
        // JSON 格式也需要遵循用戶的 maxLength 設定
        // 如果是 JSON 格式且內容看起來已經是完整的 JSON，則直接返回
        if (format === "json" && content.trim().startsWith('{') && content.trim().endsWith('}')) {
            // JSON 格式已經在 createJsonOutput 中處理了截斷，直接返回
            return content;
        }
        const endIndex = Math.min(startIndex + maxLength, content.length);
        const slicedContent = content.slice(startIndex, endIndex);
        this.logger.debug("截斷邏輯詳細信息", {
            contentLength: content.length,
            startIndex,
            maxLength,
            endIndex,
            willTruncate: endIndex < content.length,
            slicedLength: slicedContent.length,
            format,
        });
        // 如果內容被截斷，添加提示
        if (endIndex < content.length) {
            const nextStart = endIndex;
            const remaining = content.length - endIndex;
            const truncationMessage = `\n\n[內容截斷] 當前顯示: ${endIndex}/${content.length} 字符\n` +
                `如當前內容無法滿足分析需求，可使用 webpage_fetch 並設置 start_index: ${nextStart} 獲取後續內容`;
            this.logger.debug("添加截斷提示", {
                nextStart,
                remaining,
                truncationMessage: truncationMessage.substring(0, 100) + "...",
            });
            return slicedContent + "..." + truncationMessage;
        }
        return slicedContent;
    }
    /**
     * URL 解析助手
     */
    resolveUrl(url, baseUrl) {
        try {
            return new URL(url, baseUrl).toString();
        }
        catch {
            return url;
        }
    }
    /**
     * 正則表達式轉義
     */
    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    /**
     * 清理控制字符以確保 JSON 安全
     */
    cleanControlCharacters(text) {
        // 移除所有控制字符，包括換行符，因為它們會破壞 JSON
        return text
            .replace(/[\x00-\x1F\x7F]/g, " ") // 替換控制字符為空格
            .replace(/\s+/g, " ") // 合併多個空格
            .trim(); // 移除首尾空格
    }
    /**
     * 降級內容提取
     */
    fallbackExtraction(html, format) {
        try {
            const text = this.extractPlainText(html);
            const metadata = this.extractMetadata(html);
            const dateInfo = this.extractDateInfo(html);
            let content;
            switch (format) {
                case "html":
                    content = html;
                    break;
                case "markdown":
                    content = text;
                    break;
                case "text":
                    content = text;
                    break;
                case "json":
                    content = JSON.stringify({
                        title: metadata?.title,
                        published_at: dateInfo.publishedDate,
                        modified_at: dateInfo.modifiedDate,
                        content: text,
                        metadata
                    }, null, 2);
                    break;
                default:
                    content = text;
            }
            return { content, metadata, dateInfo };
        }
        catch (error) {
            return {
                content: `<error>內容提取失敗: ${getErrorMessage(error)}</error>`,
            };
        }
    }
    /**
     * 錯誤處理
     */
    handleFetchError(error, url) {
        // 如果已經是 FetchError，直接拋出
        if (error instanceof FetchError) {
            return error;
        }
        // 網路連接錯誤
        if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
            return new FetchError(`無法連接到 ${url}：網路連接失敗`, "NETWORK_ERROR");
        }
        // 超時錯誤
        if (error.name === "AbortError" || error.message.includes("timeout")) {
            return new FetchError(`請求 ${url} 超時`, "TIMEOUT");
        }
        // HTTP 狀態錯誤
        if (error.message.includes("HTTP")) {
            return new FetchError(`獲取 ${url} 失敗：${error.message}`, "HTTP_ERROR");
        }
        // URL 格式錯誤
        if (error.name === "TypeError" && error.message.includes("Invalid URL")) {
            return new FetchError(`無效的 URL 格式：${url}`, "INVALID_URL");
        }
        // 其他錯誤
        return new FetchError(`獲取網頁內容失敗：${getErrorMessage(error)}`, "UNKNOWN_ERROR");
    }
    /**
     * 清理 URL 用於日誌記錄
     */
    sanitizeUrl(url) {
        try {
            const parsed = new URL(url);
            return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
        }
        catch {
            return url.length > 100 ? url.substring(0, 100) + "..." : url;
        }
    }
    /**
     * 批量並行獲取網頁（優化版：共享瀏覽器實例）
     */
    async batchFetch(urls, options = {}) {
        this.logger.info("開始批量獲取", {
            urlCount: urls.length,
            maxConcurrency: this.concurrencyLimiter.maxConcurrency,
            useSPA: options.useSPA,
        });
        const startTime = Date.now();
        // 統一使用 executeSingleFetch 路徑，確保降級機制正常工作
        // 這樣 SPA 模式會通過 PlaywrightNodeBridge，遇到問題時自動降級
        const fetchTasks = urls.map((url, index) => ({
            task: () => this.executeSingleFetch(url, options, index),
            name: `Fetch-${index + 1}: ${this.sanitizeUrl(url)}`,
            priority: "normal",
        }));
        const results = await this.concurrencyLimiter.executeAll(fetchTasks, {
            failFast: false,
            timeout: (options.timeout || this.defaultTimeout) + 10000,
            onProgress: (completed, total, error) => {
                this.logger.debug("批量獲取進度", {
                    completed,
                    total,
                    percentage: Math.round((completed / total) * 100),
                    hasError: !!error,
                });
            },
        });
        // 處理結果
        const batchResults = results.map((result, index) => {
            if (result.success && result.result) {
                return result.result;
            }
            else {
                this.logger.warn("單個獲取失敗", {
                    url: urls[index],
                    taskName: result.taskName,
                    error: result.error?.message || "未知錯誤",
                });
                return {
                    url: urls[index],
                    success: false,
                    result: {
                        success: false,
                        content: "",
                        error: result.error?.message || "未知錯誤",
                        url: urls[index],
                        format: options.format || "markdown",
                        timestamp: new Date().toISOString(),
                        originalLength: 0,
                    },
                    duration: result.duration,
                    index,
                };
            }
        });
        const totalDuration = Date.now() - startTime;
        this.logBatchResults(batchResults, totalDuration);
        return batchResults;
    }
    // 移除了 batchFetchWithSharedBrowser 方法，統一使用 executeSingleFetch 路徑
    // 這確保了所有請求都通過 PlaywrightNodeBridge 和自動降級機制
    /**
     * 記錄批量獲取結果統計
     */
    logBatchResults(results, totalDuration) {
        const successCount = results.filter((r) => r.success).length;
        const totalContentLength = results
            .filter((r) => r.success)
            .reduce((sum, r) => sum + r.result.content.length, 0);
        this.logger.info("批量獲取完成", {
            total: results.length,
            success: successCount,
            failed: results.length - successCount,
            totalDuration,
            averageDuration: Math.round(results.reduce((sum, r) => sum + r.duration, 0) / results.length),
            totalContentLength,
        });
    }
    /**
     * 執行單個獲取任務
     */
    async executeSingleFetch(url, options, index) {
        const startTime = Date.now();
        try {
            // 根據選項選擇獲取方法
            let result;
            const fetchOptions = { ...options, url };
            if (options.useSPA) {
                try {
                    result = await this.fetchSPAWebpage({
                        ...fetchOptions,
                        userAgentMode: options.userAgentMode,
                        customUserAgent: options.customUserAgent
                    });
                }
                catch (spaError) {
                    this.logger.debug("SPA模式失敗，降級到標準模式", {
                        url: this.sanitizeUrl(url),
                        error: spaError instanceof Error ? spaError.message : String(spaError),
                    });
                    result = await this.fetchWebpage({
                        ...fetchOptions,
                        userAgentMode: options.userAgentMode,
                        customUserAgent: options.customUserAgent
                    });
                }
            }
            else {
                result = await this.fetchWebpage({
                    ...fetchOptions,
                    userAgentMode: options.userAgentMode,
                    customUserAgent: options.customUserAgent
                });
            }
            const duration = Date.now() - startTime;
            this.logger.debug("單個獲取完成", {
                url: this.sanitizeUrl(url),
                duration,
                contentLength: result.content.length,
                success: result.success,
            });
            return {
                url,
                success: result.success,
                result,
                duration,
                index,
            };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            this.logger.warn("單個獲取失敗", {
                url: this.sanitizeUrl(url),
                duration,
                error: error.message,
            });
            return {
                url,
                success: false,
                result: {
                    success: false,
                    content: "",
                    error: error.message,
                    url,
                    format: options.format || "markdown",
                    timestamp: new Date().toISOString(),
                },
                duration,
                index,
            };
        }
    }
    /**
     * 創建並行標籤頁處理（為 SPA 優化）
     */
    async createManagedPages(count) {
        return await this.browserPool.createTabs(count);
    }
    /**
     * 清理資源
     */
    async cleanup() {
        this.logger.info("開始清理 Fetcher 資源");
        try {
            await this.browserPool.cleanup();
            this.logger.info("Fetcher 資源清理完成");
        }
        catch (error) {
            this.logger.warn("Fetcher 資源清理失敗", error);
        }
    }
    /**
     * 獲取批量統計信息
     */
    getBatchStats() {
        return {
            concurrency: this.concurrencyLimiter.getStats(),
            browser: this.browserPool.getStats(),
        };
    }
}
//# sourceMappingURL=fetcher.js.map