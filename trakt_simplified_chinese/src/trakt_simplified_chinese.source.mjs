import {
    createDefaultArgumentConfig,
    applyArgumentObjectConfig,
    applyArgumentStringConfig
} from "./core/config.mjs";
import {
    buildHistoryEpisodesRequestUrl as buildHistoryEpisodesRequestUrlWithMinimumLimit,
    buildRipppleHistoryRequestUrl as buildRipppleHistoryRequestUrlWithMinimumLimit,
    filterHistoryEpisodesAcrossPages as filterHistoryEpisodesAcrossPagesWithCache,
    isHistoryEpisodesListUrl,
    keepLatestHistoryEpisodes
} from "./core/history.mjs";
import {
    MEDIA_TYPE,
    PLAYER_TYPE
} from "./core/media.mjs";
import {
    BACKEND_FETCH_MIN_REFS,
    BACKEND_WRITE_BATCH_SIZE,
    DIRECT_MEDIA_TYPE_MOVIE_STATUSES,
    DIRECT_MEDIA_TYPE_SHOW_STATUSES,
    GOOGLE_TRANSLATE_BATCH_SIZE,
    REQUEST_BATCH_SIZE,
    SEASON_EPISODE_TRANSLATION_LIMIT,
    TRAKT_DIRECT_TRANSLATION_MAX_REFS,
    UNIFIED_CACHE_KEY,
    UNIFIED_CACHE_MAX_BYTES,
    UNIFIED_CACHE_SCHEMA_VERSION
} from "./core/constants.mjs";
import {
    CACHE_STATUS,
    areTranslationsEqual,
    extractNormalizedTranslation,
    normalizeTranslationPayload,
    normalizeTranslations,
    sortTranslations
} from "./core/translations.mjs";
import {
    buildCustomWatchnowEntries,
    injectCustomSourcesIntoPayload,
    injectCustomWatchnowEntriesIntoPayload as injectCustomWatchnowEntriesIntoPayloadForRegions,
    injectWatchnowFavoriteSources,
    resolveWatchnowRegion,
    resolveWatchnowTarget
} from "./core/watchnow.mjs";
import { URL } from "@nsnanocat/url";
import { URLSearchParams } from "@nsnanocat/url/URLSearchParams.mjs";
import {
    cloneObject,
    computeStringHash,
    containsChineseCharacter,
    createZeroPriorityMap,
    decodeBase64Value,
    ensureArray,
    ensureObject,
    escapeQueryComponent,
    isArray,
    isNonNullish,
    isNotArray,
    isNullish,
    isPlainObject
} from "./utils.mjs";
import { createScriptContext } from "./runtime/script_context.mjs";
import { createHttpClient } from "./runtime/http_client.mjs";
import { createCacheStore } from "./services/cache_store.mjs";
import { createRequestPhaseRoutes } from "./routes/request_phase.mjs";
import {
    createResponsePhaseRoutes,
    createResponseRouteContext
} from "./routes/response_phase.mjs";

const scriptContext = createScriptContext("Trakt增强");
const $ = scriptContext.env;
const LEGACY_CACHE_KEYS = [
    "trakt_zh_cn_cache_v2",
    "trakt_current_season",
    "trakt_current_season_cache",
    "trakt_history_episode_cache",
    "trakt_watchnow_ids_cache",
    "trakt_comment_translation_cache",
    "trakt_sentiment_translation_cache",
    "trakt_people_translation_cache",
    "trakt_list_text_translation_cache",
    "trakt_list_description_translation_cache"
];
const GOOGLE_TRANSLATE_API_KEY = "QUl6YVN5QmNRak1SQTYyVGFYSm4xOXdiZExHNXJWUkJCaDJqbnVzQ2tzNzY=";
const GOOGLE_TRANSLATE_API_URL = "https://translation.googleapis.com/language/translate/v2";
const FILM_SHOW_RATINGS_API_BASE_URL = "https://film-show-ratings.p.rapidapi.com";
const FILM_SHOW_RATINGS_RAPIDAPI_HOST = "film-show-ratings.p.rapidapi.com";
const WATCHNOW_REDIRECT_URL = "https://loon-plugins.demojameson.de5.net/api/redirect";
const SHORTCUTS_OPENLINK_URL = `shortcuts://run-shortcut?name=${encodeURIComponent("打开链接")}&input=text&text=`;
const DEFAULT_BACKEND_BASE_URL = "https://loon-plugins.demojameson.de5.net";
const BOXJS_CONFIG_KEY = "dj_trakt_boxjs_configs";
const TMDB_LOGO_TARGET_BASE_URL = "https://raw.githubusercontent.com/DemoJameson/Loon.Plugins/main/trakt_simplified_chinese/images";
const TMDB_API_BASE_URL = "https://api.tmdb.org/3";
const TMDB_API_KEY = "a0a4d50000eeb10604c5f9342c8b3f62";
const REGION_CODES = [
    "AD", "AE", "AG", "AL", "AO", "AR", "AT", "AU", "AZ", "BA", "BB", "BE", "BF", "BG", "BH", "BM",
    "BO", "BR", "BS", "BY", "BZ", "CA", "CD", "CH", "CI", "CL", "CM", "CO", "CR", "CU", "CV", "CY",
    "CZ", "DE", "DK", "DO", "DZ", "EC", "EE", "EG", "ES", "FI", "FJ", "FR", "GB", "GF", "GG", "GH",
    "GI", "GQ", "GR", "GT", "GY", "HK", "HN", "HR", "HU", "ID", "IE", "IL", "IN", "IQ", "IS", "IT",
    "JM", "JO", "JP", "KE", "KR", "KW", "LB", "LC", "LI", "LT", "LU", "LV", "LY", "MA", "MC", "MD",
    "ME", "MG", "MK", "ML", "MT", "MU", "MW", "MX", "MY", "MZ", "NE", "NG", "NI", "NL", "NO", "NZ",
    "OM", "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PS", "PT", "PY", "QA", "RO", "RS", "RU", "SA",
    "SC", "SE", "SG", "SI", "SK", "SM", "SN", "SV", "TC", "TD", "TH", "TN", "TR", "TT", "TW", "TZ",
    "UA", "UG", "US", "UY", "VA", "VE", "XK", "YE", "ZA", "ZM", "ZW"
];
const PLAYER_DEFINITIONS = {
    [PLAYER_TYPE.EPLAYERX]: {
        type: PLAYER_TYPE.EPLAYERX,
        name: "EplayerX",
        homePage: "https://apps.apple.com/cn/app/eplayerx/id6747369377",
        logo: "eplayerx_logo.webp",
        color: "#33c1c0",
        tmdbProviderId: 1,
        tmdbDisplayPriority: 1,
        buildDeeplink: buildEplayerXDeeplink
    },
    [PLAYER_TYPE.FORWARD]: {
        type: PLAYER_TYPE.FORWARD,
        name: "Forward",
        homePage: "https://apps.apple.com/cn/app/forward/id6503940939",
        logo: "forward_logo.webp",
        color: "#000000",
        tmdbProviderId: 2,
        tmdbDisplayPriority: 2,
        buildDeeplink: buildForwardDeeplink
    },
    [PLAYER_TYPE.INFUSE]: {
        type: PLAYER_TYPE.INFUSE,
        name: "Infuse",
        homePage: "https://firecore.com/infuse",
        logo: "infuse_logo.webp",
        color: "#ff8000",
        tmdbProviderId: 3,
        tmdbDisplayPriority: 3,
        buildDeeplink: buildInfuseDeeplink
    }
};
const SOFA_TIME_COUNTRY_SERVICE_TYPES = {
    addon: true,
    buy: true,
    rent: true,
    free: true,
    subscription: true
};
const TMDB_PROVIDER_LIST_ENTRIES = Object.values(PLAYER_TYPE).map((source) => {
    const definition = PLAYER_DEFINITIONS[source];
    return {
        display_priorities: createZeroPriorityMap(REGION_CODES),
        display_priority: 0,
        logo_path: `/${definition.logo}`,
        provider_name: definition.name,
        provider_id: definition.tmdbProviderId
    };
});
const MEDIA_CONFIG = {
    [MEDIA_TYPE.SHOW]: {
        buildTranslationPath(ref) {
            return isNonNullish(ref?.traktId)
                ? `/shows/${ref.traktId}/translations/zh?extended=all`
                : "";
        }
    },
    [MEDIA_TYPE.MOVIE]: {
        buildTranslationPath(ref) {
            return isNonNullish(ref?.traktId)
                ? `/movies/${ref.traktId}/translations/zh?extended=all`
                : "";
        }
    },
    [MEDIA_TYPE.EPISODE]: {
        buildTranslationPath(ref) {
            return ref &&
                isNonNullish(ref.showId) &&
                isNonNullish(ref.seasonNumber) &&
                isNonNullish(ref.episodeNumber)
                ? `/shows/${ref.showId}/seasons/${ref.seasonNumber}/episodes/${ref.episodeNumber}/translations/zh?extended=all`
                : "";
        }
    }
};
void URL;
void URLSearchParams;

const httpClient = createHttpClient(scriptContext);
const {
    buildRequestHeaders,
    fetchJson,
    getRequestHeaderValue,
    getResponseStatusCode,
    postJson
} = httpClient;
const cacheStore = createCacheStore({
    scriptContext,
    unifiedCacheKey: UNIFIED_CACHE_KEY,
    unifiedCacheSchemaVersion: UNIFIED_CACHE_SCHEMA_VERSION,
    unifiedCacheMaxBytes: UNIFIED_CACHE_MAX_BYTES,
    legacyCacheKeys: LEGACY_CACHE_KEYS
});
const {
    clearCurrentSeason,
    getCurrentSeason,
    loadCache,
    loadCommentTranslationCache,
    loadHistoryEpisodeCache,
    loadLinkIdsCache,
    loadListTranslationCache,
    loadPeopleTranslationCache,
    loadSentimentTranslationCache,
    loadUnifiedCache,
    normalizeUpdatedAtEntryMap,
    saveCache,
    saveCommentTranslationCache,
    saveHistoryEpisodeCache,
    saveLinkIdsCache,
    saveListTranslationCache,
    savePeopleTranslationCache,
    saveSentimentTranslationCache,
    saveUnifiedCache,
    setCurrentSeason
} = cacheStore;

function readBoxJsConfig() {
    const config = createDefaultArgumentConfig();
    const boxJsConfig = ensureObject(scriptContext.env.getjson(BOXJS_CONFIG_KEY, {}));
    return applyArgumentObjectConfig(config, boxJsConfig);
}

function buildCustomPlayerImageSet(logoName) {
    return {
        lightThemeImage: `${TMDB_LOGO_TARGET_BASE_URL}/${logoName}`,
        darkThemeImage: `${TMDB_LOGO_TARGET_BASE_URL}/${logoName}`,
        whiteImage: `${TMDB_LOGO_TARGET_BASE_URL}/${logoName}`
    };
}

function createSofaTimeTemplate(definition) {
    return {
        service: {
            id: definition.type,
            name: definition.name,
            homePage: definition.homePage,
            themeColorCode: definition.color,
            imageSet: buildCustomPlayerImageSet(definition.logo)
        },
        type: "subscription",
        link: "",
        videoLink: "",
        quality: "hd",
        audios: [],
        subtitles: [],
        expiresSoon: false,
        availableSince: 0
    };
}

function createSofaTimeCountryService(definition) {
    return {
        id: definition.type,
        name: definition.name,
        homePage: definition.homePage,
        themeColorCode: definition.color,
        imageSet: buildCustomPlayerImageSet(definition.logo),
        streamingOptionTypes: cloneObject(SOFA_TIME_COUNTRY_SERVICE_TYPES),
        addons: []
    };
}

function parseArgumentConfig() {
    const config = readBoxJsConfig();

    if (typeof scriptContext.argument === "object" && scriptContext.argument !== null) {
        return applyArgumentObjectConfig(config, scriptContext.argument);
    }

    if (typeof scriptContext.argument === "string") {
        return applyArgumentStringConfig(config, scriptContext.argument);
    }

    return config;
}

const argumentConfig = parseArgumentConfig();
const latestHistoryEpisodeOnly = argumentConfig.latestHistoryEpisodeOnly;
const googleTranslationEnabled = argumentConfig.googleTranslationEnabled;
const enabledPlayerTypes = Object.values(PLAYER_TYPE).filter((source) => argumentConfig.playerButtonEnabled[source]);
const useShortcutsJumpEnabled = argumentConfig.useShortcutsJumpEnabled;
const backendBaseUrl = (() => {
    let value = argumentConfig.backendBaseUrl;

    if (typeof value !== "string") {
        return DEFAULT_BACKEND_BASE_URL;
    }

    value = value.trim();
    if (!/^https?:\/\//i.test(value)) {
        return DEFAULT_BACKEND_BASE_URL;
    }

    return value.replace(/\/+$/, "");
})();
const preferredLanguage = "zh-CN";
const SCRIPT_TRANSLATION_REQUEST_HEADER = "x-loon-trakt-translation-request";
const SCRIPT_TRANSLATION_REQUEST_VALUE = "script";
const body = scriptContext.responseBody;
const requestUrl = scriptContext.requestUrl;
const requestPath = normalizeUrlPath(requestUrl);
const traktApiBaseUrl = resolveTraktApiBaseUrl(requestUrl);

const pendingBackendWrites = createMediaMap();

function resolveTraktApiBaseUrl(url) {
    const normalizedUrl = String(url ?? "");
    const match = normalizedUrl.match(/^(https:\/\/apiz?\.trakt\.tv)(?:\/|$)/i);
    return match ? match[1] : "";
}

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

function isUrlFromHost(url, expectedHost) {
    try {
        return String(new URL(String(url ?? "")).hostname).toLowerCase() === String(expectedHost ?? "").toLowerCase();
    } catch (e) {
        return false;
    }
}

function getUrlHost(url) {
    try {
        return String(new URL(String(url ?? "")).hostname).toLowerCase();
    } catch (e) {
        return "";
    }
}


function createCacheEntry(status, translation) {
    return {
        status: status,
        translation: translation,
        updatedAt: Date.now()
    };
}

function getMediaConfig(mediaType) {
    return MEDIA_CONFIG[mediaType];
}

function getMediaBackendField(mediaType) {
    return `${mediaType}s`;
}

function getMediaCachePrefix(mediaType) {
    return `${mediaType}:`;
}

function createMediaMap() {
    const map = {};
    Object.keys(MEDIA_CONFIG).forEach((mediaType) => {
        map[mediaType] = {};
    });
    return map;
}

