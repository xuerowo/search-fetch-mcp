#!/usr/bin/env node
/**
 * 現代化的 DuckDuckGo MCP 伺服器
 * 使用最新的 McpServer API 和 Zod 驗證
 */
export declare class DuckDuckGoMCPServer {
    private server;
    private searcher;
    private fetcher;
    private rateLimiter;
    private logger;
    private config;
    constructor();
    /**
     * 設置所有 MCP 工具
     */
    private setupTools;
    /**
     * 註冊 DuckDuckGo 搜索工具
     */
    private registerDdgSearchTool;
    /**
     * 註冊網頁獲取工具
     */
    private registerWebpageFetchTool;
    /**
     * 註冊批量搜索工具
     */
    private registerBatchSearchTool;
    /**
     * 註冊批量獲取工具
     */
    private registerBatchFetchTool;
    /**
     * 處理搜索請求
     */
    private handleSearch;
    /**
     * 處理網頁獲取請求
     */
    private handleFetch;
    /**
     * 處理批量搜索請求
     */
    private handleBatchSearch;
    /**
     * 處理批量網頁獲取請求
     */
    private handleBatchFetch;
    private validateBatchQueries;
    private calculateBatchStats;
    private formatBatchSearchResults;
    private validateBatchUrls;
    private calculateBatchFetchStats;
    private formatBatchFetchResults;
    private sanitizeBatchUrls;
    private attemptJsonRepair;
    private extractDataFromBrokenJson;
    private formatFetchResult;
    private sanitizeUrl;
    private sanitizeFetchArgs;
    private formatSearchResults;
    private sanitizeQuery;
    private calculateOptimalConcurrency;
    private calculateQueryDelay;
    /**
     * 連接 Transport（用於 HTTP 模式的動態 transport 創建）
     * @param transport - Transport 實例
     */
    connectTransport(transport: any): Promise<void>;
    /**
     * 啟動 MCP 伺服器（stdio transport）
     */
    run(): Promise<void>;
}
//# sourceMappingURL=index.d.ts.map