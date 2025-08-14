import { ServerConfig } from "./types.js";
/**
 * MCP 伺服器預設配置
 * 包含搜索、網頁獲取、速率限制和日誌記錄的預設設定
 */
export declare const defaultConfig: ServerConfig;
/**
 * 從環境變量載入配置
 */
export declare function loadConfig(): ServerConfig;
/**
 * 驗證配置有效性
 */
export declare function validateConfig(config: ServerConfig): void;
/**
 * 支援的語言代碼 (根據 DuckDuckGo 官方文檔更新)
 */
export declare const supportedLanguages: readonly ["wt-wt", "ar-es", "br-pt", "ca-en", "ca-fr", "cl-es", "co-es", "mx-es", "pe-es", "us-en", "xl-es", "at-de", "be-fr", "be-nl", "bg-bg", "ch-de", "ch-fr", "ct-ca", "cz-cs", "de-de", "dk-da", "ee-et", "es-es", "fi-fi", "fr-fr", "gr-el", "hr-hr", "hu-hu", "ie-en", "is-is", "it-it", "lv-lv", "lt-lt", "nl-nl", "no-no", "pl-pl", "pt-pt", "ro-ro", "ru-ru", "se-sv", "sk-sk", "sl-sl", "uk-en", "au-en", "cn-zh", "hk-tzh", "tw-tzh", "id-en", "id-id", "in-en", "il-en", "jp-jp", "kr-kr", "my-en", "my-ms", "nz-en", "ph-en", "ph-tl", "pk-en", "sg-en", "th-th", "xa-ar", "xa-en", "za-en"];
export type SupportedLanguage = (typeof supportedLanguages)[number];
//# sourceMappingURL=config.d.ts.map