function isScriptInitiatedTranslationRequest() {
    return String(getRequestHeaderValue(SCRIPT_TRANSLATION_REQUEST_HEADER) ?? "").toLowerCase() ===
        SCRIPT_TRANSLATION_REQUEST_VALUE;
}

function buildEpisodeCompositeKey(showId, seasonNumber, episodeNumber) {
    if (isNullish(showId) || isNullish(seasonNumber) || isNullish(episodeNumber)) {
        return "";
    }

    return `${showId}:${seasonNumber}:${episodeNumber}`;
}

function parseEpisodeLookupKey(value) {
    const match = String(value ?? "").match(/^(\d+):(\d+):(\d+)$/);
    if (!match) {
        return null;
    }

    return {
        mediaType: MEDIA_TYPE.EPISODE,
        showId: match[1],
        seasonNumber: match[2],
        episodeNumber: match[3],
        backendLookupKey: match[0]
    };
}

function buildMediaCacheLookupKey(mediaType, ref) {
    if (!ref || typeof ref !== "object") {
        return "";
    }

    if (mediaType === MEDIA_TYPE.EPISODE) {
        return buildEpisodeCompositeKey(ref.showId, ref.seasonNumber, ref.episodeNumber);
    }

    return isNonNullish(ref.traktId) ? String(ref.traktId) : "";
}

function buildMediaCacheKey(mediaType, ref) {
    const lookupKey = buildMediaCacheLookupKey(mediaType, ref);
    return lookupKey ? getMediaCachePrefix(mediaType) + lookupKey : "";
}

function storeTranslationEntry(cache, mediaType, ref, entry) {
    const cacheKey = buildMediaCacheKey(mediaType, ref);
    if (!cacheKey) {
        return null;
    }

    const translation = normalizeTranslationPayload(entry?.translation ?? null);
    const status = entry?.status === CACHE_STATUS.FOUND
        ? CACHE_STATUS.FOUND
        : entry?.status === CACHE_STATUS.PARTIAL_FOUND
            ? CACHE_STATUS.PARTIAL_FOUND
            : CACHE_STATUS.NOT_FOUND;

    if ((status === CACHE_STATUS.FOUND || status === CACHE_STATUS.PARTIAL_FOUND) && translation) {
        cache[cacheKey] = createCacheEntry(status, translation);
    } else {
        cache[cacheKey] = createCacheEntry(CACHE_STATUS.NOT_FOUND, translation);
    }

    return cache[cacheKey];
}

function getCachedTranslation(cache, mediaType, ref) {
    const cacheKey = buildMediaCacheKey(mediaType, ref);
    return cacheKey ? cache[cacheKey] : null;
}

function hasZhAvailableTranslation(availableTranslations) {
    return isArray(availableTranslations) && availableTranslations.some((language) => {
        return String(language ?? "").toLowerCase() === "zh";
    });
}

function shouldSkipTranslationLookup(ref) {
    const availableTranslations = ensureArray(ref?.availableTranslations);
    return !!(availableTranslations && availableTranslations.length > 0 && !hasZhAvailableTranslation(availableTranslations));
}

function getMissingRefs(cache, mediaType, refs) {
    return refs.filter((ref) => {
        if (!ref || !buildMediaCacheLookupKey(mediaType, ref)) {
            return false;
        }

        if (shouldSkipTranslationLookup(ref)) {
            return false;
        }

        return !getCachedTranslation(cache, mediaType, ref);
    });
}

function getBackendFieldIds(refs) {
    return refs
        .map((ref) => {
            if (!ref) {
                return "";
            }

            if (isNonNullish(ref.backendLookupKey)) {
                return String(ref.backendLookupKey);
            }

            if (isNonNullish(ref.traktId)) {
                return String(ref.traktId);
            }

            return "";
        })
        .filter(Boolean);
}

async function fetchTranslationsFromBackend(cache, refsByType) {
    if (!backendBaseUrl) {
        return;
    }

    const totalRefs = Object.keys(MEDIA_CONFIG).reduce((count, mediaType) => {
        const refs = ensureArray(refsByType?.[mediaType]);
        return count + refs.length;
    }, 0);
    if (totalRefs <= BACKEND_FETCH_MIN_REFS) {
        return;
    }

    const query = [];
    Object.keys(MEDIA_CONFIG).forEach((mediaType) => {
        const refs = ensureArray(refsByType?.[mediaType]);
        const ids = getBackendFieldIds(refs);
        if (ids.length > 0) {
            query.push(`${getMediaBackendField(mediaType)}=${ids.map((id) => String(id)).join(",")}`);
        }
    });

    if (query.length === 0) {
        return;
    }

    const url = `${backendBaseUrl}/api/trakt/translations?${query.join("&")}`;
    const payload = await fetchJson(url, null, false);

    Object.keys(MEDIA_CONFIG).forEach((mediaType) => {
        const collectionField = getMediaBackendField(mediaType);
        const entries = ensureObject(payload?.[collectionField]);
        Object.keys(entries).forEach((id) => {
            const ref = mediaType === MEDIA_TYPE.EPISODE
                ? parseEpisodeLookupKey(id)
                : { traktId: id };
            storeTranslationEntry(cache, mediaType, ref, entries[id]);
        });
    });

    saveCache(cache);
}

function queueBackendWrite(mediaType, ref, entry) {
    const lookupKey = buildMediaCacheLookupKey(mediaType, ref);
    if (!lookupKey) {
        return;
    }

    pendingBackendWrites[mediaType][lookupKey] = entry;

    if (getPendingBackendWriteCount() >= BACKEND_WRITE_BATCH_SIZE) {
        flushBackendWriteBatch(BACKEND_WRITE_BATCH_SIZE);
    }
}

function getPendingBackendWriteCount() {
    return Object.keys(pendingBackendWrites).reduce((count, mediaType) => {
        return count + Object.keys(ensureObject(pendingBackendWrites[mediaType])).length;
    }, 0);
}

function extractBackendWritePayload(maxBatchSize) {
    const batchSize = Number(maxBatchSize) > 0 ? Number(maxBatchSize) : BACKEND_WRITE_BATCH_SIZE;
    const payload = {};
    let count = 0;

    Object.keys(MEDIA_CONFIG).forEach((mediaType) => {
        payload[getMediaBackendField(mediaType)] = {};
    });

    for (const mediaType of Object.keys(MEDIA_CONFIG)) {
        const entries = ensureObject(pendingBackendWrites[mediaType]);
        for (const lookupKey of Object.keys(entries)) {
            if (count >= batchSize) {
                return payload;
            }

            payload[getMediaBackendField(mediaType)][lookupKey] = entries[lookupKey];
            delete pendingBackendWrites[mediaType][lookupKey];
            count += 1;
        }
    }

    return payload;
}

function flushBackendWriteBatch(maxBatchSize) {
    if (!backendBaseUrl) {
        return false;
    }

    if (getPendingBackendWriteCount() === 0) {
        return false;
    }

    const url = `${backendBaseUrl}/api/trakt/translations`;
    const payload = extractBackendWritePayload(maxBatchSize);

    postJson(url, payload, {
        "content-type": "application/json"
    }, false).catch(e => {
        $.log(`Trakt backend cache write failed during batch flush: ${e}`);
    });

    return true;
}

function flushBackendWrites() {
    flushBackendWriteBatch(getPendingBackendWriteCount());
}

function buildTranslationUrl(mediaType, ref) {
    const path = getMediaConfig(mediaType).buildTranslationPath(ref);
    return path ? `${traktApiBaseUrl}${path}` : "";
}

function resolveTranslationRequestTarget(url) {
    const normalizedPath = normalizeUrlPath(url);
    let match = normalizedPath.match(/^\/shows\/(\d+)\/translations\/zh$/);
    if (match) {
        return {
            mediaType: MEDIA_TYPE.SHOW,
            traktId: match[1]
        };
    }

    match = normalizedPath.match(/^\/movies\/(\d+)\/translations\/zh$/);
    if (match) {
        return {
            mediaType: MEDIA_TYPE.MOVIE,
            traktId: match[1]
        };
    }

    match = normalizedPath.match(/^\/shows\/(\d+)\/seasons\/(\d+)\/episodes\/(\d+)\/translations\/zh$/);
    if (match) {
        return {
            mediaType: MEDIA_TYPE.EPISODE,
            showId: match[1],
            seasonNumber: match[2],
            episodeNumber: match[3]
        };
    }

    return null;
}

function resolveMediaDetailTarget(url, data, mediaType) {
    if (mediaType === MEDIA_TYPE.EPISODE) {
        const match = normalizeUrlPath(url).match(/^\/shows\/(\d+)\/seasons\/(\d+)\/episodes\/(\d+)$/);
        if (!match) {
            return null;
        }

        return {
            mediaType: MEDIA_TYPE.EPISODE,
            showId: match[1],
            seasonNumber: match[2],
            episodeNumber: match[3]
        };
    }

    const traktId = data?.ids?.trakt ?? null;
    return isNonNullish(traktId)
        ? {
            mediaType: mediaType,
            traktId: traktId
        }
        : null;
}

function resolveCurrentSeasonTarget(url) {
    const match = normalizeUrlPath(url).match(/^\/shows\/(\d+)\/seasons\/(\d+)$/);
    if (!match) {
        return null;
    }

    return {
        showId: match[1],
        seasonNumber: Number(match[2])
    };
}

function resolveSeasonListTarget(url) {
    const match = normalizeUrlPath(url).match(/^\/shows\/(\d+)\/seasons$/);
    if (!match) {
        return null;
    }

    return {
        showId: match[1]
    };
}

async function fetchDirectTranslation(mediaType, ref) {
    const traktId = isNonNullish(ref?.traktId) ? ref.traktId : null;
    const url = buildTranslationUrl(mediaType, ref);

    if (!url) {
        throw new Error(`Missing translation lookup metadata for mediaType=${mediaType}, traktId=${traktId}`);
    }

    const payload = await $.http.get({
        url: url,
        headers: buildRequestHeaders({
            [SCRIPT_TRANSLATION_REQUEST_HEADER]: SCRIPT_TRANSLATION_REQUEST_VALUE
        })
    });
    const statusCode = getResponseStatusCode(payload);
    if (statusCode < 200 || statusCode >= 300) {
        throw new Error(`HTTP ${statusCode} for ${url}`);
    }

    const responseBody = isNullish(payload?.body) ? "" : String(payload.body);
    if (!responseBody.trim()) {
        return {
            status: CACHE_STATUS.NOT_FOUND,
            translation: null
        };
    }

    let responseJson;
    try {
        responseJson = JSON.parse(responseBody);
    } catch (e) {
        throw new Error(`JSON parse failed for ${url}: ${e}`);
    }

    const translations = normalizeTranslations(responseJson);
    return extractNormalizedTranslation(translations);
}

async function processInBatches(items, worker) {
    for (let i = 0; i < items.length; i += REQUEST_BATCH_SIZE) {
        const batch = items.slice(i, i + REQUEST_BATCH_SIZE);
        await Promise.all(batch.map((item) => worker(item)));
    }
}

function applyTranslation(target, entry) {
    if (!target || !entry || !entry.translation) {
        return;
    }

    if (entry.translation.title) {
        target.title = entry.translation.title;
        if (/^Rippple/i.test(String(getRequestHeaderValue("user-agent") ?? "").trim())) {
            target.original_title = entry.translation.title;
        }
    }
    if (entry.translation.overview) {
        target.overview = entry.translation.overview;
    }
    if (entry.translation.tagline) {
        target.tagline = entry.translation.tagline;
    }
}

function getGoogleTranslateApiKey() {
    const decodedValue = decodeBase64Value(GOOGLE_TRANSLATE_API_KEY);
    return decodedValue.length > 5 ? decodedValue.slice(0, -5) : "";
}

function buildGoogleTranslateFormBody(texts, sourceLanguage) {
    const apiKey = getGoogleTranslateApiKey();
    return [
        `key=${escapeQueryComponent(apiKey)}`,
        ...texts.map((text) => `q=${escapeQueryComponent(text)}`),
        `target=${escapeQueryComponent(preferredLanguage)}`,
        `source=${escapeQueryComponent(sourceLanguage)}`,
        "format=text",
        "model=base"
    ].join("&");
}

async function translateTextBatchWithGoogle(texts, sourceLanguage) {
    const response = await $.http.post({
        url: GOOGLE_TRANSLATE_API_URL,
        headers: {
            accept: "application/json",
            "content-type": "application/x-www-form-urlencoded;charset=UTF-8"
        },
        body: buildGoogleTranslateFormBody(texts, sourceLanguage)
    });
    const statusCode = getResponseStatusCode(response);
    if (statusCode < 200 || statusCode >= 300) {
        throw new Error(`HTTP ${statusCode} for ${GOOGLE_TRANSLATE_API_URL}`);
    }

    let payload;
    try {
        payload = JSON.parse(response.body);
    } catch (e) {
        throw new Error(`JSON parse failed for ${GOOGLE_TRANSLATE_API_URL}: ${e}`);
    }
    const translations = ensureArray(payload?.data?.translations);

    return texts.map((_, index) => {
        return String(translations[index]?.translatedText ?? "");
    });
}

async function translateTextsWithGoogle(texts, sourceLanguage) {
    const normalizedTexts = ensureArray(texts).map((item) => String(item ?? ""));
    if (normalizedTexts.length === 0) {
        return [];
    }

    const batches = [];
    for (let index = 0; index < normalizedTexts.length; index += GOOGLE_TRANSLATE_BATCH_SIZE) {
        batches.push(normalizedTexts.slice(index, index + GOOGLE_TRANSLATE_BATCH_SIZE));
    }

    const translatedBatches = await Promise.all(
        batches.map((batch) => translateTextBatchWithGoogle(batch, sourceLanguage))
    );

    return translatedBatches.reduce((items, batch) => items.concat(batch), []);
}

function isChineseLanguage(language) {
    const normalized = String(language ?? "").trim().toLowerCase();
    return normalized === "zh" || normalized.startsWith("zh-");
}

function buildSentimentCacheKey(mediaType, traktId) {
    if (!traktId || (mediaType !== MEDIA_TYPE.SHOW && mediaType !== MEDIA_TYPE.MOVIE)) {
        return "";
    }

    return `${mediaType}:${traktId}`;
}

