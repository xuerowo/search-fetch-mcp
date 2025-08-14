import { Logger } from "./logger.js";
/**
 * 瀏覽器指紋配置介面（參考g-search-mcp）
 */
export interface FingerprintConfig {
    deviceName: string;
    locale: string;
    timezoneId: string;
    colorScheme: "dark" | "light";
    reducedMotion: "reduce" | "no-preference";
    forcedColors: "active" | "none";
    userAgent: string;
    viewport: {
        width: number;
        height: number;
    };
    deviceScaleFactor: number;
}
/**
 * 瀏覽器指紋偽造服務
 *
 * 功能特色（基於g-search-mcp優化）：
 * - 基於主機環境的智能指紋生成
 * - 會話狀態持久化和復用
 * - 多設備類型支援和隨機選擇
 * - 反檢測參數優化
 */
export declare class FingerprintService {
    private logger;
    private stateFile;
    private currentFingerprint;
    private sessionId;
    private readonly VERSION_CHECK_INTERVAL;
    private readonly deviceList;
    private readonly timezoneList;
    private readonly userAgents;
    constructor(logger?: Logger, stateFile?: string);
    /**
     * 獲取或生成瀏覽器指紋配置
     */
    getFingerprint(forceNew?: boolean): Promise<FingerprintConfig>;
    /**
     * 基於主機環境生成指紋配置（參考g-search-mcp）
     */
    private generateFingerprint;
    /**
     * 獲取主機實際配置（基於g-search-mcp實現）
     */
    private getHostMachineConfig;
    /**
     * 獲取設備配置
     */
    private getDeviceConfig;
    /**
     * 獲取隨機User-Agent
     */
    private getRandomUserAgent;
    /**
     * 生成會話ID
     */
    private generateSessionId;
    /**
     * 載入持久化狀態
     */
    private loadState;
    /**
     * 保存持久化狀態
     */
    private saveState;
    /**
     * 重置指紋（強制生成新的）
     */
    resetFingerprint(): Promise<FingerprintConfig>;
    /**
     * 獲取當前會話ID
     */
    getSessionId(): string;
    /**
     * 檢查 User-Agent 版本是否過舊
     */
    private checkUserAgentVersions;
    /**
     * 清理持久化狀態
     */
    cleanupState(): void;
}
/**
 * 創建指紋服務的工廠函數
 */
export declare function createFingerprintService(logger?: Logger, stateFile?: string): FingerprintService;
//# sourceMappingURL=fingerprint-service.d.ts.map