import {
    ensureArray,
    ensureObject,
    isArray,
    isNotArray,
    isPlainObject
} from "../utils.mjs";
import {
    MEDIA_TYPE,
    PLAYER_TYPE
} from "./media.mjs";

const WATCHNOW_DEFAULT_REGION = "us";
const WATCHNOW_DEFAULT_CURRENCY = "usd";

function normalizeUrlPath(url) {
    try {
        const pathname = new URL(String(url ?? "")).pathname || "";
        if (!pathname || pathname === "/") {
            return pathname || "/";
        }

        return pathname.replace(/\/+$/, "") || "/";
    } catch (e) {
        return "";
    }
}

function resolveWatchnowRegion(watchnow) {
    const country = String(watchnow?.country ?? "").trim().toLowerCase();
    return country || WATCHNOW_DEFAULT_REGION;
}

function buildWatchnowFavoriteSource(source, regionCode) {
    return `${regionCode || WATCHNOW_DEFAULT_REGION}-${source}`;
}

function injectWatchnowFavoriteSources(items, regionCode) {
    const favorites = ensureArray(items).slice();
    const resolvedRegionCode = String(regionCode || WATCHNOW_DEFAULT_REGION).trim().toLowerCase();
    const filtered = favorites.filter((item) => {
        const normalized = String(item ?? "").toLowerCase();
        return !Object.values(PLAYER_TYPE).some((source) => {
            return normalized === buildWatchnowFavoriteSource(source, resolvedRegionCode);
        });
    });

    Object.values(PLAYER_TYPE).slice().reverse().forEach((source) => {
        filtered.unshift(buildWatchnowFavoriteSource(source, resolvedRegionCode));
    });
    return filtered;
}

function createSourceDefinition(source, name, color) {
    return {
        source: source,
        name: name,
        free: true,
        cinema: false,
        amazon: false,
        link_count: 99999,
        color: color,
        images: {
            logo: `raw.githubusercontent.com/DemoJameson/Loon.Plugins/main/trakt_simplified_chinese/images/${source}.webp`,
            logo_colorized: null,
            channel: null
        }
    };
}

function filterOutCustomSources(items) {
    return ensureArray(items).filter((item) => {
        const source = item?.source ? String(item.source).toLowerCase() : "";
        return !Object.values(PLAYER_TYPE).includes(source);
    });
}

function injectCustomSourcesIntoList(items) {
    const playerDefinitions = {
        [PLAYER_TYPE.EPLAYERX]: { type: PLAYER_TYPE.EPLAYERX, name: "EplayerX", color: "#33c1c0" },
        [PLAYER_TYPE.FORWARD]: { type: PLAYER_TYPE.FORWARD, name: "Forward", color: "#000000" },
        [PLAYER_TYPE.INFUSE]: { type: PLAYER_TYPE.INFUSE, name: "Infuse", color: "#ff8000" }
    };

    return Object.values(PLAYER_TYPE).slice().reverse().map((source) => {
        const definition = playerDefinitions[source];
        return createSourceDefinition(definition.type, definition.name, definition.color);
    }).concat(filterOutCustomSources(items));
}

function ensureWatchnowSourcesDefaultRegion(payload) {
    if (isNotArray(payload)) {
        return payload;
    }

    const hasDefaultRegion = payload.some((item) => {
        return isPlainObject(item) && isArray(item[WATCHNOW_DEFAULT_REGION]);
    });

    if (!hasDefaultRegion) {
        payload.push({
            [WATCHNOW_DEFAULT_REGION]: []
        });
    }

    return payload;
}

function injectCustomSourcesIntoPayload(payload) {
    payload = ensureWatchnowSourcesDefaultRegion(payload);

    if (isArray(payload)) {
        payload.forEach((item) => {
            if (!isPlainObject(item)) {
                return;
            }

            Object.keys(item).forEach((regionCode) => {
                if (isNotArray(item[regionCode])) {
                    return;
                }

                item[regionCode] = injectCustomSourcesIntoList(item[regionCode]);
            });
        });

        return payload;
    }

    if (!isPlainObject(payload)) {
        return payload;
    }

    Object.keys(payload).forEach((regionCode) => {
        if (isNotArray(payload[regionCode])) {
            return;
        }

        payload[regionCode] = injectCustomSourcesIntoList(payload[regionCode]);
    });

    return payload;
}