function resolveSentimentRequestTarget(url) {
    const normalizedPath = normalizeUrlPath(url);
    let match = normalizedPath.match(/^\/(?:v3\/)?media\/(movie|show)\/(\d+)\/info\/(\d+)\/version\/(\d+)$/i);
    if (match) {
        return {
            mediaType: String(match[1]).toLowerCase() === "show" ? MEDIA_TYPE.SHOW : MEDIA_TYPE.MOVIE,
            traktId: match[2],
            infoId: match[3],
            version: match[4]
        };
    }

    match = normalizedPath.match(/^\/(shows|movies)\/(\d+)\/sentiments$/i);
    if (match) {
        return {
            mediaType: String(match[1]).toLowerCase() === "shows" ? MEDIA_TYPE.SHOW : MEDIA_TYPE.MOVIE,
            traktId: match[2],
            infoId: null,
            version: null
        };
    }

    return null;
}

function normalizeSentimentAspectItem(item) {
    const normalized = ensureObject(item);
    return {
        ...normalized,
        theme: String(normalized.theme ?? "")
    };
}

function normalizeSentimentGroupItem(item) {
    const normalized = ensureObject(item);
    return {
        ...normalized,
        sentiment: String(normalized.sentiment ?? ""),
        comment_ids: ensureArray(normalized.comment_ids)
    };
}

function normalizeSentimentInfoItem(item) {
    const normalized = ensureObject(item);
    return {
        ...normalized,
        text: String(normalized.text ?? "")
    };
}

function cloneSentimentsPayload(payload) {
    const normalized = ensureObject(payload);
    return {
        ...normalized,
        aspect: {
            ...ensureObject(normalized.aspect),
            pros: ensureArray(normalized.aspect?.pros).map(normalizeSentimentAspectItem),
            cons: ensureArray(normalized.aspect?.cons).map(normalizeSentimentAspectItem)
        },
        good: ensureArray(normalized.good).map(normalizeSentimentGroupItem),
        bad: ensureArray(normalized.bad).map(normalizeSentimentGroupItem),
        summary: ensureArray(normalized.summary).map((item) => String(item ?? "")),
        text: String(normalized.text ?? ""),
        analysis: String(normalized.analysis ?? ""),
        highlight: String(normalized.highlight ?? ""),
        items: ensureArray(normalized.items).map(normalizeSentimentInfoItem)
    };
}

function buildSentimentTranslationPayload(payload) {
    const aspect = ensureObject(payload?.aspect);
    return {
        aspect: {
            pros: ensureArray(aspect.pros).map((item) => {
                return {
                    sourceTextHash: computeStringHash(item?.sourceTheme ?? item?.theme ?? ""),
                    translatedText: String(item?.translatedTheme ?? item?.theme ?? "")
                };
            }),
            cons: ensureArray(aspect.cons).map((item) => {
                return {
                    sourceTextHash: computeStringHash(item?.sourceTheme ?? item?.theme ?? ""),
                    translatedText: String(item?.translatedTheme ?? item?.theme ?? "")
                };
            })
        },
        good: ensureArray(payload?.good).map((item) => {
            return {
                sourceTextHash: computeStringHash(item?.sourceSentiment ?? item?.sentiment ?? ""),
                translatedText: String(item?.translatedSentiment ?? item?.sentiment ?? "")
            };
        }),
        bad: ensureArray(payload?.bad).map((item) => {
            return {
                sourceTextHash: computeStringHash(item?.sourceSentiment ?? item?.sentiment ?? ""),
                translatedText: String(item?.translatedSentiment ?? item?.sentiment ?? "")
            };
        }),
        summary: ensureArray(payload?.summary).map((item) => {
            return {
                sourceTextHash: computeStringHash(item?.sourceText ?? item?.text ?? item ?? ""),
                translatedText: String(item?.translatedText ?? item?.text ?? item ?? "")
            };
        }),
        analysis: {
            sourceTextHash: computeStringHash(payload?.sourceAnalysis ?? payload?.analysis ?? ""),
            translatedText: String(payload?.translatedAnalysis ?? payload?.analysis ?? "")
        },
        highlight: {
            sourceTextHash: computeStringHash(payload?.sourceHighlight ?? payload?.highlight ?? ""),
            translatedText: String(payload?.translatedHighlight ?? payload?.highlight ?? "")
        },
        items: ensureArray(payload?.items).map((item) => {
            return {
                sourceTextHash: computeStringHash(item?.sourceText ?? item?.text ?? ""),
                translatedText: String(item?.translatedText ?? item?.text ?? "")
            };
        }),
        text: {
            sourceTextHash: computeStringHash(payload?.sourceText ?? payload?.text ?? ""),
            translatedText: String(payload?.translatedText ?? payload?.text ?? "")
        }
    };
}

function applySentimentTranslationPayload(target, translation) {
    const payload = cloneSentimentsPayload(target);
    const translated = ensureObject(translation);
    const translatedAspect = ensureObject(translated.aspect);

    ensureArray(payload.aspect?.pros).forEach((item, index) => {
        const entry = ensureObject(ensureArray(translatedAspect.pros)[index]);
        const sourceTextHash = computeStringHash(item?.theme ?? "");
        const translatedText = String(entry.translatedText ?? "").trim();
        if (translatedText && String(entry.sourceTextHash ?? "") === sourceTextHash) {
            item.theme = translatedText;
        }
    });

    ensureArray(payload.aspect?.cons).forEach((item, index) => {
        const entry = ensureObject(ensureArray(translatedAspect.cons)[index]);
        const sourceTextHash = computeStringHash(item?.theme ?? "");
        const translatedText = String(entry.translatedText ?? "").trim();
        if (translatedText && String(entry.sourceTextHash ?? "") === sourceTextHash) {
            item.theme = translatedText;
        }
    });

    ensureArray(payload.summary).forEach((item, index) => {
        const entry = ensureObject(ensureArray(translated.summary)[index]);
        const sourceTextHash = computeStringHash(item ?? "");
        const translatedText = String(entry.translatedText ?? "").trim();
        if (translatedText && String(entry.sourceTextHash ?? "") === sourceTextHash) {
            payload.summary[index] = translatedText;
        }
    });

    const analysisTranslation = ensureObject(translated.analysis);
    const analysisSourceHash = computeStringHash(payload.analysis ?? "");
    const translatedAnalysis = String(analysisTranslation.translatedText ?? "").trim();
    if (translatedAnalysis && String(analysisTranslation.sourceTextHash ?? "") === analysisSourceHash) {
        payload.analysis = translatedAnalysis;
    }

    const highlightTranslation = ensureObject(translated.highlight);
    const highlightSourceHash = computeStringHash(payload.highlight ?? "");
    const translatedHighlight = String(highlightTranslation.translatedText ?? "").trim();
    if (translatedHighlight && String(highlightTranslation.sourceTextHash ?? "") === highlightSourceHash) {
        payload.highlight = translatedHighlight;
    }

    ensureArray(payload.items).forEach((item, index) => {
        const entry = ensureObject(ensureArray(translated.items)[index]);
        const sourceTextHash = computeStringHash(item?.text ?? "");
        const translatedText = String(entry.translatedText ?? "").trim();
        if (translatedText && String(entry.sourceTextHash ?? "") === sourceTextHash) {
            item.text = translatedText;
        }
    });

    const textTranslation = ensureObject(translated.text);
    const textSourceHash = computeStringHash(payload.text ?? "");
    const translatedText = String(textTranslation.translatedText ?? "").trim();
    if (translatedText && String(textTranslation.sourceTextHash ?? "") === textSourceHash) {
        payload.text = translatedText;
    }

    ensureArray(payload.good).forEach((item, index) => {
        const entry = ensureObject(ensureArray(translated.good)[index]);
        const sourceTextHash = computeStringHash(item?.sentiment ?? "");
        const translatedText = String(entry.translatedText ?? "").trim();
        if (translatedText && String(entry.sourceTextHash ?? "") === sourceTextHash) {
            item.sentiment = translatedText;
        }
    });

    ensureArray(payload.bad).forEach((item, index) => {
        const entry = ensureObject(ensureArray(translated.bad)[index]);
        const sourceTextHash = computeStringHash(item?.sentiment ?? "");
        const translatedText = String(entry.translatedText ?? "").trim();
        if (translatedText && String(entry.sourceTextHash ?? "") === sourceTextHash) {
            item.sentiment = translatedText;
        }
    });

    return payload;
}

function hasMatchingSentimentTranslationPayload(target, translation) {
    const payload = cloneSentimentsPayload(target);
    const translated = ensureObject(translation);
    const currentAspect = ensureObject(payload.aspect);
    const cachedAspect = ensureObject(translated.aspect);
    const aspectGroups = ["pros", "cons"];
    const aspectMatches = aspectGroups.every((group) => {
        const currentItems = ensureArray(currentAspect[group]);
        const cachedItems = ensureArray(cachedAspect[group]);
        if (currentItems.length !== cachedItems.length) {
            return false;
        }

        return currentItems.every((item, index) => {
            return computeStringHash(item?.theme ?? "") === String(cachedItems[index]?.sourceTextHash ?? "");
        });
    });
    if (!aspectMatches) {
        return false;
    }

    const goodItems = ensureArray(payload.good);
    const cachedGoodItems = ensureArray(translated.good);
    if (goodItems.length !== cachedGoodItems.length) {
        return false;
    }

    const goodMatches = goodItems.every((item, index) => {
        return computeStringHash(item?.sentiment ?? "") === String(cachedGoodItems[index]?.sourceTextHash ?? "");
    });
    if (!goodMatches) {
        return false;
    }

    const badItems = ensureArray(payload.bad);
    const cachedBadItems = ensureArray(translated.bad);
    if (badItems.length !== cachedBadItems.length) {
        return false;
    }

    const badMatches = badItems.every((item, index) => {
        return computeStringHash(item?.sentiment ?? "") === String(cachedBadItems[index]?.sourceTextHash ?? "");
    });
    if (!badMatches) {
        return false;
    }

    const currentSummary = ensureArray(payload.summary);
    const cachedSummary = ensureArray(translated.summary);
    if (currentSummary.length !== cachedSummary.length) {
        return false;
    }

    const summaryMatches = currentSummary.every((item, index) => {
        return computeStringHash(item ?? "") === String(cachedSummary[index]?.sourceTextHash ?? "");
    });
    if (!summaryMatches) {
        return false;
    }

    if (computeStringHash(payload.analysis ?? "") !== String(translated.analysis?.sourceTextHash ?? "")) {
        return false;
    }

    if (computeStringHash(payload.highlight ?? "") !== String(translated.highlight?.sourceTextHash ?? "")) {
        return false;
    }

    const currentItems = ensureArray(payload.items);
    const cachedItems = ensureArray(translated.items);
    if (currentItems.length !== cachedItems.length) {
        return false;
    }

    const itemsMatch = currentItems.every((item, index) => {
        return computeStringHash(item?.text ?? "") === String(cachedItems[index]?.sourceTextHash ?? "");
    });
    if (!itemsMatch) {
        return false;
    }

    return computeStringHash(payload.text ?? "") === String(translated.text?.sourceTextHash ?? "");
}

function getSentimentTranslationCacheEntry(cache, mediaType, traktId) {
    const cacheKey = buildSentimentCacheKey(mediaType, traktId);
    const entry = cacheKey ? cache[cacheKey] : null;
    return entry || null;
}

function storeSentimentTranslationCacheEntry(cache, mediaType, traktId, payload) {
    const cacheKey = buildSentimentCacheKey(mediaType, traktId);
    if (!cacheKey) {
        return;
    }

    cache[cacheKey] = {
        translation: buildSentimentTranslationPayload(payload),
        updatedAt: Date.now()
    };
}

async function translateSentimentItems(items) {
    const translationTargets = ensureArray(items).filter((item) => {
        return String(item?.text ?? "").trim();
    });
    if (translationTargets.length === 0) {
        return;
    }

    const translatedTexts = await translateTextsWithGoogle(
        translationTargets.map((item) => String(item.text).trim()),
        "en"
    );

    translationTargets.forEach((item, index) => {
        const translatedText = String(translatedTexts[index] ?? "").trim();
        if (translatedText) {
            item.sourceText = String(item.text).trim();
            item.translatedText = translatedText;
        }
    });
}

