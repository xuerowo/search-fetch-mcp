/**
 * 輸入資料驗證器
 */
export declare class InputValidator {
    static validateQuery(query: any): string;
    static validateCount(count: any, maxCount?: number): number;
    static validateLanguage(language: any): string;
    /**
     * 驗證安全搜索等級設定
     * @param safeSearch - 待驗證的安全搜索值
     * @returns 標準化的安全搜索等級
     * @throws {ValidationError} 當安全搜索選項無效時
     */
    static validateSafeSearch(safeSearch: any): string;
    /**
     * 驗證時間範圍過濾參數
     * @param timeRange - 待驗證的時間範圍值
     * @returns 標準化的時間範圍或 undefined
     * @throws {ValidationError} 當時間範圍選項無效時
     */
    static validateTimeRange(timeRange: any): string | undefined;
    /**
     * 檢查字串是否包含惡意內容
     * @param query - 待檢查的字串
     * @returns 如果包含惡意模式則返回 true
     * @private
     */
    private static containsMaliciousContent;
    /**
     * 清理和標準化查詢字串
     * @param query - 待清理的查詢字串
     * @returns 清理後的查詢字串
     */
    static sanitizeQuery(query: string): string;
    /**
     * 驗證整個搜索請求
     */
    static validateSearchRequest(params: {
        query?: any;
        count?: any;
        language?: any;
        safeSearch?: any;
        timeRange?: any;
    }, maxCount?: number): {
        query: string;
        count: number;
        language: string;
        safeSearch: string;
        timeRange: string | undefined;
    };
    /**
     * 驗證批量請求
     */
    static validateBatchRequest(requests: any[]): any[];
    /**
     * 驗證 URL 格式
     */
    static validateUrl(url: any): string;
    /**
     * 驗證 Fetch 請求參數
     */
    static validateFetchRequest(params: {
        url?: any;
        format?: any;
        maxLength?: any;
        useSPA?: any;
        start_index?: any;
        useReadability?: any;
    }, defaults?: {
        format?: string;
        useSPA?: boolean;
        useReadability?: boolean;
    }): {
        url: string;
        format: string;
        maxLength: number;
        useSPA: boolean;
        startIndex: number;
        useReadability: boolean;
        timeout: number;
        headers: {};
        respectRobots: boolean;
        includeImages: boolean;
        waitUntil: "domcontentloaded";
    };
    /**
     * 驗證輸出格式
     */
    static validateFormat(format: any, defaultFormat?: string): string;
    /**
     * 驗證最大內容長度
     */
    static validateMaxLength(maxLength: any): number;
    /**
     * 驗證起始索引
     */
    static validateStartIndex(startIndex: any): number;
    /**
     * 驗證超時時間
     */
    static validateTimeout(timeout: any): number;
    /**
     * 驗證請求頭
     */
    static validateHeaders(headers: any): Record<string, string>;
    /**
     * 驗證布林值
     */
    static validateBoolean(value: any, fieldName: string, defaultValue?: boolean): boolean;
    /**
     * 驗證等待條件
     */
    static validateWaitUntil(waitUntil: any): string;
}
//# sourceMappingURL=validator.d.ts.map