import {
    parseArgumentValue,
    parseBooleanArgument,
    readTextArgument
} from "../shared/common.mjs";

const BOXJS_CONFIG_KEY = "dj_trakt_boxjs_configs";

const ARGUMENT_FIELDS = [
    { key: "latestHistoryEpisodeOnly", defaultValue: true },
    { key: "googleTranslationEnabled", defaultValue: true },
    { key: "eplayerxEnabled", defaultValue: true, group: "playerButtonEnabled", groupKey: "eplayerx" },
    { key: "forwardEnabled", defaultValue: true, group: "playerButtonEnabled", groupKey: "forward" },
    { key: "infuseEnabled", defaultValue: true, group: "playerButtonEnabled", groupKey: "infuse" },
    { key: "useShortcutsJumpEnabled", defaultValue: false },
    { key: "backendBaseUrl", defaultValue: "https://loon-plugins.demojameson.de5.net" }
];

function createDefaultPlayerButtonEnabledConfig() {
    return {
        eplayerx: true,
        forward: true,
        infuse: true
    };
}

function createDefaultArgumentConfig() {
    const config = {
        playerButtonEnabled: createDefaultPlayerButtonEnabledConfig()
    };

    ARGUMENT_FIELDS.forEach(({ key, defaultValue, group, groupKey }) => {
        if (group && groupKey) {
            config[group][groupKey] = defaultValue;
            return;
        }

        config[key] = defaultValue;
    });

    return config;
}

function applyArgumentObjectConfig(config, argument) {
    ARGUMENT_FIELDS.forEach(({ key, group, groupKey }) => {
        if (group && groupKey) {
            config[group][groupKey] = parseArgumentValue(argument[key], config[group][groupKey]);
            return;
        }

        config[key] = parseArgumentValue(argument[key], config[key]);
    });

    return config;
}

function applyArgumentStringConfig(config, argument) {
    const raw = String(argument ?? "").replace(/^\[|\]$/g, "").trim();
    if (!raw) {
        return config;
    }

    const parts = raw.split(",").map((item) => item.trim()).filter(Boolean);
    ARGUMENT_FIELDS.forEach(({ key, group, groupKey }, index) => {
        if (parts.length <= index) {
            return;
        }

        if (group && groupKey) {
            config[group][groupKey] = parseArgumentValue(parts[index], config[group][groupKey]);
            return;
        }

        config[key] = parseArgumentValue(parts[index], config[key]);
    });

    return config;
}

export {
    ARGUMENT_FIELDS,
    BOXJS_CONFIG_KEY,
    applyArgumentObjectConfig,
    applyArgumentStringConfig,
    createDefaultArgumentConfig,
    parseArgumentValue,
    parseBooleanArgument,
    readTextArgument
};