async function handleSentiments() {
    const data = JSON.parse(body);
    if (!isPlainObject(data)) {
        $.done({});
        return;
    }

    const target = resolveSentimentRequestTarget(requestUrl);
    if (!target) {
        $.done({});
        return;
    }

    const cache = loadSentimentTranslationCache();
    const cachedEntry = getSentimentTranslationCacheEntry(cache, target.mediaType, target.traktId);
    if (cachedEntry?.translation && hasMatchingSentimentTranslationPayload(data, cachedEntry.translation)) {
        $.done({ body: JSON.stringify(applySentimentTranslationPayload(data, cachedEntry.translation)) });
        return;
    }

    if (!googleTranslationEnabled) {
        $.done({ body: JSON.stringify(data) });
        return;
    }

    const translatedData = cloneSentimentsPayload(data);
    const translationTargets = [];

    ensureArray(translatedData.aspect?.pros).forEach((item) => {
        translationTargets.push({
            target: item,
            field: "theme",
            text: String(item?.theme ?? "")
        });
    });
    ensureArray(translatedData.aspect?.cons).forEach((item) => {
        translationTargets.push({
            target: item,
            field: "theme",
            text: String(item?.theme ?? "")
        });
    });
    ensureArray(translatedData.good).forEach((item) => {
        translationTargets.push({
            target: item,
            field: "sentiment",
            text: String(item?.sentiment ?? "")
        });
    });
    ensureArray(translatedData.bad).forEach((item) => {
        translationTargets.push({
            target: item,
            field: "sentiment",
            text: String(item?.sentiment ?? "")
        });
    });
    ensureArray(translatedData.summary).forEach((item, index) => {
        translationTargets.push({
            target: translatedData.summary,
            field: index,
            text: String(item ?? "")
        });
    });
    translationTargets.push({
        target: translatedData,
        field: "analysis",
        text: String(translatedData.analysis ?? "")
    });
    translationTargets.push({
        target: translatedData,
        field: "highlight",
        text: String(translatedData.highlight ?? "")
    });
    ensureArray(translatedData.items).forEach((item) => {
        translationTargets.push({
            target: item,
            field: "text",
            text: String(item?.text ?? "")
        });
    });
    translationTargets.push({
        target: translatedData,
        field: "text",
        text: String(translatedData.text ?? "")
    });

    try {
        await translateSentimentItems(translationTargets);
        translationTargets.forEach((item) => {
            if (String(item?.translatedText ?? "").trim()) {
                item.target[item.field] = String(item.translatedText);
            }
            delete item.sourceText;
            delete item.translatedText;
        });

        const cachePayload = cloneSentimentsPayload(data);
        const cacheTargets = [];

        ensureArray(cachePayload.aspect?.pros).forEach((item) => {
            cacheTargets.push({
                target: item,
                sourceField: "theme"
            });
        });
        ensureArray(cachePayload.aspect?.cons).forEach((item) => {
            cacheTargets.push({
                target: item,
                sourceField: "theme"
            });
        });
        ensureArray(cachePayload.good).forEach((item) => {
            cacheTargets.push({
                target: item,
                sourceField: "sentiment",
                type: "sentiment"
            });
        });
        ensureArray(cachePayload.bad).forEach((item) => {
            cacheTargets.push({
                target: item,
                sourceField: "sentiment",
                type: "sentiment"
            });
        });
        ensureArray(cachePayload.summary).forEach((item, index) => {
            cacheTargets.push({
                target: cachePayload.summary,
                sourceField: index
            });
        });
        cacheTargets.push({
            target: cachePayload,
            sourceField: "analysis",
            type: "analysis"
        });
        cacheTargets.push({
            target: cachePayload,
            sourceField: "highlight",
            type: "highlight"
        });
        ensureArray(cachePayload.items).forEach((item) => {
            cacheTargets.push({
                target: item,
                sourceField: "text",
                type: "itemText"
            });
        });
        cacheTargets.push({
            target: cachePayload,
            sourceField: "text",
            type: "text"
        });

        cacheTargets.forEach((item, index) => {
            const translatedItem = translationTargets[index];
            const originalText = String(item.target?.[item.sourceField] ?? "");
            const nextTranslatedText = String(translatedItem?.target?.[translatedItem.field] ?? originalText);

            if (item.target === cachePayload.summary) {
                item.target[item.sourceField] = {
                    text: originalText,
                    sourceText: originalText,
                    translatedText: nextTranslatedText
                };
                return;
            }

            if (item.type === "text") {
                item.target.sourceText = originalText;
                item.target.translatedText = nextTranslatedText;
                return;
            }

            if (item.type === "analysis") {
                item.target.sourceAnalysis = originalText;
                item.target.translatedAnalysis = nextTranslatedText;
                return;
            }

            if (item.type === "highlight") {
                item.target.sourceHighlight = originalText;
                item.target.translatedHighlight = nextTranslatedText;
                return;
            }

            if (item.type === "itemText") {
                item.target.sourceText = originalText;
                item.target.translatedText = nextTranslatedText;
                return;
            }

            if (item.type === "sentiment") {
                item.target.sourceSentiment = originalText;
                item.target.translatedSentiment = nextTranslatedText;
                return;
            }

            item.target.sourceTheme = originalText;
            item.target.translatedTheme = nextTranslatedText;
        });

        storeSentimentTranslationCacheEntry(cache, target.mediaType, target.traktId, cachePayload);
        saveSentimentTranslationCache(cache);
    } catch (e) {
        $.log(`Trakt sentiment translation failed for ${target.mediaType}:${target.traktId}:${target.infoId ?? "-"}:${target.version ?? "-"}: ${e}`);
    }

    $.done({ body: JSON.stringify(translatedData) });
}

function getCommentTranslationCacheEntry(cache, commentId) {
    if (!cache || isNullish(commentId)) {
        return null;
    }

    const entry = cache[String(commentId)];
    return isPlainObject(entry) ? entry : null;
}

function getPeopleTranslationCacheEntry(cache, personId) {
    if (!cache || isNullish(personId)) {
        return null;
    }

    const entry = cache[String(personId)];
    return isPlainObject(entry) ? entry : null;
}

function setPeopleTranslationCacheEntry(cache, personId, payload) {
    if (!cache || isNullish(personId) || !isPlainObject(payload)) {
        return false;
    }

    const key = String(personId);
    const currentEntry = getPeopleTranslationCacheEntry(cache, key);
    const nextEntry = isPlainObject(currentEntry) ? { ...currentEntry } : {};

    if (isPlainObject(payload.name)) {
        nextEntry.name = {
            sourceText: String(payload.name.sourceText ?? ""),
            translatedText: String(payload.name.translatedText ?? "")
        };
    }

    if (isPlainObject(payload.biography)) {
        nextEntry.biography = {
            sourceTextHash: String(payload.biography.sourceTextHash ?? ""),
            translatedText: String(payload.biography.translatedText ?? "")
        };
    }

    if (currentEntry && JSON.stringify(currentEntry) === JSON.stringify(nextEntry)) {
        return false;
    }

    nextEntry.updatedAt = Date.now();
    cache[key] = nextEntry;
    return true;
}

function getPersonTranslationCacheKeys(person) {
    const ids = ensureObject(person?.ids);
    const keys = [];

    if (isNonNullish(ids.trakt)) {
        keys.push(String(ids.trakt));
    }

    return keys;
}

function resolvePeopleDetailTarget(url, data) {
    const traktId = data?.ids?.trakt;
    if (isNonNullish(traktId)) {
        return String(traktId);
    }

    const match = normalizeUrlPath(url).match(/^\/people\/(\d+)$/i);
    return match?.[1] ? String(match[1]) : "";
}

function resolvePeopleListTarget(url) {
    const normalizedPath = normalizeUrlPath(url);
    let match = normalizedPath.match(/^\/movies\/(\d+)\/people$/);
    if (match) {
        return {
            mediaType: MEDIA_TYPE.MOVIE,
            traktId: match[1]
        };
    }

    match = normalizedPath.match(/^\/shows\/(\d+)\/people$/);
    if (match) {
        return {
            mediaType: MEDIA_TYPE.SHOW,
            traktId: match[1]
        };
    }

    match = normalizedPath.match(/^\/shows\/(\d+)\/seasons\/(\d+)\/episodes\/(\d+)\/people$/);
    if (match) {
        return {
            mediaType: MEDIA_TYPE.EPISODE,
            showTraktId: match[1],
            seasonNumber: Number(match[2]),
            episodeNumber: Number(match[3])
        };
    }

    return null;
}

function getCachedPersonNameTranslation(entry, sourceText) {
    const cachedName = ensureObject(entry?.name);
    if (!cachedName.translatedText) {
        return "";
    }

    return String(cachedName.sourceText ?? "") === String(sourceText ?? "")
        ? String(cachedName.translatedText)
        : "";
}

function buildPersonNameDisplay(sourceText, translatedText) {
    const original = String(sourceText ?? "").trim();
    const translated = String(translatedText ?? "").trim();

    if (!original) {
        return translated;
    }

    if (!translated || translated === original) {
        return original;
    }

    return `${translated}\n${original}`;
}

function getCachedPersonBiographyTranslation(entry, sourceText) {
    const cachedBiography = ensureObject(entry?.biography);
    if (!cachedBiography.translatedText) {
        return "";
    }

    return String(cachedBiography.sourceTextHash ?? "") === computeStringHash(sourceText)
        ? String(cachedBiography.translatedText)
        : "";
}

function setCommentTranslationCacheEntry(cache, commentId, sourceText, translatedText) {
    if (!cache || isNullish(commentId)) {
        return false;
    }

    const key = String(commentId);
    const nextEntry = {
        sourceTextHash: computeStringHash(sourceText),
        translatedText: String(translatedText ?? ""),
        updatedAt: Date.now()
    };
    const currentEntry = getCommentTranslationCacheEntry(cache, key);

    if (
        currentEntry &&
        currentEntry.sourceTextHash === nextEntry.sourceTextHash &&
        currentEntry.translatedText === nextEntry.translatedText
    ) {
        return false;
    }

    cache[key] = nextEntry;
    return true;
}

function getCachedCommentTranslation(cache, comment) {
    const entry = getCommentTranslationCacheEntry(cache, comment?.id);
    if (!entry) {
        return null;
    }

    const sourceTextHash = computeStringHash(comment?.comment ?? "");
    if (entry.sourceTextHash !== sourceTextHash) {
        return null;
    }

    return String(entry.translatedText ?? "");
}

function shouldTranslateComment(comment) {
    return !!(
        isPlainObject(comment) &&
        isNonNullish(comment.id) &&
        typeof comment.comment === "string" &&
        !isChineseLanguage(comment.language)
    );
}

function collectCommentTranslationGroups(comments, cache) {
    const groups = {};

    ensureArray(comments).forEach((comment) => {
        if (!shouldTranslateComment(comment)) {
            return;
        }

        const cachedTranslation = getCachedCommentTranslation(cache, comment);
        if (cachedTranslation) {
            comment.comment = cachedTranslation;
            return;
        }

        const language = String(comment.language ?? "en").toLowerCase();
        if (!groups[language]) {
            groups[language] = [];
        }

        groups[language].push(comment);
    });

    return groups;
}

function collectCommentTargets(payload) {
    if (isNotArray(payload) || payload.length === 0) {
        return [];
    }

    const commentTargets = [];
    payload.forEach((item) => {
        if (isPlainObject(item?.comment)) {
            commentTargets.push(item.comment);
            return;
        }

        if (isPlainObject(item) && isNonNullish(item.id) && typeof item.comment === "string") {
            commentTargets.push(item);
        }
    });

    return commentTargets;
}

async function translateCommentGroup(comments, sourceLanguage, cache) {
    const sourceTexts = comments.map((item) => item.comment);
    const translatedTexts = await translateTextsWithGoogle(sourceTexts, sourceLanguage);

    comments.forEach((comment, index) => {
        const translatedText = String(translatedTexts[index] ?? "").trim();
        if (!translatedText) {
            return;
        }

        setCommentTranslationCacheEntry(
            cache,
            comment.id,
            sourceTexts[index],
            translatedText
        );
        comment.comment = translatedText;
    });
}

async function translateCommentsInPlace(payload) {
    const comments = collectCommentTargets(payload);
    if (comments.length === 0) {
        return payload;
    }

    const cache = loadCommentTranslationCache();
    const groups = collectCommentTranslationGroups(comments, cache);
    const languages = Object.keys(groups);

    if (googleTranslationEnabled) {
        for (const language of languages) {
            try {
                await translateCommentGroup(groups[language], language, cache);
            } catch (e) {
                $.log(`Trakt comment translation failed for language=${language}: ${e}`);
            }
        }

        saveCommentTranslationCache(cache);
    }
    return payload;
}

async function handleRecentCommentsList() {
    const data = JSON.parse(body);
    if (isNotArray(data) || data.length === 0) {
        $.done({});
        return;
    }

    await Promise.all([
        translateMediaItemsInPlace(data, "recent comments"),
        translateCommentsInPlace(data)
    ]);
    $.done({ body: JSON.stringify(data) });
}

async function handleComments() {
    const comments = JSON.parse(body);
    if (isNotArray(comments) || comments.length === 0) {
        $.done({});
        return;
    }

    await translateCommentsInPlace(comments);
    $.done({ body: JSON.stringify(comments) });
}

function buildListTextCacheKey(listId) {
    if (isNullish(listId)) {
        return "";
    }

    return String(listId);
}

function getCachedListTextTranslation(cache, listId, field, sourceText) {
    const cacheKey = buildListTextCacheKey(listId);
    if (!cacheKey) {
        return "";
    }

    const entry = cache[cacheKey];
    if (!isPlainObject(entry)) {
        return "";
    }

    const cachedFieldEntry = isPlainObject(entry[field]) ? entry[field] : null;
    if (!isPlainObject(cachedFieldEntry)) {
        return "";
    }

    if (String(cachedFieldEntry.sourceTextHash ?? "") !== computeStringHash(sourceText)) {
        return "";
    }

    return String(cachedFieldEntry.translatedText ?? "").trim();
}

function setListTextTranslationCacheEntry(cache, listId, field, sourceText, translatedText) {
    const cacheKey = buildListTextCacheKey(listId);
    if (!cacheKey || !translatedText) {
        return;
    }

    const currentEntry = isPlainObject(cache[cacheKey]) ? cache[cacheKey] : {};
    currentEntry[field] = {
        sourceTextHash: computeStringHash(sourceText),
        translatedText: translatedText
    };
    currentEntry.updatedAt = Date.now();
    cache[cacheKey] = currentEntry;
}

function collectListTextTargets(data) {
    if (isNotArray(data)) {
        return [];
    }

    return data.reduce((targets, item) => {
        if (isPlainObject(item?.list)) {
            targets.push(item.list);
            return targets;
        }

        if (isPlainObject(item)) {
            targets.push(item);
        }

        return targets;
    }, []);
}

function collectListTextTranslationGroups(lists, cache) {
    const groups = {};

    collectListTextTargets(lists).forEach((item) => {
        const listId = item?.ids?.trakt ?? null;
        const language = "en";
        const queueFieldTranslation = (field, sourceText) => {
            const normalizedSourceText = String(sourceText ?? "").trim();
            if (!normalizedSourceText || containsChineseCharacter(normalizedSourceText)) {
                return;
            }

            const cachedTranslation = getCachedListTextTranslation(cache, listId, field, normalizedSourceText);
            if (cachedTranslation) {
                item[field] = cachedTranslation;
                return;
            }

            if (!groups[language]) {
                groups[language] = [];
            }

            groups[language].push({
                target: item,
                listId: listId,
                field: field,
                sourceText: normalizedSourceText
            });
        };

        queueFieldTranslation("name", item?.name);
        queueFieldTranslation("description", item?.description);
    });

    return groups;
}

async function translateListTextGroup(items, sourceLanguage, cache) {
    const sourceTexts = items.map((item) => item.sourceText);
    const translatedTexts = await translateTextsWithGoogle(sourceTexts, sourceLanguage);

    items.forEach((item, index) => {
        const translatedText = String(translatedTexts[index] ?? "").trim();
        if (!translatedText) {
            return;
        }

        setListTextTranslationCacheEntry(
            cache,
            item.listId,
            item.field,
            sourceTexts[index],
            translatedText
        );
        item.target[item.field] = translatedText;
    });
}

async function handleList() {
    const lists = JSON.parse(body);
    if (isNotArray(lists) || lists.length === 0) {
        $.done({});
        return;
    }

    const cache = loadListTranslationCache();
    const groups = collectListTextTranslationGroups(lists, cache);
    const languages = Object.keys(groups);

    if (googleTranslationEnabled) {
        for (const language of languages) {
            try {
                await translateListTextGroup(groups[language], language, cache);
            } catch (e) {
                $.log(`Trakt list description translation failed for language=${language}: ${e}`);
            }
        }
    }

    saveListTranslationCache(cache);
    $.done({ body: JSON.stringify(lists) });
}

