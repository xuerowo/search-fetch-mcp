import { devices } from "playwright";
import { Logger } from "./logger.js";
import fs from "fs";
import path from "path";
import os from "os";
/**
 * 瀏覽器指紋偽造服務
 *
 * 功能特色（基於g-search-mcp優化）：
 * - 基於主機環境的智能指紋生成
 * - 會話狀態持久化和復用
 * - 多設備類型支援和隨機選擇
 * - 反檢測參數優化
 */
export class FingerprintService {
    logger;
    stateFile;
    currentFingerprint = null;
    sessionId;
    // User-Agent 版本更新檢查（每 30 天檢查一次）
    VERSION_CHECK_INTERVAL = 30 * 24 * 60 * 60 * 1000; // 30 天
    // 支援的設備類型列表（增強版 - 2025年優化）
    deviceList = [
        "Desktop Chrome Linux",
        "Desktop Chrome",
        "Desktop Edge",
        "Desktop Firefox",
        "Desktop Safari",
        "Mobile Safari",
        "Mobile Chrome Android",
        "Desktop Brave",
        "Desktop Opera",
    ];
    // 時區列表
    timezoneList = [
        "America/New_York",
        "Europe/London",
        "Asia/Shanghai",
        "Asia/Taipei",
        "Europe/Berlin",
        "Asia/Tokyo",
        "Australia/Sydney",
    ];
    // User-Agent池（針對反檢測優化 - 2025年7月最新版本）
    userAgents = {
        "Desktop Chrome": [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.7204.96 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.7204.96 Safari/537.36",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.7204.96 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.6975.112 Safari/537.36",
        ],
        "Desktop Chrome Linux": [
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.7204.96 Safari/537.36",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.6975.112 Safari/537.36",
        ],
        "Desktop Edge": [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.7204.96 Safari/537.36 Edg/137.0.3296.62",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.6975.112 Safari/537.36 Edg/136.0.3240.115",
        ],
        "Desktop Firefox": [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Firefox/140.0",
            "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:139.0) Gecko/20100101 Firefox/139.0",
        ],
        "Desktop Safari": [
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
        ],
        "Mobile Safari": [
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
            "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
        ],
        "Mobile Chrome Android": [
            "Mozilla/5.0 (Linux; Android 14; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.7204.96 Mobile Safari/537.36",
            "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.7204.96 Mobile Safari/537.36",
            "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.6975.112 Mobile Safari/537.36",
        ],
        "Desktop Brave": [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.7204.96 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.7204.96 Safari/537.36",
        ],
        "Desktop Opera": [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.7204.96 Safari/537.36 OPR/104.0.0.0",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.7204.96 Safari/537.36 OPR/104.0.0.0",
        ],
    };
    constructor(logger, stateFile) {
        this.logger = logger || new Logger({ level: "info", logQueries: false });
        this.stateFile =
            stateFile || path.join(os.tmpdir(), "search-fetch-mcp-fingerprint.json");
        this.sessionId = this.generateSessionId();
        this.logger.debug("指紋服務初始化", {
            stateFile: this.stateFile,
            sessionId: this.sessionId,
        });
        // 檢查 User-Agent 版本是否過舊
        this.checkUserAgentVersions();
    }
    /**
     * 獲取或生成瀏覽器指紋配置
     */
    async getFingerprint(forceNew = false) {
        // 如果已有當前指紋且不強制更新，直接返回
        if (this.currentFingerprint && !forceNew) {
            return this.currentFingerprint;
        }
        // 嘗試從持久化狀態載入
        const savedState = this.loadState();
        if (savedState.fingerprint && !forceNew) {
            this.logger.info("使用已保存的指紋配置");
            this.currentFingerprint = savedState.fingerprint;
            return this.currentFingerprint;
        }
        // 生成新的指紋配置
        this.logger.info("生成新的指紋配置");
        this.currentFingerprint = this.generateFingerprint();
        // 保存新指紋
        this.saveState({
            fingerprint: this.currentFingerprint,
            lastUpdate: Date.now(),
            sessionId: this.sessionId,
        });
        return this.currentFingerprint;
    }
    /**
     * 基於主機環境生成指紋配置（參考g-search-mcp）
     */
    generateFingerprint() {
        const hostConfig = this.getHostMachineConfig();
        const deviceConfig = this.getDeviceConfig();
        this.logger.info("基於主機環境生成指紋", {
            platform: os.platform(),
            locale: hostConfig.locale,
            timezone: hostConfig.timezoneId,
            deviceName: hostConfig.deviceName,
        });
        return {
            deviceName: hostConfig.deviceName,
            locale: hostConfig.locale,
            timezoneId: hostConfig.timezoneId,
            colorScheme: hostConfig.colorScheme,
            reducedMotion: hostConfig.reducedMotion,
            forcedColors: hostConfig.forcedColors,
            userAgent: this.getRandomUserAgent(hostConfig.deviceName),
            viewport: deviceConfig.viewport,
            deviceScaleFactor: deviceConfig.deviceScaleFactor,
        };
    }
    /**
     * 獲取主機實際配置（基於g-search-mcp實現）
     */
    getHostMachineConfig() {
        // 獲取系統語言
        const systemLocale = process.env.LANG || process.env.LC_ALL || "en-US";
        // 推斷時區
        const timezoneOffset = new Date().getTimezoneOffset();
        let timezoneId = "America/New_York"; // 默認
        // 根據時區偏移推斷地區
        if (timezoneOffset <= -480 && timezoneOffset > -600) {
            // UTC+8 (中國、新加坡、香港等)
            timezoneId = "Asia/Shanghai";
        }
        else if (timezoneOffset <= -540) {
            // UTC+9 (日本、韓國等)
            timezoneId = "Asia/Tokyo";
        }
        else if (timezoneOffset <= -420 && timezoneOffset > -480) {
            // UTC+7 (泰國、越南等)
            timezoneId = "Asia/Bangkok";
        }
        else if (timezoneOffset <= 0 && timezoneOffset > -60) {
            // UTC±0 到 UTC+1 (英國、德國等)
            timezoneId = "Europe/London";
        }
        else if (timezoneOffset >= 240 && timezoneOffset < 360) {
            // UTC-4 到 UTC-6 (美國東海岸)
            timezoneId = "America/New_York";
        }
        else if (timezoneOffset >= 360 && timezoneOffset < 480) {
            // UTC-6 到 UTC-8 (美國西海岸)
            timezoneId = "America/Los_Angeles";
        }
        // 根據平台選擇設備類型
        const platform = os.platform();
        let deviceName = "Desktop Chrome"; // 默認
        if (platform === "darwin") {
            deviceName = "Desktop Safari";
        }
        else if (platform === "win32") {
            deviceName = "Desktop Edge";
        }
        else if (platform === "linux") {
            deviceName = "Desktop Chrome Linux";
        }
        // 小機率使用移動設備 User-Agent 增加多樣性（約 15% 機率）
        if (Math.random() < 0.15) {
            const mobileDevices = ["Mobile Safari", "Mobile Chrome Android"];
            deviceName = mobileDevices[Math.floor(Math.random() * mobileDevices.length)];
        }
        // 小機率使用替代瀏覽器（約 10% 機率）
        if (Math.random() < 0.10) {
            const altBrowsers = ["Desktop Brave", "Desktop Opera"];
            deviceName = altBrowsers[Math.floor(Math.random() * altBrowsers.length)];
        }
        // 推斷顏色方案（簡化實現）
        const colorScheme = Math.random() > 0.3 ? "light" : "dark";
        return {
            deviceName,
            locale: systemLocale,
            timezoneId,
            colorScheme,
            reducedMotion: "no-preference",
            forcedColors: "none",
        };
    }
    /**
     * 獲取設備配置
     */
    getDeviceConfig() {
        // 使用Playwright內建設備配置
        const _playwrightDevice = devices["Desktop Chrome"] ||
            devices["Desktop Edge"] ||
            devices["Desktop Firefox"];
        // 常見桌面解析度池
        const viewports = [
            { width: 1920, height: 1080 },
            { width: 1366, height: 768 },
            { width: 1536, height: 864 },
            { width: 1440, height: 900 },
            { width: 1280, height: 720 },
            { width: 1600, height: 900 },
        ];
        const viewport = viewports[Math.floor(Math.random() * viewports.length)];
        const deviceScaleFactor = Math.random() > 0.7 ? 2 : 1; // 30%機率使用高DPI
        return {
            viewport,
            deviceScaleFactor,
        };
    }
    /**
     * 獲取隨機User-Agent
     */
    getRandomUserAgent(deviceName) {
        const agents = this.userAgents[deviceName] ||
            this.userAgents["Desktop Chrome"];
        return agents[Math.floor(Math.random() * agents.length)];
    }
    /**
     * 生成會話ID
     */
    generateSessionId() {
        return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    /**
     * 載入持久化狀態
     */
    loadState() {
        try {
            if (fs.existsSync(this.stateFile)) {
                const data = fs.readFileSync(this.stateFile, "utf8");
                return JSON.parse(data);
            }
        }
        catch (error) {
            this.logger.warn("載入指紋狀態失敗", { error: error.message });
        }
        return {};
    }
    /**
     * 保存持久化狀態
     */
    saveState(state) {
        try {
            // 確保目錄存在
            const dir = path.dirname(this.stateFile);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2), "utf8");
            this.logger.debug("指紋狀態已保存", { file: this.stateFile });
        }
        catch (error) {
            this.logger.warn("保存指紋狀態失敗", { error: error.message });
        }
    }
    /**
     * 重置指紋（強制生成新的）
     */
    async resetFingerprint() {
        this.logger.info("重置指紋配置");
        return this.getFingerprint(true);
    }
    /**
     * 獲取當前會話ID
     */
    getSessionId() {
        return this.sessionId;
    }
    /**
     * 檢查 User-Agent 版本是否過舊
     */
    checkUserAgentVersions() {
        try {
            const state = this.loadState();
            const now = Date.now();
            const lastCheck = state.lastUpdate || 0;
            if (now - lastCheck > this.VERSION_CHECK_INTERVAL) {
                this.logger.warn("檢測到 User-Agent 版本可能過舊", {
                    daysSinceUpdate: Math.floor((now - lastCheck) / (24 * 60 * 60 * 1000)),
                    suggestion: "建議更新瀏覽器版本號以獲得更好的反檢測效果",
                    currentVersions: {
                        chrome: "138.x",
                        firefox: "140.x",
                        safari: "18.x",
                        edge: "137.x"
                    }
                });
            }
        }
        catch {
            // 忽略檢查錯誤
        }
    }
    /**
     * 清理持久化狀態
     */
    cleanupState() {
        try {
            if (fs.existsSync(this.stateFile)) {
                fs.unlinkSync(this.stateFile);
                this.logger.info("指紋狀態已清理");
            }
        }
        catch (error) {
            this.logger.warn("清理指紋狀態失敗", { error: error.message });
        }
    }
}
/**
 * 創建指紋服務的工廠函數
 */
export function createFingerprintService(logger, stateFile) {
    return new FingerprintService(logger, stateFile);
}
//# sourceMappingURL=fingerprint-service.js.map