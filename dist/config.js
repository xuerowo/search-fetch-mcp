/**
 * MCP 伺服器預設配置
 * 包含搜索、網頁獲取、速率限制和日誌記錄的預設設定
 */
export const defaultConfig = {
    name: "search-fetch-mcp",
    version: "1.0.0",
    rateLimits: {
        requestsPerSecond: 1,
    },
    search: {
        defaultCount: 10,
        maxCount: 50,
        timeout: 30000, // 30 秒
        defaultLanguage: "wt-wt", // 全球
        defaultSafeSearch: "moderate",
    },
    logging: {
        level: "warn", // 簡化日誌輸出，只記錄警告和錯誤
        logQueries: false, // 安全考量，默認不記錄查詢
    },
    fetch: {
        defaultFormat: "markdown", // 預設使用 Markdown 格式，適合閱讀
        defaultUseSPA: true, // 預設啟用 SPA 模式，適合現代動態網站
        defaultUseReadability: true, // 預設啟用 Readability，提取主要內容
    },
};
/**
 * 從環境變量載入配置
 */
export function loadConfig() {
    return {
        ...defaultConfig,
        rateLimits: {
            requestsPerSecond: parseInt(process.env.RATE_LIMIT_RPS ||
                defaultConfig.rateLimits.requestsPerSecond.toString()),
        },
        search: {
            ...defaultConfig.search,
            timeout: parseInt(process.env.SEARCH_TIMEOUT || defaultConfig.search.timeout.toString()),
            defaultLanguage: process.env.DEFAULT_LANGUAGE || defaultConfig.search.defaultLanguage,
            defaultSafeSearch: process.env.DEFAULT_SAFE_SEARCH ||
                defaultConfig.search.defaultSafeSearch,
        },
        logging: {
            level: process.env.LOG_LEVEL || defaultConfig.logging.level,
            logQueries: process.env.LOG_QUERIES === "true" || defaultConfig.logging.logQueries,
        },
        fetch: {
            defaultFormat: process.env.DEFAULT_FETCH_FORMAT ||
                defaultConfig.fetch.defaultFormat,
            defaultUseSPA: process.env.DEFAULT_USE_SPA === "false" ? false :
                process.env.DEFAULT_USE_SPA === "true" ? true :
                    defaultConfig.fetch.defaultUseSPA,
            defaultUseReadability: process.env.DEFAULT_USE_READABILITY === "false" ? false :
                process.env.DEFAULT_USE_READABILITY === "true" ? true :
                    defaultConfig.fetch.defaultUseReadability,
        },
    };
}
/**
 * 驗證配置有效性
 */
export function validateConfig(config) {
    if (config.rateLimits.requestsPerSecond <= 0) {
        throw new Error("每秒請求數必須大於 0");
    }
    if (config.search.maxCount > 100) {
        throw new Error("最大搜索結果數不能超過 100");
    }
    if (config.search.timeout < 1000) {
        throw new Error("搜索超時時間不能少於 1000ms");
    }
    // 驗證 fetch 配置
    const validFormats = ["html", "markdown", "text", "json"];
    if (!validFormats.includes(config.fetch.defaultFormat)) {
        throw new Error(`無效的預設格式: ${config.fetch.defaultFormat}。支援的格式: ${validFormats.join(", ")}`);
    }
}
/**
 * 支援的語言代碼 (根據 DuckDuckGo 官方文檔更新)
 */
export const supportedLanguages = [
    "wt-wt", // 全球/所有地區 (預設)
    // 美洲
    "ar-es", // 阿根廷 (西班牙語)
    "br-pt", // 巴西 (葡萄牙語)
    "ca-en", // 加拿大 (英語)
    "ca-fr", // 加拿大 (法語)
    "cl-es", // 智利 (西班牙語)
    "co-es", // 哥倫比亞 (西班牙語)
    "mx-es", // 墨西哥 (西班牙語)
    "pe-es", // 秘魯 (西班牙語)
    "us-en", // 美國 (英語)
    "xl-es", // 拉丁美洲 (西班牙語)
    // 歐洲
    "at-de", // 奧地利 (德語)
    "be-fr", // 比利時 (法語)
    "be-nl", // 比利時 (荷蘭語)
    "bg-bg", // 保加利亞 (保加利亞語)
    "ch-de", // 瑞士 (德語)
    "ch-fr", // 瑞士 (法語)
    "ct-ca", // 加泰隆尼亞 (加泰隆尼亞語)
    "cz-cs", // 捷克 (捷克語)
    "de-de", // 德國 (德語)
    "dk-da", // 丹麥 (丹麥語)
    "ee-et", // 愛沙尼亞 (愛沙尼亞語)
    "es-es", // 西班牙 (西班牙語)
    "fi-fi", // 芬蘭 (芬蘭語)
    "fr-fr", // 法國 (法語)
    "gr-el", // 希臘 (希臘語)
    "hr-hr", // 克羅埃西亞 (克羅埃西亞語)
    "hu-hu", // 匈牙利 (匈牙利語)
    "ie-en", // 愛爾蘭 (英語)
    "is-is", // 冰島 (冰島語)
    "it-it", // 義大利 (義大利語)
    "lv-lv", // 拉脫維亞 (拉脫維亞語)
    "lt-lt", // 立陶宛 (立陶宛語)
    "nl-nl", // 荷蘭 (荷蘭語)
    "no-no", // 挪威 (挪威語)
    "pl-pl", // 波蘭 (波蘭語)
    "pt-pt", // 葡萄牙 (葡萄牙語)
    "ro-ro", // 羅馬尼亞 (羅馬尼亞語)
    "ru-ru", // 俄羅斯 (俄語)
    "se-sv", // 瑞典 (瑞典語)
    "sk-sk", // 斯洛伐克 (斯洛伐克語)
    "sl-sl", // 斯洛維尼亞 (斯洛維尼亞語)
    "uk-en", // 英國 (英語)
    // 亞太地區
    "au-en", // 澳洲 (英語)
    "cn-zh", // 中國 (中文)
    "hk-tzh", // 香港 (繁體中文)
    "tw-tzh", // 台灣 (繁體中文)
    "id-en", // 印尼 (英語)
    "id-id", // 印尼 (印尼語)
    "in-en", // 印度 (英語)
    "il-en", // 以色列 (英語)
    "jp-jp", // 日本 (日語)
    "kr-kr", // 韓國 (韓語)
    "my-en", // 馬來西亞 (英語)
    "my-ms", // 馬來西亞 (馬來語)
    "nz-en", // 紐西蘭 (英語)
    "ph-en", // 菲律賓 (英語)
    "ph-tl", // 菲律賓 (塔加拉語)
    "pk-en", // 巴基斯坦 (英語)
    "sg-en", // 新加坡 (英語)
    "th-th", // 泰國 (泰語)
    // 中東/非洲
    "xa-ar", // 阿拉伯地區 (阿拉伯語)
    "xa-en", // 阿拉伯地區 (英語)
    "za-en", // 南非 (英語)
];
//# sourceMappingURL=config.js.map