function getLinkIdsCacheEntry(cache, traktId) {
    if (!cache || isNullish(traktId)) {
        return null;
    }

    const entry = cache[String(traktId)];
    return isPlainObject(entry) ? entry : null;
}

function mergeLinkIdsCacheEntry(currentEntry, nextEntry) {
    const current = ensureObject(currentEntry);
    const incoming = ensureObject(nextEntry);
    const merged = {};
    const mergedIds = { ...ensureObject(current.ids), ...ensureObject(incoming.ids) };
    const mergedShowIds = { ...ensureObject(current.showIds), ...ensureObject(incoming.showIds) };

    if (Object.keys(mergedIds).length > 0) {
        merged.ids = mergedIds;
    }

    if (Object.keys(mergedShowIds).length > 0) {
        merged.showIds = mergedShowIds;
    }

    if (isNonNullish(incoming.seasonNumber)) {
        merged.seasonNumber = Number(incoming.seasonNumber);
    } else if (isNonNullish(current.seasonNumber)) {
        merged.seasonNumber = Number(current.seasonNumber);
    }

    if (isNonNullish(incoming.episodeNumber)) {
        merged.episodeNumber = Number(incoming.episodeNumber);
    } else if (isNonNullish(current.episodeNumber)) {
        merged.episodeNumber = Number(current.episodeNumber);
    }

    return merged;
}

function setLinkIdsCacheEntry(cache, traktId, entry) {
    if (!cache || isNullish(traktId) || !isPlainObject(entry)) {
        return false;
    }

    const key = String(traktId);
    const current = getLinkIdsCacheEntry(cache, key);
    const next = mergeLinkIdsCacheEntry(current, entry);
    const previousJson = current ? JSON.stringify(current) : "";
    const nextJson = JSON.stringify(next);

    if (previousJson === nextJson) {
        return false;
    }

    next.updatedAt = Date.now();
    cache[key] = next;
    return true;
}

function buildFallbackShowIds(showTraktId, linkCache) {
    if (isNullish(showTraktId)) {
        return null;
    }

    const showEntry = getLinkIdsCacheEntry(linkCache, showTraktId);
    if (isPlainObject(showEntry?.ids)) {
        return cloneObject(showEntry.ids);
    }

    return {
        trakt: showTraktId
    };
}

function cacheMediaIdsFromDetailResponse(linkCache, mediaType, ref, data) {
    if (!linkCache || !data || typeof data !== "object") {
        return false;
    }

    if (mediaType === MEDIA_TYPE.MOVIE || mediaType === MEDIA_TYPE.SHOW) {
        const traktId = data?.ids?.trakt ?? null;
        return setLinkIdsCacheEntry(linkCache, traktId, {
            ids: cloneObject(data.ids)
        });
    }

    if (mediaType === MEDIA_TYPE.EPISODE) {
        const episodeTraktId = data?.ids?.trakt ?? null;
        if (isNullish(episodeTraktId)) {
            return false;
        }

        return setLinkIdsCacheEntry(linkCache, episodeTraktId, {
            ids: cloneObject(data.ids),
            showIds: buildFallbackShowIds(ref?.showId, linkCache),
            seasonNumber: isNonNullish(data.season) ? data.season : ref?.seasonNumber,
            episodeNumber: isNonNullish(data.number) ? data.number : ref?.episodeNumber
        });
    }

    return false;
}

function cacheEpisodeIdsFromSeasonList(linkCache, showId, seasons) {
    if (!linkCache || isNotArray(seasons)) {
        return false;
    }

    let changed = false;
    const showIds = buildFallbackShowIds(showId, linkCache);

    seasons.forEach((season) => {
        const episodes = ensureArray(season?.episodes);
        episodes.forEach((episode) => {
            const episodeTraktId = episode?.ids?.trakt ?? null;
            if (isNullish(episodeTraktId)) {
                return;
            }

            if (setLinkIdsCacheEntry(linkCache, episodeTraktId, {
                ids: cloneObject(episode.ids),
                showIds: cloneObject(showIds),
                seasonNumber: episode?.season ?? null,
                episodeNumber: episode?.number ?? null
            })) {
                changed = true;
            }
        });
    });

    return changed;
}

function buildDetailLookupUrl(mediaType, traktId) {
    if (isNullish(traktId)) {
        return "";
    }

    if (mediaType === MEDIA_TYPE.MOVIE) {
        return `${traktApiBaseUrl}/movies/${traktId}?extended=cloud9,full,watchnow`;
    }

    if (mediaType === MEDIA_TYPE.SHOW) {
        return `${traktApiBaseUrl}/shows/${traktId}?extended=cloud9,full,watchnow`;
    }

    return "";
}

async function ensureMediaIdsCacheEntry(linkCache, mediaType, traktId) {
    if (!linkCache || isNullish(traktId)) {
        return null;
    }

    let entry = getLinkIdsCacheEntry(linkCache, traktId);
    if (entry && entry.ids && isNonNullish(entry.ids.tmdb)) {
        return entry;
    }

    const lookupUrl = buildDetailLookupUrl(mediaType, traktId);
    if (!lookupUrl) {
        return entry;
    }

    const payload = await fetchJson(lookupUrl);
    if (isPlainObject(payload)) {
        setLinkIdsCacheEntry(linkCache, traktId, {
            ids: cloneObject(payload.ids)
        });
        saveLinkIdsCache(linkCache);
        entry = getLinkIdsCacheEntry(linkCache, traktId);
    }

    return entry;
}

async function ensureEpisodeShowIds(linkCache, episodeTraktId, episodeEntry) {
    if (!linkCache || isNullish(episodeTraktId) || !episodeEntry || !isPlainObject(episodeEntry.showIds)) {
        return isPlainObject(episodeEntry?.showIds) ? episodeEntry.showIds : null;
    }

    if (isNonNullish(episodeEntry.showIds.tmdb)) {
        return episodeEntry.showIds;
    }

    if (isNullish(episodeEntry.showIds.trakt)) {
        return episodeEntry.showIds;
    }

    const showEntry = await ensureMediaIdsCacheEntry(linkCache, MEDIA_TYPE.SHOW, episodeEntry.showIds.trakt);
    if (!showEntry || !isPlainObject(showEntry.ids)) {
        return episodeEntry.showIds;
    }

    setLinkIdsCacheEntry(linkCache, episodeTraktId, {
        showIds: cloneObject(showEntry.ids)
    });
    saveLinkIdsCache(linkCache);
    return showEntry.ids;
}

function buildTmdbCreditsLookupUrl(mediaType, tmdbId) {
    if (isNullish(tmdbId)) {
        return "";
    }

    const normalizedMediaType = mediaType === MEDIA_TYPE.MOVIE ? "movie" : "tv";
    const appendField = mediaType === MEDIA_TYPE.MOVIE ? "credits" : "aggregate_credits";
    return `${TMDB_API_BASE_URL}/${normalizedMediaType}/${tmdbId}?language=zh-CN&append_to_response=${appendField}&api_key=${TMDB_API_KEY}`;
}

async function fetchTmdbCredits(mediaType, tmdbId) {
    const url = buildTmdbCreditsLookupUrl(mediaType, tmdbId);
    if (!url) {
        return null;
    }

    return fetchJson(url, null, false);
}

function buildTmdbPersonLookupUrl(tmdbPersonId) {
    if (isNullish(tmdbPersonId)) {
        return "";
    }

    return `${TMDB_API_BASE_URL}/person/${tmdbPersonId}?language=zh-CN&api_key=${TMDB_API_KEY}`;
}

async function fetchTmdbPerson(tmdbPersonId) {
    const url = buildTmdbPersonLookupUrl(tmdbPersonId);
    if (!url) {
        return null;
    }

    return fetchJson(url, null, false);
}

function buildTmdbCastNameMap(tmdbPayload) {
    const nameMap = {};
    const cast = ensureArray(tmdbPayload?.credits?.cast).length > 0
        ? ensureArray(tmdbPayload?.credits?.cast)
        : ensureArray(tmdbPayload?.aggregate_credits?.cast);
    const crew = ensureArray(tmdbPayload?.credits?.crew).length > 0
        ? ensureArray(tmdbPayload?.credits?.crew)
        : ensureArray(tmdbPayload?.aggregate_credits?.crew);

    cast.concat(crew).forEach((item) => {
        const personId = item?.id;
        const name = String(item?.name ?? "").trim();
        if (isNullish(personId) || !name) {
            return;
        }

        nameMap[String(personId)] = name;
    });
    return nameMap;
}

function collectPeopleListPersonItems(data) {
    if (!isPlainObject(data)) {
        return [];
    }

    const crewItems = isPlainObject(data.crew)
        ? Object.keys(data.crew).reduce((items, key) => items.concat(ensureArray(data.crew[key])), [])
        : [];

    return ensureArray(data.cast).concat(crewItems);
}

function applyPeopleListCachedNameTranslations(data, cache) {
    if (!isPlainObject(data) || !isPlainObject(cache)) {
        return {
            changed: false,
            hasMissing: false
        };
    }

    let changed = false;
    let hasMissing = false;
    collectPeopleListPersonItems(data).forEach((item) => {
        const person = item?.person;
        if (!isPlainObject(person)) {
            return;
        }

        const originalName = String(person.name ?? "").trim();
        if (!originalName) {
            return;
        }

        const cachedName = getPersonTranslationCacheKeys(person)
            .map((personKey) => getCachedPersonNameTranslation(getPeopleTranslationCacheEntry(cache, personKey), originalName))
            .find((value) => !!value);

        if (cachedName) {
            if (cachedName !== originalName) {
                person.name = cachedName;
                changed = true;
            }
            return;
        }

        if (isNonNullish(person?.ids?.tmdb)) {
            hasMissing = true;
        }
    });

    return {
        changed,
        hasMissing
    };
}

function applyPeopleListCastNameTranslations(data, tmdbCastNameMap, cache) {
    if (!isPlainObject(data) || !isPlainObject(tmdbCastNameMap)) {
        return false;
    }

    let changed = false;
    collectPeopleListPersonItems(data).forEach((item) => {
        const person = item?.person;
        const personTmdbId = person?.ids?.tmdb;
        if (!isPlainObject(person) || isNullish(personTmdbId)) {
            return;
        }

        const translatedName = String(tmdbCastNameMap[String(personTmdbId)] ?? "").trim();
        if (!translatedName || !containsChineseCharacter(translatedName)) {
            return;
        }

        const originalName = String(person.name ?? "").trim();
        if (originalName && originalName !== translatedName) {
            person.name = translatedName;
            changed = true;

            if (cache) {
                getPersonTranslationCacheKeys(person).forEach((personKey) => {
                    setPeopleTranslationCacheEntry(cache, personKey, {
                        name: {
                            sourceText: originalName,
                            translatedText: translatedName
                        }
                    });
                });
            }
        }
    });

    return changed;
}

function collectPeopleListGoogleNameTranslationTargets(data, cache) {
    if (!isPlainObject(data) || !isPlainObject(cache)) {
        return [];
    }

    return collectPeopleListPersonItems(data).reduce((targets, item) => {
        const person = item?.person;
        if (!isPlainObject(person)) {
            return targets;
        }

        const originalName = String(person.name ?? "").trim();
        if (!originalName) {
            return targets;
        }

        const cachedName = getPersonTranslationCacheKeys(person)
            .map((personKey) => getCachedPersonNameTranslation(getPeopleTranslationCacheEntry(cache, personKey), originalName))
            .find((value) => !!value);

        if (!cachedName) {
            targets.push({
                person,
                originalName
            });
        }

        return targets;
    }, []);
}

function applyPeopleListGoogleNameTranslations(translationTargets, translatedTexts, cache) {
    let changed = false;
    const normalizedTranslatedTexts = ensureArray(translatedTexts);
    ensureArray(translationTargets).forEach((target, index) => {
        const person = target?.person;
        const originalName = String(target?.originalName ?? "").trim();
        const translatedName = String(normalizedTranslatedTexts[index] ?? "").trim();
        if (
            !isPlainObject(person) ||
            !originalName ||
            !translatedName ||
            translatedName === originalName ||
            !containsChineseCharacter(translatedName)
        ) {
            return;
        }

        if (String(person.name ?? "").trim() !== originalName) {
            return;
        }

        person.name = translatedName;
        changed = true;

        if (cache) {
            getPersonTranslationCacheKeys(person).forEach((personKey) => {
                setPeopleTranslationCacheEntry(cache, personKey, {
                    name: {
                        sourceText: originalName,
                        translatedText: translatedName
                    }
                });
            });
        }
    });

    return changed;
}

async function resolvePeopleListTmdbId(target, linkCache) {
    if (!target || !linkCache) {
        return null;
    }

    if (target.mediaType === MEDIA_TYPE.MOVIE || target.mediaType === MEDIA_TYPE.SHOW) {
        const entry = await ensureMediaIdsCacheEntry(linkCache, target.mediaType, target.traktId);
        return isNonNullish(entry?.ids?.tmdb) ? entry.ids.tmdb : null;
    }

    if (target.mediaType === MEDIA_TYPE.EPISODE) {
        const showEntry = await ensureMediaIdsCacheEntry(linkCache, MEDIA_TYPE.SHOW, target.showTraktId);
        return isNonNullish(showEntry?.ids?.tmdb) ? showEntry.ids.tmdb : null;
    }

    return null;
}

function buildPeopleListTmdbMediaType(target) {
    if (!target) {
        return null;
    }

    return target.mediaType === MEDIA_TYPE.MOVIE ? MEDIA_TYPE.MOVIE : MEDIA_TYPE.SHOW;
}

function buildWatchnowRedirectLink(deeplink) {
    if (!deeplink) {
        return "";
    }

    return `${WATCHNOW_REDIRECT_URL}?deeplink=${encodeURIComponent(deeplink)}`;
}

function buildShortcutsJumpLink(deeplink) {
    if (!deeplink) {
        return "";
    }

    return `${SHORTCUTS_OPENLINK_URL}${encodeURIComponent(deeplink)}`;
}

function buildRedirectableLaunchLink(deeplink) {
    if (!deeplink) {
        return "";
    }

    return buildWatchnowRedirectLink(deeplink);
}

function buildTraktPlayerLaunchLink(deeplink) {
    if (!deeplink) {
        return "";
    }

    return buildRedirectableLaunchLink(deeplink);
}

