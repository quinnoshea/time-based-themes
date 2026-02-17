'use strict';

const SYSTEM_THEME_MEDIA_QUERY = '(prefers-color-scheme: dark)';

let detectSchemeChangeBlock = false;
let systemThemeMediaListenerAttached = false;

function setSchemeChangeDetectionBlock(shouldBlock) {
    detectSchemeChangeBlock = shouldBlock;
}

function isSchemeChangeDetectionBlocked() {
    return detectSchemeChangeBlock;
}

function setContentColorSchemeToAuto() {
    if (!browser.browserSettings || !browser.browserSettings.overrideContentColorScheme) {
        return Promise.resolve();
    }

    return browser.browserSettings.overrideContentColorScheme.set({value: "auto"})
        .then(() => {
            if (DEBUG_MODE)
                console.log("automaticDark DEBUG: Set overrideContentColorScheme to auto.");
        }, onError);
}

function setCurrentThemeSystemColorScheme() {
    return browser.theme.getCurrent()
        .then((currentTheme) => {
            if (!currentTheme.colors) {
                return;
            }

            if (!currentTheme.properties) {
                currentTheme.properties = {};
            }

            currentTheme.properties.color_scheme = "system";
            currentTheme.properties.content_color_scheme = "system";

            return browser.theme.update(currentTheme);
        }, onError);
}

function clearDynamicThemeOverride() {
    return browser.theme.reset()
        .then(() => {
            if (DEBUG_MODE)
                console.log("automaticDark DEBUG: Cleared dynamic theme override.");
        }, onError);
}

function onWindowFocusChanged(windowId) {
    if (windowId === browser.windows.WINDOW_ID_NONE) {
        return;
    }

    if (DEBUG_MODE)
        console.log("automaticDark DEBUG: 10 - Window was focused. Attempt theme change.");

    return browser.storage.local.get(CHANGE_MODE_KEY)
        .then((obj) => {
            const mode = obj[CHANGE_MODE_KEY].mode;
            return changeThemeBasedOnChangeMode(mode)
                .then(() => {
                    if (mode === "location-suntimes" || mode === "manual-suntimes") {
                        return browser.alarms.clearAll()
                            .then(() => {
                                return Promise.all([
                                    createAlarm(SUNRISE_TIME_KEY, NEXT_SUNRISE_ALARM_NAME, 60 * 24),
                                    createAlarm(SUNSET_TIME_KEY, NEXT_SUNSET_ALARM_NAME, 60 * 24)
                                ]);
                            }, onError);
                    }
                }, onError);
        }, onError);
}

function checkSysTheme() {
    if (DEBUG_MODE)
        console.log("automaticDark DEBUG: Start checkSysTheme");

    return browser.storage.local.get([CHANGE_MODE_KEY, DAYTIME_THEME_KEY, NIGHTTIME_THEME_KEY])
        .then((values) => {
            if (values[CHANGE_MODE_KEY].mode !== "system-theme") {
                return;
            }

            const prefersDarkInterface = window.matchMedia(SYSTEM_THEME_MEDIA_QUERY).matches;
            const targetMode = prefersDarkInterface ? "night-mode" : "day-mode";
            const targetThemeKey = prefersDarkInterface ? NIGHTTIME_THEME_KEY : DAYTIME_THEME_KEY;

            if (DEBUG_MODE)
                console.log("automaticDark DEBUG: 90 checkSysTheme - Detected OS scheme: " + targetMode);

            return Promise.all([
                browser.storage.local.set({[CURRENT_MODE_KEY]: {mode: targetMode}}),
                enableTheme(values, targetThemeKey)
            ]);
        }, onError);
}

function registerSystemThemeMediaListener() {
    if (systemThemeMediaListenerAttached) {
        return;
    }

    const mediaQuery = window.matchMedia(SYSTEM_THEME_MEDIA_QUERY);
    const handleMediaChange = () => {
        if (isSchemeChangeDetectionBlocked()) {
            if (DEBUG_MODE)
                console.log("automaticDark DEBUG: prefers-color-scheme changed, but scheme change detection is currently disabled.");
            return;
        }

        if (DEBUG_MODE)
            console.log("automaticDark DEBUG: 10 - prefers-color-scheme changed.");

        checkSysTheme();
    };

    if (typeof mediaQuery.addEventListener === "function") {
        mediaQuery.addEventListener("change", handleMediaChange);
    }
    else if (typeof mediaQuery.addListener === "function") {
        mediaQuery.addListener(handleMediaChange);
    }

    systemThemeMediaListenerAttached = true;
}

function enableSchemeChangeDetection() {
    if (DEBUG_MODE)
        console.log("automaticDark DEBUG: Start enableSchemeChangeDetection");

    return browser.storage.local.get(CHANGE_MODE_KEY)
        .then((obj) => {
            if (obj[CHANGE_MODE_KEY].mode === "system-theme") {
                return setContentColorSchemeToAuto()
                    .then(() => {
                        return setCurrentThemeSystemColorScheme();
                    }, onError);
            }
            return clearDynamicThemeOverride();
        }, onError)
        .then(() => {
            setSchemeChangeDetectionBlock(false);
        }, (error) => {
            setSchemeChangeDetectionBlock(false);
            onError(error);
        });
}