function resolveWatchnowTarget(url) {
    const normalizedPath = normalizeUrlPath(url);
    let match = normalizedPath.match(/^\/movies\/(\d+)\/watchnow$/);
    if (match) {
        return {
            mediaType: MEDIA_TYPE.MOVIE,
            traktId: match[1]
        };
    }

    match = normalizedPath.match(/^\/shows\/(\d+)\/watchnow$/);
    if (match) {
        return {
            mediaType: MEDIA_TYPE.SHOW,
            traktId: match[1]
        };
    }

    match = normalizedPath.match(/^\/episodes\/(\d+)\/watchnow$/);
    if (match) {
        return {
            mediaType: MEDIA_TYPE.EPISODE,
            traktId: match[1]
        };
    }

    return null;
}

function createWatchnowLinkEntry(source, link) {
    return {
        source: source,
        link: link,
        uhd: false,
        curreny: WATCHNOW_DEFAULT_CURRENCY,
        currency: WATCHNOW_DEFAULT_CURRENCY,
        prices: {
            rent: null,
            purchase: null
        }
    };
}

function buildCustomWatchnowEntries(target, context, enabledPlayerTypes, playerDefinitions, buildTraktPlayerLaunchLink) {
    if (!target || !context) {
        return [];
    }

    return ensureArray(enabledPlayerTypes).map((source) => {
        const definition = playerDefinitions[source];
        if (!definition || typeof definition.buildDeeplink !== "function") {
            return null;
        }

        const deeplink = definition.buildDeeplink(target, context);
        if (!deeplink) {
            return null;
        }

        const link = buildTraktPlayerLaunchLink(deeplink);
        if (!link) {
            return null;
        }

        return createWatchnowLinkEntry(source, link);
    }).filter(Boolean);
}

function injectCustomWatchnowEntriesIntoRegion(regionData, customEntries) {
    const nextRegion = ensureObject(regionData);
    const currentFree = ensureArray(nextRegion.free);
    nextRegion.free = customEntries.concat(filterOutCustomSources(currentFree));
    return nextRegion;
}

function ensureWatchnowAllRegions(payload, regionCodes) {
    if (!isPlainObject(payload)) {
        return payload;
    }

    const finalRegionCodes = Array.from(new Set(ensureArray(regionCodes).concat(Object.keys(payload))));
    finalRegionCodes.forEach((regionCode) => {
        const normalizedRegionCode = String(regionCode ?? "").trim().toLowerCase();
        if (!normalizedRegionCode) {
            return;
        }

        if (!isPlainObject(payload[normalizedRegionCode])) {
            payload[normalizedRegionCode] = {};
        }
    });

    return payload;
}

function injectCustomWatchnowEntriesIntoPayload(payload, customEntries, regionCodes) {
    if (isNotArray(customEntries) || customEntries.length === 0) {
        return payload;
    }

    payload = ensureWatchnowAllRegions(payload, regionCodes);

    if (!isPlainObject(payload)) {
        return payload;
    }

    Object.keys(payload).forEach((regionCode) => {
        payload[regionCode] = injectCustomWatchnowEntriesIntoRegion(payload[regionCode], customEntries);
    });

    return payload;
}

export {
    WATCHNOW_DEFAULT_CURRENCY,
    WATCHNOW_DEFAULT_REGION,
    buildCustomWatchnowEntries,
    buildWatchnowFavoriteSource,
    createWatchnowLinkEntry,
    filterOutCustomSources,
    injectCustomSourcesIntoList,
    injectCustomSourcesIntoPayload,
    injectCustomWatchnowEntriesIntoPayload,
    injectWatchnowFavoriteSources,
    resolveWatchnowRegion,
    resolveWatchnowTarget
};