function doneRedirect(location) {
    const targetLocation = String(location ?? "").trim();
    if (!targetLocation) {
        $.done({});
        return;
    }

    $.done({
        response: {
            status: 302,
            headers: {
                Location: targetLocation
            }
        }
    });
}

function resolveDirectRedirectLocation(url) {
    try {
        const parsedUrl = new URL(String(url ?? ""));
        if (
            String(parsedUrl.hostname).toLowerCase() === "loon-plugins.demojameson.de5.net" &&
            parsedUrl.pathname === "/api/redirect"
        ) {
            const deeplink = parsedUrl.searchParams.get("deeplink");
            if (deeplink) {
                return decodeURIComponent(deeplink);
            }
        }

        if (
            String(parsedUrl.hostname).toLowerCase() === "image.tmdb.org" &&
            /^\/t\/p\/w342\/([a-z0-9_-]+)_logo\.webp$/i.test(parsedUrl.pathname)
        ) {
            const match = parsedUrl.pathname.match(/^\/t\/p\/w342\/([a-z0-9_-]+)_logo\.webp$/i);
            if (match?.[1]) {
                return `${TMDB_LOGO_TARGET_BASE_URL}/${match[1].toLowerCase()}_logo.webp`;
            }
        }
    } catch (e) {
        return "";
    }

    return "";
}

function handleDirectRedirectRequest() {
    const location = resolveDirectRedirectLocation(requestUrl);
    if (
        location &&
        useShortcutsJumpEnabled &&
        /^https:\/\/loon-plugins\.demojameson\.de5\.net\/api\/redirect\?/i.test(String(requestUrl ?? ""))
    ) {
        doneRedirect(buildShortcutsJumpLink(location));
        return;
    }

    doneRedirect(location);
}

function isSofaTimeRequest() {
    return /^Sofa(?:\s|%20)Time/i.test(String(getRequestHeaderValue("user-agent") ?? "").trim());
}

function resolveStreamingAvailabilityImdbId(url) {
    if (!isUrlFromHost(url, "streaming-availability.p.rapidapi.com")) {
        return "";
    }

    const match = normalizeUrlPath(url).match(/^\/shows\/(tt\d+)$/i);
    return match?.[1] ?? "";
}

function isStreamingAvailabilityCountriesRequest(url) {
    return isUrlFromHost(url, "streaming-availability.p.rapidapi.com") &&
        /^\/countries\/[a-z]{2}$/i.test(normalizeUrlPath(url));
}

function resolveStreamingAvailabilityTmdbTarget(payload, fallbackTarget) {
    const tmdbValue = payload?.tmdbId ? String(payload.tmdbId).trim() : "";
    const match = tmdbValue.match(/^(movie|tv)\/(\d+)$/i);
    if (!match) {
        return fallbackTarget;
    }

    const tmdbType = match[1].toLowerCase();
    const tmdbId = Number(match[2]);
    return {
        mediaType: tmdbType === "movie" ? MEDIA_TYPE.MOVIE : MEDIA_TYPE.SHOW,
        imdbId: fallbackTarget?.imdbId ?? "",
        tmdbId,
        showTmdbId: tmdbType === "tv" ? tmdbId : null
    };
}

function buildFilmShowRatingsLookupUrl(imdbId) {
    const normalizedImdbId = String(imdbId ?? "").trim();
    if (!/^tt\d+$/i.test(normalizedImdbId)) {
        return "";
    }

    return `${FILM_SHOW_RATINGS_API_BASE_URL}/item/?id=${escapeQueryComponent(normalizedImdbId)}`;
}

function buildFilmShowRatingsLookupHeaders() {
    const headers = {
        accept: "application/json",
        "x-rapidapi-host": FILM_SHOW_RATINGS_RAPIDAPI_HOST
    };
    const rapidApiKey = getRequestHeaderValue("x-rapidapi-key");
    const rapidApiUa = getRequestHeaderValue("x-rapidapi-ua");
    const userAgent = getRequestHeaderValue("user-agent");
    const acceptLanguage = getRequestHeaderValue("accept-language");
    const acceptEncoding = getRequestHeaderValue("accept-encoding");

    if (rapidApiKey) {
        headers["x-rapidapi-key"] = rapidApiKey;
    }
    if (rapidApiUa) {
        headers["x-rapidapi-ua"] = rapidApiUa;
    }
    if (userAgent) {
        headers["user-agent"] = userAgent;
    }
    if (acceptLanguage) {
        headers["accept-language"] = acceptLanguage;
    }
    if (acceptEncoding) {
        headers["accept-encoding"] = acceptEncoding;
    }

    return headers;
}

function resolveFilmShowRatingsMediaType(type) {
    const normalizedType = String(type ?? "").trim().toLowerCase();
    if (normalizedType === "show") {
        return MEDIA_TYPE.SHOW;
    }
    if (normalizedType === "film") {
        return MEDIA_TYPE.MOVIE;
    }
    return "";
}

async function resolveTmdbTargetByImdb(target) {
    const imdbId = String(target?.imdbId ?? "").trim();
    const lookupUrl = buildFilmShowRatingsLookupUrl(imdbId);
    if (!lookupUrl) {
        return target;
    }

    try {
        const payload = await fetchJson(lookupUrl, buildFilmShowRatingsLookupHeaders(), false);
        const resolvedMediaType = resolveFilmShowRatingsMediaType(payload?.result?.type);
        const tmdbId = Number(payload?.result?.ids?.TMDB);
        if (!resolvedMediaType || !Number.isFinite(tmdbId) || tmdbId <= 0) {
            return target;
        }

        if (target?.mediaType === MEDIA_TYPE.EPISODE && resolvedMediaType === MEDIA_TYPE.SHOW) {
            return {
                ...target,
                mediaType: MEDIA_TYPE.EPISODE,
                showTmdbId: tmdbId
            };
        }

        if (resolvedMediaType === MEDIA_TYPE.SHOW) {
            return {
                ...target,
                mediaType: MEDIA_TYPE.SHOW,
                tmdbId: tmdbId,
                showTmdbId: tmdbId
            };
        }

        if (resolvedMediaType === MEDIA_TYPE.MOVIE) {
            return {
                ...target,
                mediaType: MEDIA_TYPE.MOVIE,
                tmdbId: tmdbId
            };
        }
    } catch (e) {
        $.log(`Film Show Ratings lookup failed for ${imdbId}: ${e}`);
    }

    return target;
}

function createSofaTimeStreamingOption(source, target) {
    const definition = PLAYER_DEFINITIONS[source];
    if (!definition || !target || isNullish(target.tmdbId) || typeof definition.buildDeeplink !== "function") {
        return null;
    }

    const context = {
        tmdbId: target.tmdbId,
        showTmdbId: isNonNullish(target.showTmdbId) ? target.showTmdbId : null
    };
    const deeplink = definition.buildDeeplink(target, context);

    if (!deeplink) {
        return null;
    }

    const option = createSofaTimeTemplate(definition);
    option.link = deeplink;
    option.videoLink = deeplink;
    return option;
}

function injectSofaTimeStreamingOptions(payload, target) {
    if (!isPlainObject(payload)) {
        return payload;
    }

    const streamingTarget = resolveStreamingAvailabilityTmdbTarget(payload, target);

    rewriteStreamingOptionsMap(payload, streamingTarget);

    const seasons = ensureArray(payload.seasons);
    seasons.forEach((season) => {
        if (!isPlainObject(season)) {
            return;
        }

        rewriteStreamingOptionsMap(season, streamingTarget);

        const episodes = ensureArray(season.episodes);
        episodes.forEach((episode) => {
            if (!isPlainObject(episode)) {
                return;
            }

            rewriteStreamingOptionsMap(episode, streamingTarget);
        });
    });

    return payload;
}

function createSofaTimeStreamingOptionsByRegion(regionCode, target) {
    return enabledPlayerTypes.map((source) => createSofaTimeStreamingOption(source, target)).filter(Boolean);
}

function doneJsonResponse(payload) {
    $.done({
        status: 200,
        body: JSON.stringify(payload)
    });
}

function rewriteStreamingOptionsMap(target, streamingTarget) {
    if (!isPlainObject(target)) {
        return;
    }

    const streamingOptions = isPlainObject(target.streamingOptions) ? target.streamingOptions : {};
    const regionCodes = Object.keys(streamingOptions);
    const finalRegionCodes = regionCodes.length > 0 ? regionCodes : REGION_CODES;
    finalRegionCodes.forEach((regionCode) => {
        const options = createSofaTimeStreamingOptionsByRegion(regionCode, streamingTarget);
        if (options.length === 0) {
            return;
        }

        streamingOptions[String(regionCode ?? "").toLowerCase()] = options;
    });
    target.streamingOptions = streamingOptions;
}

async function handleSofaTimeStreamingAvailability() {
    if (typeof $.response === "undefined" || !isSofaTimeRequest()) {
        $.done({});
        return;
    }

    const imdbId = resolveStreamingAvailabilityImdbId(requestUrl);
    if (!imdbId) {
        $.done({});
        return;
    }

    const target = { imdbId };

    const statusCode = getResponseStatusCode($.response);
    let payload = ensureObject($.toObj(body));
    let streamingTarget;

    if (statusCode === 404) {
        streamingTarget = await resolveTmdbTargetByImdb(target);
    } else {
        streamingTarget = resolveStreamingAvailabilityTmdbTarget(payload, target);
    }

    if (isNonNullish(streamingTarget?.tmdbId) && streamingTarget?.mediaType === MEDIA_TYPE.SHOW) {
        payload.tmdbId = `tv/${streamingTarget.tmdbId}`;
    }

    if (isNonNullish(streamingTarget?.tmdbId) && streamingTarget?.mediaType === MEDIA_TYPE.MOVIE) {
        payload.tmdbId = `movie/${streamingTarget.tmdbId}`;
    }

    payload = injectSofaTimeStreamingOptions(payload, streamingTarget);

    if (statusCode === 404 && isNonNullish(payload.tmdbId)) {
        doneJsonResponse(payload);
    } else {
        $.done({ body: JSON.stringify(payload) });
    }
}

function injectSofaTimeCountryServices(payload) {
    if (!isPlainObject(payload)) {
        return payload;
    }

    const services = ensureArray(payload.services).slice();
    const filteredServices = services.filter((service) => {
        const id = service?.id ? String(service.id).toLowerCase() : "";
        return !Object.values(PLAYER_TYPE).includes(id);
    });

    Object.values(PLAYER_TYPE).slice().reverse().forEach((source) => {
        filteredServices.unshift(createSofaTimeCountryService(PLAYER_DEFINITIONS[source]));
    });
    payload.services = filteredServices;
    return payload;
}

function handleSofaTimeCountries() {
    if (typeof $.response === "undefined" || !isSofaTimeRequest()) {
        $.done({});
        return;
    }

    if (!isStreamingAvailabilityCountriesRequest(requestUrl)) {
        $.done({});
        return;
    }

    const payload = JSON.parse(body);
    $.done({ body: JSON.stringify(injectSofaTimeCountryServices(payload)) });
}

function injectTmdbProviderCatalog(payload) {
    if (!isPlainObject(payload)) {
        return payload;
    }

    const results = ensureArray(payload.results).slice();
    const filteredResults = results.filter((item) => {
        const providerId = item?.provider_id ? Number(item.provider_id) : NaN;
        const providerName = item?.provider_name ? String(item.provider_name).toLowerCase() : "";
        return !TMDB_PROVIDER_LIST_ENTRIES.some((entry) => {
            return providerId === entry.provider_id || providerName === String(entry.provider_name).toLowerCase();
        });
    });

    TMDB_PROVIDER_LIST_ENTRIES.slice().reverse().forEach((entry) => {
        filteredResults.unshift(cloneObject(entry));
    });
    payload.results = filteredResults;
    return payload;
}

function handleTmdbProviderCatalog() {
    if (typeof $.response === "undefined" || !isSofaTimeRequest()) {
        $.done({});
        return;
    }

    const payload = JSON.parse(body);
    $.done({ body: JSON.stringify(injectTmdbProviderCatalog(payload)) });
}

function buildInfuseDeeplink(target, context) {
    if (!target || !context) {
        return "";
    }

    if (target.mediaType === MEDIA_TYPE.MOVIE && isNonNullish(context.tmdbId)) {
        return `infuse://movie/${context.tmdbId}`;
    }

    if (target.mediaType === MEDIA_TYPE.SHOW && isNonNullish(context.tmdbId)) {
        return `infuse://series/${context.tmdbId}`;
    }

    if (
        target.mediaType === MEDIA_TYPE.EPISODE &&
        isNonNullish(context.showTmdbId) &&
        isNonNullish(context.seasonNumber) &&
        isNonNullish(context.episodeNumber)
    ) {
        return `infuse://series/${context.showTmdbId}-${context.seasonNumber}-${context.episodeNumber}`;
    }

    return "";
}

function buildForwardDeeplink(target, context) {
    if (!target || !context) {
        return "";
    }

    if (target.mediaType === MEDIA_TYPE.MOVIE && isNonNullish(context.tmdbId)) {
        return `forward://tmdb?id=${context.tmdbId}&type=movie`;
    }

    if ((target.mediaType === MEDIA_TYPE.SHOW || target.mediaType === MEDIA_TYPE.EPISODE) && isNonNullish(context.showTmdbId ?? context.tmdbId)) {
        return `forward://tmdb?id=${context.showTmdbId ?? context.tmdbId}&type=tv`;
    }

    return "";
}

function buildEplayerXDeeplink(target, context) {
    if (!target || !context) {
        return "";
    }

    if (target.mediaType === MEDIA_TYPE.MOVIE && isNonNullish(context.tmdbId)) {
        return `eplayerx://tmdb-info/detail?id=${context.tmdbId}&type=movie`;
    }

    if ((target.mediaType === MEDIA_TYPE.SHOW || target.mediaType === MEDIA_TYPE.EPISODE) && isNonNullish(context.showTmdbId ?? context.tmdbId)) {
        return `eplayerx://tmdb-info/detail?id=${context.showTmdbId ?? context.tmdbId}&type=tv`;
    }

    return "";
}

