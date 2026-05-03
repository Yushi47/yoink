export const CONFIG = {
    TIMEOUTS: {
        BROWSER_LAUNCH: 30000,
        NAVIGATION: 30000,
        DEFAULT_TIMEOUT: 30000,
        ABORT_SIGNAL_WAIT: 500,
        BROWSER_CLOSE: 5000,
        STOP_OPERATION: 10000,
    },
    BROWSER_ARGS: [
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-features=VizDisplayCompositor,OptimizationGuideOnDeviceModel,OnDeviceModelService',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
    ],
    USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
    VIEWPORT: { width: 1280, height: 720 },
    POOL: {
        HEALTH_CHECK_INTERVAL_MS:  30_000,  // how often the health-check timer fires
        RELAUNCH_BASE_DELAY_MS:     2_000,  // first backoff wait before relaunching
        RELAUNCH_MAX_ATTEMPTS:          5,  // consecutive crashes before entering 'failed'
        RELAUNCH_BACKOFF_FACTOR:        2,  // delay doubles each attempt
        RELAUNCH_MAX_DELAY_MS:     60_000,  // backoff cap (1 minute)
        PAGE_ACQUIRE_TIMEOUT_MS:   15_000,  // how long acquirePage() waits for pool to be ready
    }
};