async function resolveWatchnowContext(target, linkCache) {
    if (!target || !linkCache) {
        return null;
    }

    if (target.mediaType === MEDIA_TYPE.MOVIE) {
        const movieEntry = await ensureMediaIdsCacheEntry(linkCache, MEDIA_TYPE.MOVIE, target.traktId);
        return movieEntry && movieEntry.ids && isNonNullish(movieEntry.ids.tmdb)
            ? {
                tmdbId: movieEntry.ids.tmdb
            }
            : null;
    }

    if (target.mediaType === MEDIA_TYPE.SHOW) {
        const showEntry = await ensureMediaIdsCacheEntry(linkCache, MEDIA_TYPE.SHOW, target.traktId);
        return showEntry && showEntry.ids && isNonNullish(showEntry.ids.tmdb)
            ? {
                tmdbId: showEntry.ids.tmdb,
                showTmdbId: showEntry.ids.tmdb
            }
            : null;
    }

    if (target.mediaType === MEDIA_TYPE.EPISODE) {
        const episodeEntry = getLinkIdsCacheEntry(linkCache, target.traktId);
        if (!episodeEntry) {
            return null;
        }

        const showIds = await ensureEpisodeShowIds(linkCache, target.traktId, episodeEntry);
        return isPlainObject(showIds) && isNonNullish(showIds.tmdb)
            ? {
                tmdbId: episodeEntry.ids && episodeEntry.ids.tmdb,
                showTmdbId: showIds.tmdb,
                seasonNumber: episodeEntry.seasonNumber,
                episodeNumber: episodeEntry.episodeNumber
            }
            : null;
    }

    return null;
}

function injectCustomWatchnowEntriesIntoAllRegions(payload, customEntries) {
    return injectCustomWatchnowEntriesIntoPayloadForRegions(payload, customEntries, REGION_CODES);
}

function handleWatchnowSources() {
    const payload = JSON.parse(body);
    $.done({ body: JSON.stringify(injectCustomSourcesIntoPayload(payload)) });
}

async function handleWatchnow() {
    const payload = JSON.parse(body);
    const target = resolveWatchnowTarget(requestUrl);

    if (!target) {
        $.done({});
        return;
    }

    const linkCache = loadLinkIdsCache();
    const context = await resolveWatchnowContext(target, linkCache);
    const customEntries = buildCustomWatchnowEntries(
        target,
        context,
        enabledPlayerTypes,
        PLAYER_DEFINITIONS,
        buildTraktPlayerLaunchLink
    );
    $.done({ body: JSON.stringify(injectCustomWatchnowEntriesIntoAllRegions(payload, customEntries)) });
}

async function handleMediaPeopleList() {
    const data = JSON.parse(body);
    if (!isPlainObject(data)) {
        $.done({});
        return;
    }

    const target = resolvePeopleListTarget(requestUrl);
    if (!target) {
        $.done({});
        return;
    }

    const cache = loadPeopleTranslationCache();
    const cachedResult = applyPeopleListCachedNameTranslations(data, cache);

    try {
        if (!cachedResult.hasMissing) {
            $.done({ body: JSON.stringify(data) });
            return;
        }

        const googleTargets = googleTranslationEnabled
            ? collectPeopleListGoogleNameTranslationTargets(data, cache)
            : [];
        const googlePromise = googleTargets.length > 0
            ? translateTextsWithGoogle(googleTargets.map((item) => item.originalName), "en")
            : Promise.resolve([]);
        const tmdbPromise = (async () => {
            const linkCache = loadLinkIdsCache();
            const tmdbId = await resolvePeopleListTmdbId(target, linkCache);
            const tmdbMediaType = buildPeopleListTmdbMediaType(target);
            if (isNullish(tmdbId) || !tmdbMediaType) {
                return null;
            }

            return fetchTmdbCredits(tmdbMediaType, tmdbId);
        })();

        const [tmdbResult, googleResult] = await Promise.allSettled([tmdbPromise, googlePromise]);
        let changed = false;

        if (tmdbResult.status === "fulfilled" && tmdbResult.value) {
            const tmdbCastNameMap = buildTmdbCastNameMap(tmdbResult.value);
            changed = applyPeopleListCastNameTranslations(data, tmdbCastNameMap, cache) || changed;
        } else if (tmdbResult.status === "rejected") {
            $.log(`Trakt media people TMDb translation failed: ${tmdbResult.reason}`);
        }

        if (googleResult.status === "fulfilled") {
            changed = applyPeopleListGoogleNameTranslations(googleTargets, googleResult.value, cache) || changed;
        } else {
            $.log(`Trakt media people Google translation failed: ${googleResult.reason}`);
        }

        if (changed) {
            savePeopleTranslationCache(cache);
        }
        $.done({ body: JSON.stringify(data) });
    } catch (e) {
        $.log(`Trakt media people translation failed: ${e}`);
        $.done({ body: JSON.stringify(data) });
    }
}

function createMediaCollection() {
    const collection = {};
    Object.keys(MEDIA_CONFIG).forEach((mediaType) => {
        collection[mediaType] = [];
    });
    return collection;
}

function collectUniqueRef(target, seen, ref) {
    if (!ref) {
        return;
    }

    const mediaType = ref.mediaType ?? null;
    const key = mediaType ? buildMediaCacheLookupKey(mediaType, ref) : "";
    if (!key) {
        return;
    }

    if (!seen[key]) {
        seen[key] = true;
        target.push(ref);
    }
}

function getItemMediaTarget(item, mediaType) {
    if (mediaType === MEDIA_TYPE.EPISODE) {
        if (item?.episode) {
            return item.episode;
        }

        if (item?.progress?.next_episode) {
            return item.progress.next_episode;
        }

        return null;
    }

    return item?.[mediaType] ?? null;
}

function buildMediaRef(item, mediaType) {
    if (mediaType === MEDIA_TYPE.EPISODE) {
        return buildEpisodeRef(item, getItemMediaTarget(item, mediaType));
    }

    const target = getItemMediaTarget(item, mediaType);
    const traktId = target?.ids?.trakt ?? null;
    if (isNullish(traktId)) {
        return null;
    }

    return {
        mediaType: mediaType,
        traktId: traktId,
        backendLookupKey: String(traktId),
        availableTranslations: isArray(target.available_translations) ? target.available_translations : null
    };
}

function buildEpisodeRef(item, episode) {
    const showId = item?.show?.ids?.trakt ?? null;
    const seasonNumber = episode?.season ?? null;
    const episodeNumber = episode?.number ?? null;

    if (isNullish(showId) || isNullish(seasonNumber) || isNullish(episodeNumber)) {
        return null;
    }

    return {
        mediaType: MEDIA_TYPE.EPISODE,
        showId: showId,
        seasonNumber: seasonNumber,
        episodeNumber: episodeNumber,
        backendLookupKey: buildEpisodeCompositeKey(showId, seasonNumber, episodeNumber),
        availableTranslations: isArray(episode.available_translations) ? episode.available_translations : null
    };
}

function collectMediaRefs(arr) {
    const seenRefsByType = createMediaMap();
    const refsByType = createMediaCollection();

    arr.forEach((item) => {
        Object.keys(MEDIA_CONFIG).forEach((mediaType) => {
            collectUniqueRef(refsByType[mediaType], seenRefsByType[mediaType], buildMediaRef(item, mediaType));
        });
    });

    return refsByType;
}

function applyTranslationsToItems(arr, cache) {
    arr.forEach((item) => {
        Object.keys(MEDIA_CONFIG).forEach((mediaType) => {
            const target = getItemMediaTarget(item, mediaType);
            const ref = buildMediaRef(item, mediaType);
            if (ref) {
                applyTranslation(target, getCachedTranslation(cache, mediaType, ref));
            }
        });
    });
}

async function translateMediaItemsInPlace(arr, logLabel) {
    if (isNotArray(arr) || arr.length === 0) {
        return arr;
    }

    const cache = loadCache();
    const refsByType = collectMediaRefs(arr);

    await hydrateFromBackend(cache, refsByType);

    let remainingDirectTranslationBudget = TRAKT_DIRECT_TRANSLATION_MAX_REFS;
    for (const mediaType of Object.keys(MEDIA_CONFIG)) {
        if (remainingDirectTranslationBudget <= 0) {
            break;
        }

        const missingRefs = getMissingRefs(cache, mediaType, refsByType[mediaType]).slice(0, remainingDirectTranslationBudget);
        remainingDirectTranslationBudget -= missingRefs.length;
        await fetchAndPersistMissing(cache, mediaType, missingRefs, `${logLabel} ${mediaType}`);
    }

    saveCache(cache);
    flushBackendWrites();

    applyTranslationsToItems(arr, cache);
    return arr;
}

async function hydrateFromBackend(cache, refsByType) {
    try {
        const missingRefsByType = createMediaCollection();
        Object.keys(MEDIA_CONFIG).forEach((mediaType) => {
            missingRefsByType[mediaType] = getMissingRefs(cache, mediaType, refsByType[mediaType] ?? []);
        });
        await fetchTranslationsFromBackend(cache, missingRefsByType);
    } catch (e) {
        $.log(`Trakt backend cache read failed: ${e}`);
    }
}

async function fetchAndPersistMissing(cache, mediaType, refs, logLabel) {
    await processInBatches(refs, async (ref) => {
        try {
            const merged = await fetchDirectTranslation(mediaType, ref);
            storeTranslationEntry(cache, mediaType, ref, merged);
            queueBackendWrite(mediaType, ref, merged);
        } catch (e) {
            $.log(`Trakt ${logLabel} translation fetch failed for key=${buildMediaCacheLookupKey(mediaType, ref)}: ${e}`);
        }
    });
}

function resolveDirectMediaTypeFromItem(item) {
    if (!isPlainObject(item) || isNullish(item?.ids?.trakt)) {
        return null;
    }

    // Context7 Trakt docs show show summaries/lists exposing first_aired,
    // network, and aired_episodes, while movie summaries/lists expose
    // released. `tagline` exists on both, so it is only a weak fallback.
    if (
        isNonNullish(item.first_aired) ||
        isNonNullish(item.network) ||
        isPlainObject(item.airs) ||
        isNonNullish(item.aired_episodes)
    ) {
        return MEDIA_TYPE.SHOW;
    }

    if (isNonNullish(item.released)) {
        return MEDIA_TYPE.MOVIE;
    }

    const normalizedStatus = String(item.status ?? "").trim().toLowerCase();
    if (DIRECT_MEDIA_TYPE_SHOW_STATUSES.includes(normalizedStatus)) {
        return MEDIA_TYPE.SHOW;
    }
    if (DIRECT_MEDIA_TYPE_MOVIE_STATUSES.includes(normalizedStatus)) {
        return MEDIA_TYPE.MOVIE;
    }

    if (isNonNullish(item.tagline)) {
        return MEDIA_TYPE.MOVIE;
    }

    return null;
}

function resolveForcedDirectMediaType(arr) {
    if (isNotArray(arr) || arr.length === 0) {
        return null;
    }

    let showCount = 0;
    let movieCount = 0;

    for (let i = 0; i < arr.length; i += 1) {
        const mediaType = resolveDirectMediaTypeFromItem(arr[i]);
        if (mediaType === MEDIA_TYPE.SHOW) {
            showCount += 1;
        } else if (mediaType === MEDIA_TYPE.MOVIE) {
            movieCount += 1;
        }
    }

    if (showCount > 0 && movieCount === 0) {
        return MEDIA_TYPE.SHOW;
    }
    if (movieCount > 0 && showCount === 0) {
        return MEDIA_TYPE.MOVIE;
    }

    return null;
}

function wrapDirectMediaItems(arr, mediaType) {
    if (!mediaType) {
        return null;
    }

    const wrapped = [];
    for (let i = 0; i < arr.length; i += 1) {
        const item = arr[i];
        if (!isPlainObject(item) || isNullish(item?.ids?.trakt)) {
            return null;
        }
        wrapped.push({ [mediaType]: item });
    }

    return wrapped;
}

function unwrapDirectMediaItems(arr, mediaType) {
    if (!mediaType) {
        return arr;
    }

    return arr.map((item) => item?.[mediaType] ?? item);
}

async function processWrappedMediaItems(logLabel, sourceBody) {
    const parsed = JSON.parse(sourceBody);
    if (isNotArray(parsed) || parsed.length === 0) {
        return sourceBody;
    }

    await translateMediaItemsInPlace(parsed, logLabel);
    return JSON.stringify(parsed);
}

async function handleDirectMediaList(logLabel, bodyOverride) {
    const sourceBody = isNonNullish(bodyOverride) ? bodyOverride : body;
    const parsed = JSON.parse(sourceBody);
    if (isNotArray(parsed) || parsed.length === 0) {
        $.done({ body: sourceBody });
        return;
    }

    const directMediaType = resolveForcedDirectMediaType(parsed);
    const wrappedItems = wrapDirectMediaItems(parsed, directMediaType);
    if (!wrappedItems) {
        $.done({ body: sourceBody });
        return;
    }

    await translateMediaItemsInPlace(wrappedItems, logLabel);
    $.done({ body: JSON.stringify(unwrapDirectMediaItems(wrappedItems, directMediaType)) });
}

async function handleWrapperMediaList(logLabel, bodyOverride) {
    const sourceBody = isNonNullish(bodyOverride) ? bodyOverride : body;
    $.done({ body: await processWrappedMediaItems(logLabel, sourceBody) });
}

async function handlePersonMediaCreditsList(logLabel) {
    const data = JSON.parse(body);
    if (!isPlainObject(data)) {
        $.done({});
        return;
    }

    const crewItems = isPlainObject(data.crew)
        ? Object.keys(data.crew).reduce((items, key) => items.concat(ensureArray(data.crew[key])), [])
        : [];
    const items = ensureArray(data.cast).concat(crewItems);

    if (items.length === 0) {
        $.done({});
        return;
    }

    await translateMediaItemsInPlace(items, logLabel);
    $.done({ body: JSON.stringify(data) });
}

async function handleMonthlyReview() {
    const data = JSON.parse(body);
    if (!isPlainObject(data)) {
        $.done({});
        return;
    }

    const firstWatched = data.first_watched;
    if (!firstWatched || typeof firstWatched !== "object") {
        $.done({});
        return;
    }

    if (!firstWatched.show && !firstWatched.movie && !firstWatched.episode) {
        $.done({});
        return;
    }

    const translated = JSON.parse(await processWrappedMediaItems("mir", JSON.stringify([firstWatched])));
    const translatedItem = isArray(translated) ? translated[0] : null;
    if (!translatedItem || typeof translatedItem !== "object") {
        $.done({});
        return;
    }

    Object.keys(MEDIA_CONFIG).forEach((mediaType) => {
        if (firstWatched[mediaType] && translatedItem[mediaType]) {
            firstWatched[mediaType] = translatedItem[mediaType];
        }
    });

    $.done({ body: JSON.stringify(data) });
}

async function handleMediaDetail(mediaType) {
    const data = JSON.parse(body);
    if (!isPlainObject(data)) {
        $.done({});
        return;
    }

    const ref = resolveMediaDetailTarget(requestUrl, data, mediaType);
    if (!ref || !buildMediaCacheLookupKey(mediaType, ref)) {
        $.done({});
        return;
    }

    const linkCache = loadLinkIdsCache();
    if (cacheMediaIdsFromDetailResponse(linkCache, mediaType, ref, data)) {
        saveLinkIdsCache(linkCache);
    }

    const cache = loadCache();
    applyTranslation(data, getCachedTranslation(cache, mediaType, ref));
    $.done({ body: JSON.stringify(data) });
}

async function handlePeopleDetail() {
    const data = JSON.parse(body);
    if (!isPlainObject(data)) {
        $.done({});
        return;
    }

    const personId = resolvePeopleDetailTarget(requestUrl, data);
    if (!personId) {
        $.done({});
        return;
    }

    const cache = loadPeopleTranslationCache();
    const cacheEntry = getPeopleTranslationCacheEntry(cache, personId);
    const nextCacheEntry = {};
    const originalName = String(data.name ?? "").trim();
    const originalBiography = String(data.biography ?? "").trim();
    const cachedName = originalName ? getCachedPersonNameTranslation(cacheEntry, originalName) : "";
    const cachedBiography = originalBiography ? getCachedPersonBiographyTranslation(cacheEntry, originalBiography) : "";

    if (cachedName) {
        data.name = buildPersonNameDisplay(originalName, cachedName);
        nextCacheEntry.name = {
            sourceText: originalName,
            translatedText: cachedName
        };
    }

    if (cachedBiography) {
        data.biography = cachedBiography;
        nextCacheEntry.biography = {
            sourceTextHash: computeStringHash(originalBiography),
            translatedText: cachedBiography
        };
    }

    const namePromise = originalName && !cachedName && isNonNullish(data?.ids?.tmdb)
        ? fetchTmdbPerson(data.ids.tmdb)
        : null;
    const googlePromise = googleTranslationEnabled && (originalName || originalBiography)
        ? translateTextsWithGoogle([originalName, originalBiography], "en")
        : null;

    const [nameResult, googleResult] = await Promise.allSettled([
        namePromise ?? Promise.resolve(null),
        googlePromise ?? Promise.resolve(null)
    ]);

    let hasTranslatedName = !!cachedName;
    if (namePromise) {
        if (nameResult.status === "fulfilled") {
            const translatedName = String(nameResult.value?.name ?? "").trim();
            if (translatedName && containsChineseCharacter(translatedName)) {
                data.name = buildPersonNameDisplay(originalName, translatedName);
                nextCacheEntry.name = {
                    sourceText: originalName,
                    translatedText: translatedName
                };
                hasTranslatedName = true;
            }
        } else {
            $.log(`Trakt people name translation failed for ${personId}: ${nameResult.reason}`);
        }
    }

    if (googlePromise) {
        if (googleResult.status === "fulfilled") {
            const googleTranslations = ensureArray(googleResult.value);
            const translatedName = String(googleTranslations[0] ?? "").trim();
            if (!cachedName && !hasTranslatedName && translatedName && containsChineseCharacter(translatedName)) {
                data.name = buildPersonNameDisplay(originalName, translatedName);
                nextCacheEntry.name = {
                    sourceText: originalName,
                    translatedText: translatedName
                };
                hasTranslatedName = true;
            }

            const translatedBiography = String(googleTranslations[1] ?? "").trim();
            if (!cachedBiography && translatedBiography) {
                data.biography = translatedBiography;
                nextCacheEntry.biography = {
                    sourceTextHash: computeStringHash(originalBiography),
                    translatedText: translatedBiography
                };
            }
        } else {
            $.log(`Trakt people Google translation failed for ${personId}: ${googleResult.reason}`);
        }
    }

    if (Object.keys(nextCacheEntry).length > 0 && setPeopleTranslationCacheEntry(cache, personId, nextCacheEntry)) {
        savePeopleTranslationCache(cache);
    }

    $.done({ body: JSON.stringify(data) });
}

function handleTranslations() {
    const arr = JSON.parse(body);
    if (isNotArray(arr) || arr.length === 0) {
        $.done({});
        return;
    }

    const sorted = sortTranslations(arr, preferredLanguage);
    const merged = normalizeTranslations(sorted);
    const target = resolveTranslationRequestTarget(requestUrl);

    if (!isScriptInitiatedTranslationRequest() && target && buildMediaCacheLookupKey(target.mediaType, target)) {
        const normalized = extractNormalizedTranslation(merged);
        const cache = loadCache();
        const cachedEntry = getCachedTranslation(cache, target.mediaType, target);
        const shouldUpdateCache = !cachedEntry ||
            cachedEntry.status !== normalized.status ||
            !areTranslationsEqual(cachedEntry.translation, normalized.translation);

        if (shouldUpdateCache) {
            storeTranslationEntry(cache, target.mediaType, target, normalized);
            saveCache(cache);
            queueBackendWrite(target.mediaType, target, normalized);
            flushBackendWrites();
        }
    }

    $.done({ body: JSON.stringify(merged) });
}

function handleUserSettings() {
    const data = JSON.parse(body);

    if (!data || typeof data !== "object") {
        $.done({});
        return;
    }

    data.user = ensureObject(data.user);
    data.user.vip = true;

    data.account = ensureObject(data.account);
    data.account.display_ads = false;

    data.browsing = ensureObject(data.browsing);

    data.browsing.watchnow = ensureObject(data.browsing.watchnow);
    const watchnowRegion = resolveWatchnowRegion(data.browsing.watchnow);

    data.browsing.watchnow.favorites = injectWatchnowFavoriteSources(
        data.browsing.watchnow.favorites,
        watchnowRegion
    );

    $.done({ body: JSON.stringify(data) });
}

function handleCurrentSeasonRequest() {
    const target = resolveCurrentSeasonTarget(requestUrl);
    if (!target) {
        $.done({});
        return;
    }

    setCurrentSeason(target.showId, target.seasonNumber);
    $.done({});
}

async function handleSeasonEpisodesList() {
    try {
        const target = resolveSeasonListTarget(requestUrl);
        const seasons = JSON.parse(body);
        if (!target || isNotArray(seasons) || seasons.length === 0) {
            $.done({});
            return;
        }

        const linkCache = loadLinkIdsCache();
        if (cacheEpisodeIdsFromSeasonList(linkCache, target.showId, seasons)) {
            saveLinkIdsCache(linkCache);
        }

        const currentSeasonNumber = getCurrentSeason(target.showId);
        const targetSeason = seasons.find((item) => {
            const episodes = ensureArray(item?.episodes);
            return episodes.some((episode) => {
                return Number(episode?.season) === currentSeasonNumber;
            });
        });

        if (!targetSeason) {
            $.done({});
            return;
        }

        const cache = loadCache();
        const allEpisodeRefs = seasons.flatMap((item) => {
            const seasonEpisodes = ensureArray(item?.episodes);
            return seasonEpisodes.map((episode) => {
                return {
                    mediaType: MEDIA_TYPE.EPISODE,
                    showId: target.showId,
                    seasonNumber: episode?.season ?? null,
                    episodeNumber: episode?.number ?? null,
                    backendLookupKey: buildEpisodeCompositeKey(target.showId, episode?.season ?? null, episode?.number ?? null),
                    availableTranslations: isArray(episode?.available_translations) ? episode.available_translations : null,
                    seasonFirstAired: item?.first_aired ?? null,
                    episodeFirstAired: episode?.first_aired ?? null
                };
            });
        }).filter((ref) => {
            return !!buildMediaCacheLookupKey(MEDIA_TYPE.EPISODE, ref);
        });
        await hydrateFromBackend(cache, {
            show: [],
            movie: [],
            episode: allEpisodeRefs
        });
        const missingEpisodeRefs = getMissingRefs(cache, MEDIA_TYPE.EPISODE, allEpisodeRefs).filter((ref) => {
            return isNonNullish(ref?.seasonFirstAired) && isNonNullish(ref?.episodeFirstAired);
        });
        const prioritizedEpisodeRefs = missingEpisodeRefs
            .map((ref, index) => {
                return {
                    ref,
                    index
                };
            })
            .sort((left, right) => {
                const leftSeason = Number(left.ref?.seasonNumber);
                const rightSeason = Number(right.ref?.seasonNumber);
                const getBucket = (seasonNumber) => {
                    if (seasonNumber === currentSeasonNumber) {
                        return 0;
                    }
                    if (seasonNumber > currentSeasonNumber) {
                        return 1;
                    }
                    return 2;
                };

                const leftBucket = getBucket(leftSeason);
                const rightBucket = getBucket(rightSeason);
                if (leftBucket !== rightBucket) {
                    return leftBucket - rightBucket;
                }

                if (leftBucket === 2 && leftSeason !== rightSeason) {
                    return rightSeason - leftSeason;
                }

                if (leftSeason !== rightSeason) {
                    return leftSeason - rightSeason;
                }

                return left.index - right.index;
            })
            .map((item) => item.ref)
            .slice(0, SEASON_EPISODE_TRANSLATION_LIMIT);
        await fetchAndPersistMissing(
            cache,
            MEDIA_TYPE.EPISODE,
            prioritizedEpisodeRefs,
            "season episode"
        );

        saveCache(cache);
        flushBackendWrites();

        seasons.forEach((season) => {
            const seasonEpisodes = ensureArray(season?.episodes);
            seasonEpisodes.forEach((episode) => {
                const ref = {
                    mediaType: MEDIA_TYPE.EPISODE,
                    showId: target.showId,
                    seasonNumber: episode?.season ?? null,
                    episodeNumber: episode?.number ?? null
                };
                applyTranslation(episode, getCachedTranslation(cache, MEDIA_TYPE.EPISODE, ref));
            });
        });

        $.done({ body: JSON.stringify(seasons) });
    } finally {
        clearCurrentSeason();
    }
}

function isBrowserUserAgent() {
    const userAgent = String(getRequestHeaderValue("user-agent") ?? "").trim();
    if (!userAgent) {
        return false;
    }

    return /(mozilla\/5\.0|applewebkit\/|chrome\/|safari\/|firefox\/|edg\/)/i.test(userAgent);
}

function isRipppleUserAgent() {
    return /^Rippple/i.test(String(getRequestHeaderValue("user-agent") ?? "").trim());
}

function shouldApplyLatestHistoryEpisodeOnly(url) {
    return latestHistoryEpisodeOnly && !isBrowserUserAgent() && isHistoryEpisodesListUrl(url);
}

function isRipppleHistoryListUrl(url) {
    return /^\/users\/[^/]+\/history$/.test(normalizeUrlPath(url));
}

function shouldApplyRipppleHistoryLimit(url) {
    return isRipppleUserAgent() && isRipppleHistoryListUrl(url);
}

function filterHistoryEpisodesAcrossPagesWithPersistence(arr, url) {
    const result = filterHistoryEpisodesAcrossPagesWithCache(arr, url, loadHistoryEpisodeCache());
    if (result && result.cache && result.filtered) {
        saveHistoryEpisodeCache(result.cache);
        return result.filtered;
    }
    return arr;
}

async function getProcessedHistoryEpisodesBody() {
    if (!shouldApplyLatestHistoryEpisodeOnly(requestUrl)) {
        return body;
    }

    try {
        const data = keepLatestHistoryEpisodes(JSON.parse(body));
        return JSON.stringify(filterHistoryEpisodesAcrossPagesWithPersistence(data, requestUrl));
    } catch (e) {
        $.log(`Trakt history episode local merge failed: ${e}`);
        return body;
    }
}

async function handleHistoryEpisodeList() {
    const historyBody = await getProcessedHistoryEpisodesBody();
    await handleWrapperMediaList("history episode", historyBody);
}

function isRequest() {
    return typeof $.response === "undefined";
}

function isResponse() {
    return !isRequest();
}

function handleRequestRoute(url) {
    if (isResponse()) {
        return false;
    }

    let requestPath = "";
    try {
        requestPath = new URL(url).pathname;
    } catch (e) {
        requestPath = "";
    }

    const routes = createRequestPhaseRoutes({
        handleCurrentSeasonRequest,
        handleDirectRedirectRequest,
        requestHost: getUrlHost(url),
        requestPath,
        shouldApplyLatestHistoryEpisodeOnly: () => shouldApplyLatestHistoryEpisodeOnly(url),
        shouldApplyRipppleHistoryLimit: () => shouldApplyRipppleHistoryLimit(url),
        buildHistoryEpisodesRequestUrl: () => buildHistoryEpisodesRequestUrlWithMinimumLimit(url, shouldApplyLatestHistoryEpisodeOnly(url)),
        buildRipppleHistoryRequestUrl: () => buildRipppleHistoryRequestUrlWithMinimumLimit(url, shouldApplyRipppleHistoryLimit(url)),
        scriptContext
    });

    for (let i = 0; i < routes.length; i += 1) {
        const route = routes[i];
        const matched = route.condition();
        if (matched) {
            route.handler();
            return true;
        }
    }

    return false;
}

async function handleResponseRoute(url) {
    if (isRequest()) {
        return false;
    }

    const routes = createResponsePhaseRoutes({
        handleDirectMediaList,
        handleHistoryEpisodeList,
        handleList,
        handleComments,
        handleMediaDetail,
        handleMediaPeopleList,
        handleMonthlyReview: handleMonthlyReview,
        handlePeopleDetail,
        handlePersonMediaCreditsList,
        handleRecentCommentsList,
        handleSeasonEpisodesList,
        handleSentiments,
        handleSofaTimeCountries,
        handleSofaTimeStreamingAvailability,
        handleTmdbProviderCatalog,
        handleTranslations,
        handleUserSettings,
        handleWatchnow,
        handleWatchnowSources,
        handleWrapperMediaList,
        mediaTypes: MEDIA_TYPE
    });

    const routeContext = createResponseRouteContext(url);
    for (let i = 0; i < routes.length; i += 1) {
        const route = routes[i];
        const matched = route.match(routeContext);
        if (matched) {
            await route.handler(matched, routeContext);
            return true;
        }
    }

    return false;
}

(async () => {
    try {
        if (handleRequestRoute(requestUrl)) {
            return;
        }

        if (await handleResponseRoute(requestUrl)) {
            return;
        }

        $.done({});
    } catch (e) {
        $.log(`Trakt script error: ${e}`);
        $.done({});
    }
})();
