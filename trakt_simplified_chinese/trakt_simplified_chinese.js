const $ = new Env("优化Trakt简体中文体验");
const CACHE_KEY = "trakt_zh_cn_cache_v2";
const CURRENT_SEASON_CACHE_KEY = "trakt_current_season";
const HISTORY_EPISODE_CACHE_KEY = "trakt_history_episode_cache";
const LINK_IDS_CACHE_KEY = "trakt_watchnow_ids_cache";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PARTIAL_FOUND_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REQUEST_BATCH_SIZE = 10;
const SEASON_EPISODE_TRANSLATION_LIMIT = 50;
const BACKEND_FETCH_MIN_REFS = 3;
const CACHE_STATUS = {
    FOUND: 1,
    PARTIAL_FOUND: 2,
    NOT_FOUND: 3
};
const MEDIA_TYPE = {
    SHOW: "show",
    MOVIE: "movie",
    EPISODE: "episode"
};
const HISTORY_EPISODES_LIMIT = 500;
const WATCHNOW_DEFAULT_REGION = "hk";
const WATCHNOW_DEFAULT_CURRENCY = "hkd";
const WATCHNOW_REDIRECT_URL = "https://loon-plugins.demojameson.de5.net/api/redirect";
const TMDB_LOGO_TARGET_BASE_URL = "https://raw.githubusercontent.com/DemoJameson/Loon.Plugins/main/trakt_simplified_chinese/images";
const REGION_CODES = [
    "AE", "AD", "AG", "AL", "AO", "AR", "AT", "AU", "AZ", "BA", "BB", "BE", "BG", "BH", "BM", "BO",
    "BR", "BS", "BY", "BZ", "CA", "CH", "CI", "CL", "CO", "CM", "CR", "CU", "CV", "CZ", "CY", "DE",
    "DK", "DO", "DZ", "EC", "EE", "EG", "ES", "FI", "FJ", "FR", "GB", "GF", "GG", "GH", "GI", "GQ",
    "GR", "GT", "HK", "HN", "HR", "HU", "ID", "IE", "IL", "IN", "IQ", "IT", "IS", "JM", "JP", "JO",
    "KE", "KR", "KW", "LB", "LC", "LI", "LT", "LU", "MA", "LV", "LY", "MC", "ME", "MD", "MG", "MK",
    "MT", "ML", "MU", "MX", "MZ", "MY", "NE", "NG", "NL", "NI", "NO", "NZ", "OM", "PA", "PE", "PK",
    "PF", "PL", "PH", "PS", "PT", "PY", "QA", "RO", "RS", "SA", "SC", "SI", "SG", "SE", "SN", "SV",
    "SK", "SM", "TC", "TH", "TD", "TN", "TR", "TT", "TW", "TZ", "UA", "UG", "US", "UY", "VE", "YE",
    "ZA", "ZM", "ZW"
];
const PLAYER_TYPE = {
    EPLAYERX: "eplayerx",
    FORWARD: "forward",
    INFUSE: "infuse"
};
const PLAYER_DEFINITIONS = {
    [PLAYER_TYPE.EPLAYERX]: {
        type: PLAYER_TYPE.EPLAYERX,
        name: "EplayerX",
        homePage: "https://apps.apple.com/cn/app/eplayerx/id6747369377",
        logo: "eplayerx_logo.webp",
        color: "#33c1c0",
        tmdbProviderId: 1,
        tmdbDisplayPriority: 1,
        buildDeeplink: buildEplayerXDeeplink,
        useRedirectLink: true
    },
    [PLAYER_TYPE.FORWARD]: {
        type: PLAYER_TYPE.FORWARD,
        name: "Forward",
        homePage: "https://apps.apple.com/cn/app/forward/id6503940939",
        logo: "forward_logo.webp",
        color: "#000000",
        tmdbProviderId: 2,
        tmdbDisplayPriority: 2,
        buildDeeplink: buildForwardDeeplink,
        useRedirectLink: true
    },
    [PLAYER_TYPE.INFUSE]: {
        type: PLAYER_TYPE.INFUSE,
        name: "Infuse",
        homePage: "https://firecore.com/infuse",
        logo: "infuse_logo.webp",
        color: "#ff8000",
        tmdbProviderId: 3,
        tmdbDisplayPriority: 3,
        buildDeeplink: buildInfuseDeeplink,
        useRedirectLink: false
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

function parseBooleanArgument(value, fallbackValue) {
    if (typeof value === "boolean") {
        return value;
    }

    if (typeof value === "number") {
        return value !== 0;
    }

    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (["true", "1", "yes", "on"].includes(normalized)) {
            return true;
        }
        if (["false", "0", "no", "off"].includes(normalized)) {
            return false;
        }
    }

    return fallbackValue;
}

function createZeroPriorityMap(regionCodes) {
    return ensureArray(regionCodes).reduce((acc, regionCode) => {
        const code = String(regionCode ?? "").trim().toUpperCase();
        if (code) {
            acc[code] = 0;
        }
        return acc;
    }, {});
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
    const config = {
        latestHistoryEpisodeOnly: true,
        backendBaseUrl: "https://loon-plugins.demojameson.de5.net"
    };

    if (typeof $argument === "object" && $argument !== null) {
        config.latestHistoryEpisodeOnly = parseBooleanArgument(
            $argument.latestHistoryEpisodeOnly,
            config.latestHistoryEpisodeOnly
        );
        config.backendBaseUrl = $argument.backendBaseUrl?.trim() || config.backendBaseUrl;
        return config;
    }

    if (typeof $argument === "string") {
        const raw = $argument.replace(/^\[|\]$/g, "").trim();
        if (!raw) {
            return config;
        }

        const parts = raw.split(",").map((item) => item.trim()).filter(Boolean);
        if (parts.length > 0) {
            config.latestHistoryEpisodeOnly = parseBooleanArgument(parts[0], config.latestHistoryEpisodeOnly);
        }
        if (parts.length > 1) {
            config.backendBaseUrl = parts[1] || config.backendBaseUrl;
        }
    }

    return config;
}

const argumentConfig = parseArgumentConfig();
const latestHistoryEpisodeOnly = argumentConfig.latestHistoryEpisodeOnly;
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
const SCRIPT_TRANSLATION_REQUEST_HEADER = "X-Loon-Trakt-Translation-Request";
const SCRIPT_TRANSLATION_REQUEST_VALUE = "script";
const body = typeof $response !== "undefined" && typeof $response.body === "string"
    ? $response.body
    : "";
const requestUrl = $request?.url ?? "";
const traktApiBaseUrl = resolveTraktApiBaseUrl(requestUrl);

const pendingBackendWrites = createMediaMap();

function loadCache() {
    try {
        const cache = ensureObject($.getjson(CACHE_KEY, {}));
        const prunedCache = pruneExpiredCacheEntries(cache);

        if (prunedCache.modified) {
            saveCache(prunedCache.cache);
        }

        return prunedCache.cache;
    } catch (e) {
        $.log(`Trakt cache load failed: ${e}`);
        return {};
    }
}

function resolveTraktApiBaseUrl(url) {
    const normalizedUrl = String(url ?? "");
    const match = normalizedUrl.match(/^(https:\/\/apiz?\.trakt\.tv)(?:\/|$)/i);
    return match ? match[1] : "";
}

function saveCache(cache) {
    try {
        $.setjson(cache, CACHE_KEY);
    } catch (e) {
        $.log(`Trakt cache save failed: ${e}`);
    }
}

function loadHistoryEpisodeCache() {
    try {
        return ensureObject($.getjson(HISTORY_EPISODE_CACHE_KEY, {}));
    } catch (e) {
        $.log(`Trakt history episode cache load failed: ${e}`);
        return {};
    }
}

function saveHistoryEpisodeCache(cache) {
    try {
        $.setjson(cache, HISTORY_EPISODE_CACHE_KEY);
    } catch (e) {
        $.log(`Trakt history episode cache save failed: ${e}`);
    }
}

function loadLinkIdsCache() {
    try {
        return ensureObject($.getjson(LINK_IDS_CACHE_KEY, {}));
    } catch (e) {
        $.log(`Trakt watchnow ids cache load failed: ${e}`);
        return {};
    }
}

function saveLinkIdsCache(cache) {
    try {
        $.setjson(cache, LINK_IDS_CACHE_KEY);
    } catch (e) {
        $.log(`Trakt watchnow ids cache save failed: ${e}`);
    }
}

function setCurrentSeason(showId, seasonNumber) {
    if (isNullish(showId) || isNullish(seasonNumber)) {
        return;
    }

    try {
        $.setjson({
            showId: String(showId),
            seasonNumber: Number(seasonNumber)
        }, CURRENT_SEASON_CACHE_KEY);
    } catch (e) {
        $.log(`Trakt current season cache save failed: ${e}`);
    }
}

function clearCurrentSeason() {
    try {
        $.setdata("", CURRENT_SEASON_CACHE_KEY);
    } catch (e) {
        $.log(`Trakt current season cache save failed: ${e}`);
    }
}

function getCurrentSeason(showId) {
    if (isNullish(showId)) {
        return 1;
    }

    try {
        const cache = $.getjson(CURRENT_SEASON_CACHE_KEY, null);
        if (
            !cache ||
            typeof cache !== "object" ||
            isNullish(cache.showId) ||
            isNullish(cache.seasonNumber) ||
            String(cache.showId) !== String(showId)
        ) {
            return 1;
        }

        return Number.isFinite(Number(cache.seasonNumber)) ? Number(cache.seasonNumber) : 1;
    } catch (e) {
        $.log(`Trakt current season cache load failed: ${e}`);
        return 1;
    }
}

function createCacheEntry(status, translation) {
    const ttl = status === CACHE_STATUS.PARTIAL_FOUND ? PARTIAL_FOUND_CACHE_TTL_MS : CACHE_TTL_MS;
    return {
        status: status,
        translation: translation,
        expiresAt: Date.now() + ttl
    };
}

function createPermanentCacheEntry(status, translation) {
    return {
        status: status,
        translation: translation,
        expiresAt: null
    };
}

function isFresh(entry) {
    return !!(
        entry &&
        (entry.expiresAt === null || (entry.expiresAt && entry.expiresAt > Date.now()))
    );
}

function pruneExpiredCacheEntries(cache) {
    const nextCache = {};
    let modified = false;

    Object.keys(cache).forEach((key) => {
        const entry = cache[key];
        if (isFresh(entry)) {
            nextCache[key] = entry;
        } else {
            modified = true;
        }
    });

    return {
        cache: nextCache,
        modified
    };
}

function getLanguagePreference() {
    const match = preferredLanguage.match(/([a-zA-Z]{2})(?:-([a-zA-Z]{2}))?/);
    return {
        lang: match?.[1]?.toLowerCase() ?? null,
        region: match?.[2]?.toLowerCase() ?? null
    };
}

function sortTranslations(arr) {
    const preference = getLanguagePreference();
    if (!preference.lang) {
        return arr;
    }

    arr.sort((a, b) => {
        const getScore = (item) => {
            const itemLang = item?.language?.toLowerCase() ?? null;
            const itemRegion = item?.country?.toLowerCase() ?? null;

            if (itemLang !== preference.lang) {
                return 0;
            }
            if (preference.region && itemRegion === preference.region) {
                return 2;
            }
            return 1;
        };

        return getScore(b) - getScore(a);
    });

    return arr;
}

function isEmptyTranslationValue(value) {
    return value === undefined || value === null || value === "";
}

function isNullish(value) {
    return value === undefined || value === null;
}

function isNonNullish(value) {
    return !isNullish(value);
}

function isPlainObject(value) {
    return !!(value && typeof value === "object" && !Array.isArray(value));
}

function ensureObject(value, fallbackValue) {
    return isPlainObject(value) ? value : (isPlainObject(fallbackValue) ? fallbackValue : {});
}

function ensureArray(value) {
    return Array.isArray(value) ? value : [];
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

function hasUsefulTranslation(translation) {
    return !!(
        translation &&
        (!isEmptyTranslationValue(translation.title) ||
            !isEmptyTranslationValue(translation.overview) ||
            !isEmptyTranslationValue(translation.tagline))
    );
}

function normalizeTranslationPayload(translation) {
    if (!translation || typeof translation !== "object") {
        return null;
    }

    const normalized = {
        title: translation.title ?? null,
        overview: translation.overview ?? null,
        tagline: translation.tagline ?? null
    };

    return hasUsefulTranslation(normalized) ? normalized : null;
}

function findTranslationByRegion(items, region) {
    return items.find((item) => {
        return String(item?.language ?? "").toLowerCase() === "zh" &&
            String(item?.country ?? "").toLowerCase() === region;
    }) ?? null;
}

function isChineseTranslation(item) {
    return String(item?.language ?? "").toLowerCase() === "zh";
}

function normalizeTranslations(items) {
    if (!Array.isArray(items)) {
        items = [];
    }

    const fallbackRegions = ["sg", "tw", "hk"];
    const fields = ["title", "overview", "tagline"];
    const requiredFoundFields = ["title", "overview"];
    let cnTranslation = findTranslationByRegion(items, "cn");
    const originalCnFound = !!cnTranslation;
    const originalCnComplete = originalCnFound && requiredFoundFields.every((field) => {
        return !isEmptyTranslationValue(cnTranslation[field]);
    });
    const hasAnyChineseTitle = items.some((item) => {
        return isChineseTranslation(item) && !isEmptyTranslationValue(item.title);
    });

    if (!cnTranslation) {
        cnTranslation = {
            language: "zh",
            country: "cn"
        };
        items.unshift(cnTranslation);
    }

    fields.forEach((field) => {
        if (!isEmptyTranslationValue(cnTranslation[field])) {
            return;
        }

        for (let i = 0; i < fallbackRegions.length; i += 1) {
            const fallback = findTranslationByRegion(items, fallbackRegions[i]);
            if (fallback && !isEmptyTranslationValue(fallback[field])) {
                cnTranslation[field] = fallback[field];
                break;
            }
        }
    });

    cnTranslation.status = originalCnComplete
        ? CACHE_STATUS.FOUND
        : hasAnyChineseTitle
            ? CACHE_STATUS.PARTIAL_FOUND
            : CACHE_STATUS.NOT_FOUND;

    return items;
}

function buildRequestHeaders(extraHeaders, useSourceHeaders) {
    const headers = {};
    const sourceHeaders = $request?.headers ?? {};

    if (useSourceHeaders !== false) {
        Object.keys(sourceHeaders).forEach((key) => {
            const lowerKey = key.toLowerCase();
            if (lowerKey === "host" || lowerKey === "content-length" || lowerKey === ":authority") {
                return;
            }
            headers[key] = sourceHeaders[key];
        });
    }

    headers.Accept = "application/json";

    if (isPlainObject(extraHeaders)) {
        Object.keys(extraHeaders).forEach((key) => {
            if (isNonNullish(extraHeaders[key]) && extraHeaders[key] !== "") {
                headers[key] = extraHeaders[key];
            }
        });
    }

    return headers;
}

function fetchJson(url, extraHeaders, useSourceHeaders) {
    return $.http.get({
        url: url,
        headers: buildRequestHeaders(extraHeaders, useSourceHeaders)
    }).then((response) => {
        const statusCode = response?.statusCode || response?.status || 0;
        if (statusCode < 200 || statusCode >= 300) {
            throw new Error(`HTTP ${statusCode} for ${url}`);
        }

        try {
            return JSON.parse(response.body);
        } catch (e) {
            throw new Error(`JSON parse failed for ${url}: ${e}`);
        }
    });
}

function getRequestHeaderValue(headerName) {
    if (!$request?.headers || !headerName) {
        return null;
    }

    const targetName = String(headerName).toLowerCase();
    const headers = $request.headers;
    const matchedKey = Object.keys(headers).find((key) => String(key).toLowerCase() === targetName);
    return matchedKey ? headers[matchedKey] : null;
}

function isScriptInitiatedTranslationRequest() {
    return String(getRequestHeaderValue(SCRIPT_TRANSLATION_REQUEST_HEADER) ?? "").toLowerCase() ===
        SCRIPT_TRANSLATION_REQUEST_VALUE;
}

function postJson(url, payload, extraHeaders, useSourceHeaders) {
    return $.http.post({
        url: url,
        headers: buildRequestHeaders(extraHeaders, useSourceHeaders),
        body: JSON.stringify(payload)
    }).then((response) => {
        const statusCode = response?.statusCode || response?.status || 0;
        if (statusCode < 200 || statusCode >= 300) {
            throw new Error(`HTTP ${statusCode} for ${url}`);
        }

        if (!response.body) {
            return {};
        }

        try {
            return JSON.parse(response.body);
        } catch (e) {
            throw new Error(`JSON parse failed for ${url}: ${e}`);
        }
    });
}

function pickCnTranslation(items) {
    if (!Array.isArray(items) || items.length === 0) {
        return null;
    }

    return items.find((item) => {
        return String(item?.language ?? "").toLowerCase() === "zh" &&
            String(item?.country ?? "").toLowerCase() === "cn";
    }) ?? null;
}

function extractNormalizedTranslation(items) {
    const cnTranslation = pickCnTranslation(items);
    const translation = normalizeTranslationPayload(cnTranslation);

    return {
        status: cnTranslation?.status ?? CACHE_STATUS.NOT_FOUND,
        translation: translation
    };
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

function areTranslationsEqual(left, right) {
    const normalizedLeft = normalizeTranslationPayload(left);
    const normalizedRight = normalizeTranslationPayload(right);

    if (!normalizedLeft && !normalizedRight) {
        return true;
    }

    if (!normalizedLeft || !normalizedRight) {
        return false;
    }

    return normalizedLeft.title === normalizedRight.title &&
        normalizedLeft.overview === normalizedRight.overview &&
        normalizedLeft.tagline === normalizedRight.tagline;
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

    if (status === CACHE_STATUS.FOUND && translation) {
        cache[cacheKey] = createPermanentCacheEntry(CACHE_STATUS.FOUND, translation);
    } else if (status === CACHE_STATUS.PARTIAL_FOUND && translation) {
        cache[cacheKey] = createCacheEntry(CACHE_STATUS.PARTIAL_FOUND, translation);
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
    return Array.isArray(availableTranslations) && availableTranslations.some((language) => {
        return String(language ?? "").toLowerCase() === "zh";
    });
}

function shouldSkipTranslationLookup(ref) {
    const availableTranslations = Array.isArray(ref?.availableTranslations)
        ? ref.availableTranslations
        : null;

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
        return false;
    }

    const totalRefs = Object.keys(MEDIA_CONFIG).reduce((count, mediaType) => {
        const refs = Array.isArray(refsByType?.[mediaType]) ? refsByType[mediaType] : [];
        return count + refs.length;
    }, 0);
    if (totalRefs < BACKEND_FETCH_MIN_REFS) {
        return true;
    }

    const query = [];
    Object.keys(MEDIA_CONFIG).forEach((mediaType) => {
        const refs = Array.isArray(refsByType?.[mediaType]) ? refsByType[mediaType] : [];
        const ids = getBackendFieldIds(refs);
        if (ids.length > 0) {
            query.push(`${getMediaBackendField(mediaType)}=${ids.map((id) => String(id)).join(",")}`);
        }
    });

    if (query.length === 0) {
        return true;
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
    return true;
}

function queueBackendWrite(mediaType, ref, entry) {
    const lookupKey = buildMediaCacheLookupKey(mediaType, ref);
    if (!lookupKey) {
        return;
    }

    pendingBackendWrites[mediaType][lookupKey] = entry;
}

function buildBackendWritePayload() {
    const payload = {};
    Object.keys(pendingBackendWrites).forEach((mediaType) => {
        payload[getMediaBackendField(mediaType)] = pendingBackendWrites[mediaType];
    });
    return payload;
}

function flushBackendWrites() {
    if (!backendBaseUrl) {
        return;
    }

    if (Object.values(pendingBackendWrites).every((entries) => Object.keys(entries).length === 0)) {
        return;
    }

    const url = `${backendBaseUrl}/api/trakt/translations`;
    postJson(url, buildBackendWritePayload(), {
        "Content-Type": "application/json"
    }, false).catch(e => {
        $.log(`Trakt backend cache write failed during flush: ${e}`);
    });

    Object.keys(pendingBackendWrites).forEach((field) => {
        pendingBackendWrites[field] = {};
    });
}

function buildTranslationUrl(mediaType, ref) {
    const path = getMediaConfig(mediaType).buildTranslationPath(ref);
    return path ? `${traktApiBaseUrl}${path}` : "";
}

function resolveTranslationRequestTarget(url) {
    const normalizedUrl = String(url ?? "");
    let match = normalizedUrl.match(/\/shows\/(\d+)\/translations\/zh(?:\?|$)/);
    if (match) {
        return {
            mediaType: MEDIA_TYPE.SHOW,
            traktId: match[1]
        };
    }

    match = normalizedUrl.match(/\/movies\/(\d+)\/translations\/zh(?:\?|$)/);
    if (match) {
        return {
            mediaType: MEDIA_TYPE.MOVIE,
            traktId: match[1]
        };
    }

    match = normalizedUrl.match(/\/shows\/(\d+)\/seasons\/(\d+)\/episodes\/(\d+)\/translations\/zh(?:\?|$)/);
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
        const match = String(url ?? "").match(/\/shows\/(\d+)\/seasons\/(\d+)\/episodes\/(\d+)(?:\?|$)/);
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
    const match = String(url ?? "").match(/\/shows\/(\d+)\/seasons\/(\d+)(?:\/|\?|$)/);
    if (!match) {
        return null;
    }

    return {
        showId: match[1],
        seasonNumber: Number(match[2])
    };
}

function resolveSeasonListTarget(url) {
    const match = String(url ?? "").match(/\/shows\/(\d+)\/seasons(?:\?|$)/);
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

    const translations = normalizeTranslations(await fetchJson(url, {
        [SCRIPT_TRANSLATION_REQUEST_HEADER]: SCRIPT_TRANSLATION_REQUEST_VALUE
    }));
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
    }
    if (entry.translation.overview) {
        target.overview = entry.translation.overview;
    }
    if (entry.translation.tagline) {
        target.tagline = entry.translation.tagline;
    }
}

function cloneObject(value) {
    return isPlainObject(value) ? { ...value } : null;
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
    if (!linkCache || !Array.isArray(seasons)) {
        return false;
    }

    let changed = false;
    const showIds = buildFallbackShowIds(showId, linkCache);

    seasons.forEach((season) => {
        const episodes = Array.isArray(season?.episodes) ? season.episodes : [];
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

function buildWatchnowRedirectLink(deeplink) {
    if (!deeplink) {
        return "";
    }

    return `${WATCHNOW_REDIRECT_URL}?deeplink=${encodeURIComponent(deeplink)}`;
}

function doneRedirect(location) {
    const targetLocation = String(location ?? "").trim();
    if (!targetLocation) {
        $.done({});
        return;
    }

    if ($.isQuanX()) {
        $done({
            status: "HTTP/1.1 302 Found",
            headers: {
                Location: targetLocation
            }
        });
        return;
    }

    $done({
        response: {
            status: 302,
            headers: {
                Location: targetLocation
            }
        }
    });
}

function resolveDirectRedirectLocation(url) {
    const normalizedUrl = String(url ?? "");
    let match = normalizedUrl.match(/^https:\/\/loon-plugins\.demojameson\.de5\.net\/api\/redirect\?deeplink=([^&]+)(?:&.*)?$/i);
    if (match?.[1]) {
        return decodeURIComponent(match[1]);
    }

    match = normalizedUrl.match(/^https:\/\/image\.tmdb\.org\/t\/p\/w342\/([a-z0-9_-]+)_logo\.webp(?:\?.*)?$/i);
    if (match?.[1]) {
        return `${TMDB_LOGO_TARGET_BASE_URL}/${match[1].toLowerCase()}_logo.webp`;
    }

    return "";
}

function handleDirectRedirectRequest() {
    doneRedirect(resolveDirectRedirectLocation(requestUrl));
}

function isSofaTimeRequest() {
    return /^Sofa(?:\s|%20)Time/i.test(String(getRequestHeaderValue("User-Agent") ?? "").trim());
}

function resolveStreamingAvailabilityTarget(url) {
    const normalizedUrl = String(url ?? "");
    let match = normalizedUrl.match(/^https:\/\/streaming-availability\.p\.rapidapi\.com\/shows\/(tt\d+)(?:\?|$)/i);
    if (match) {
        return {
            mediaType: MEDIA_TYPE.SHOW,
            imdbId: match[1]
        };
    }

    match = normalizedUrl.match(/^https:\/\/streaming-availability\.p\.rapidapi\.com\/movies\/(tt\d+)(?:\?|$)/i);
    if (match) {
        return {
            mediaType: MEDIA_TYPE.MOVIE,
            imdbId: match[1]
        };
    }

    return null;
}

function isStreamingAvailabilityCountriesRequest(url) {
    return /^https:\/\/streaming-availability\.p\.rapidapi\.com\/countries\/[a-z]{2}(?:\?.*)?$/i.test(String(url ?? ""));
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
    const link = definition.useRedirectLink ? buildWatchnowRedirectLink(deeplink) : deeplink;

    if (!deeplink || !link) {
        return null;
    }

    const option = createSofaTimeTemplate(definition);
    option.link = link;
    option.videoLink = link;
    return option;
}

function injectSofaTimeStreamingOptions(payload, target) {
    if (!isPlainObject(payload)) {
        return payload;
    }

    const streamingTarget = resolveStreamingAvailabilityTmdbTarget(payload, target);

    rewriteStreamingOptionsMap(payload, streamingTarget);

    const seasons = Array.isArray(payload.seasons) ? payload.seasons : [];
    seasons.forEach((season) => {
        if (!isPlainObject(season)) {
            return;
        }

        rewriteStreamingOptionsMap(season, streamingTarget);

        const episodes = Array.isArray(season.episodes) ? season.episodes : [];
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
    return Object.values(PLAYER_TYPE).map((source) => createSofaTimeStreamingOption(source, target)).filter(Boolean);
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

function handleSofaTimeStreamingAvailability() {
    if (typeof $response === "undefined" || !isSofaTimeRequest()) {
        $.done({ body: body });
        return;
    }

    const target = resolveStreamingAvailabilityTarget(requestUrl);
    if (!target) {
        $.done({ body: body });
        return;
    }

    const payload = JSON.parse(body);
    $.done({ body: JSON.stringify(injectSofaTimeStreamingOptions(payload, target)) });
}

function injectSofaTimeCountryServices(payload) {
    if (!isPlainObject(payload)) {
        return payload;
    }

    const services = Array.isArray(payload.services) ? payload.services.slice() : [];
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
    if (typeof $response === "undefined" || !isSofaTimeRequest()) {
        $.done({ body: body });
        return;
    }

    if (!isStreamingAvailabilityCountriesRequest(requestUrl)) {
        $.done({ body: body });
        return;
    }

    const payload = JSON.parse(body);
    $.done({ body: JSON.stringify(injectSofaTimeCountryServices(payload)) });
}

function injectTmdbProviderCatalog(payload) {
    if (!isPlainObject(payload)) {
        return payload;
    }

    const results = Array.isArray(payload.results) ? payload.results.slice() : [];
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
    if (typeof $response === "undefined" || !isSofaTimeRequest()) {
        $.done({ body: body });
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

function buildWatchnowFavoriteSource(source) {
    return `${WATCHNOW_DEFAULT_REGION}-${source}`;
}

function injectWatchnowFavoriteSources(items) {
    const favorites = ensureArray(items).slice();
    const filtered = favorites.filter((item) => {
        const normalized = String(item ?? "").toLowerCase();
        return !Object.values(PLAYER_TYPE).some((source) => normalized === buildWatchnowFavoriteSource(source));
    });

    Object.values(PLAYER_TYPE).slice().reverse().forEach((source) => {
        filtered.unshift(buildWatchnowFavoriteSource(source));
    });
    return filtered;
}

function filterOutCustomSources(items) {
    return ensureArray(items).filter((item) => {
        const source = item?.source ? String(item.source).toLowerCase() : "";
        return !Object.values(PLAYER_TYPE).includes(source);
    });
}

function injectCustomSourcesIntoList(items) {
    return Object.values(PLAYER_TYPE).slice().reverse().map((source) => {
        const definition = PLAYER_DEFINITIONS[source];
        return createSourceDefinition(definition.type, definition.name, definition.color);
    }).concat(filterOutCustomSources(items));
}

function ensureWatchnowSourcesDefaultRegion(payload) {
    if (!Array.isArray(payload)) {
        return payload;
    }

    const hasDefaultRegion = payload.some((item) => {
        return isPlainObject(item) && Array.isArray(item[WATCHNOW_DEFAULT_REGION]);
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

    if (Array.isArray(payload)) {
        payload.forEach((item) => {
            if (!isPlainObject(item)) {
                return;
            }

            Object.keys(item).forEach((regionCode) => {
                if (!Array.isArray(item[regionCode])) {
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
        if (!Array.isArray(payload[regionCode])) {
            return;
        }

        payload[regionCode] = injectCustomSourcesIntoList(payload[regionCode]);
    });

    return payload;
}

function resolveWatchnowTarget(url) {
    const normalizedUrl = String(url ?? "");
    let match = normalizedUrl.match(/\/movies\/(\d+)\/watchnow(?:\?|$)/);
    if (match) {
        return {
            mediaType: MEDIA_TYPE.MOVIE,
            traktId: match[1]
        };
    }

    match = normalizedUrl.match(/\/shows\/(\d+)\/watchnow(?:\?|$)/);
    if (match) {
        return {
            mediaType: MEDIA_TYPE.SHOW,
            traktId: match[1]
        };
    }

    match = normalizedUrl.match(/\/episodes\/(\d+)\/watchnow(?:\?|$)/);
    if (match) {
        return {
            mediaType: MEDIA_TYPE.EPISODE,
            traktId: match[1]
        };
    }

    return null;
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

function buildCustomWatchnowEntries(target, context) {
    if (!target || !context) {
        return [];
    }

    return Object.values(PLAYER_TYPE).map((source) => {
        const definition = PLAYER_DEFINITIONS[source];
        if (!definition || typeof definition.buildDeeplink !== "function") {
            return null;
        }

        const deeplink = definition.buildDeeplink(target, context);
        if (!deeplink) {
            return null;
        }

        const link = buildWatchnowRedirectLink(deeplink);
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

function ensureWatchnowDefaultRegion(payload) {
    if (!isPlainObject(payload)) {
        return payload;
    }

    if (!isPlainObject(payload[WATCHNOW_DEFAULT_REGION])) {
        payload[WATCHNOW_DEFAULT_REGION] = {};
    }

    return payload;
}

function injectCustomWatchnowEntriesIntoPayload(payload, customEntries) {
    if (!Array.isArray(customEntries) || customEntries.length === 0) {
        return payload;
    }

    payload = ensureWatchnowDefaultRegion(payload);

    if (!isPlainObject(payload)) {
        return payload;
    }

    Object.keys(payload).forEach((regionCode) => {
        payload[regionCode] = injectCustomWatchnowEntriesIntoRegion(payload[regionCode], customEntries);
    });

    return payload;
}

function handleWatchnowSources() {
    const payload = JSON.parse(body);
    $.done({ body: JSON.stringify(injectCustomSourcesIntoPayload(payload)) });
}

async function handleWatchnow() {
    const payload = JSON.parse(body);
    const target = resolveWatchnowTarget(requestUrl);

    if (!target) {
        $.done({ body: body });
        return;
    }

    const linkCache = loadLinkIdsCache();
    const context = await resolveWatchnowContext(target, linkCache);
    const customEntries = buildCustomWatchnowEntries(target, context);
    $.done({ body: JSON.stringify(injectCustomWatchnowEntriesIntoPayload(payload, customEntries)) });
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
        availableTranslations: Array.isArray(target.available_translations) ? target.available_translations : null
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
        availableTranslations: Array.isArray(episode.available_translations) ? episode.available_translations : null
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
    await processInBatches(getMissingRefs(cache, mediaType, refs), async (ref) => {
        try {
            const merged = await fetchDirectTranslation(mediaType, ref);
            storeTranslationEntry(cache, mediaType, ref, merged);
            queueBackendWrite(mediaType, ref, merged);
        } catch (e) {
            $.log(`Trakt ${logLabel} translation fetch failed for key=${buildMediaCacheLookupKey(mediaType, ref)}: ${e}`);
        }
    });
}

async function processMediaList(logLabel, sourceBody) {
    const arr = JSON.parse(sourceBody);
    if (!Array.isArray(arr) || arr.length === 0) {
        return sourceBody;
    }

    const cache = loadCache();
    const refsByType = collectMediaRefs(arr);

    await hydrateFromBackend(cache, refsByType);

    for (const mediaType of Object.keys(MEDIA_CONFIG)) {
        await fetchAndPersistMissing(cache, mediaType, refsByType[mediaType], `${logLabel} ${mediaType}`);
    }

    saveCache(cache);
    flushBackendWrites();

    applyTranslationsToItems(arr, cache);
    return JSON.stringify(arr);
}

async function handleMediaList(logLabel, bodyOverride) {
    const sourceBody = isNonNullish(bodyOverride) ? bodyOverride : body;
    $.done({ body: await processMediaList(logLabel, sourceBody) });
}

async function handleMir() {
    const data = JSON.parse(body);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        $.done({ body: body });
        return;
    }

    const firstWatched = data.first_watched;
    if (!firstWatched || typeof firstWatched !== "object") {
        $.done({ body: body });
        return;
    }

    if (!firstWatched.show && !firstWatched.movie && !firstWatched.episode) {
        $.done({ body: body });
        return;
    }

    const translated = JSON.parse(await processMediaList("mir", JSON.stringify([firstWatched])));
    const translatedItem = Array.isArray(translated) ? translated[0] : null;
    if (!translatedItem || typeof translatedItem !== "object") {
        $.done({ body: body });
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
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        $.done({ body: body });
        return;
    }

    const ref = resolveMediaDetailTarget(requestUrl, data, mediaType);
    if (!ref || !buildMediaCacheLookupKey(mediaType, ref)) {
        $.done({ body: body });
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

function handleTranslations() {
    const arr = JSON.parse(body);
    if (!Array.isArray(arr) || arr.length === 0) {
        $.done({ body: body });
        return;
    }

    const sorted = sortTranslations(arr);
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
        $.done({ body: body });
        return;
    }

    data.user = ensureObject(data.user);
    data.user.vip = true;

    data.account = ensureObject(data.account);
    data.account.display_ads = false;

    data.browsing = ensureObject(data.browsing);

    data.browsing.watchnow = ensureObject(data.browsing.watchnow);

    data.browsing.watchnow.favorites = injectWatchnowFavoriteSources(data.browsing.watchnow.favorites);

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
        if (!target || !Array.isArray(seasons) || seasons.length === 0) {
            $.done({ body: body });
            return;
        }

        const linkCache = loadLinkIdsCache();
        if (cacheEpisodeIdsFromSeasonList(linkCache, target.showId, seasons)) {
            saveLinkIdsCache(linkCache);
        }

        const currentSeasonNumber = getCurrentSeason(target.showId);
        const targetSeason = seasons.find((item) => {
            const episodes = Array.isArray(item?.episodes) ? item.episodes : [];
            return episodes.some((episode) => {
                return Number(episode?.season) === currentSeasonNumber;
            });
        });

        if (!targetSeason) {
            $.done({ body: body });
            return;
        }

        const cache = loadCache();
        const allEpisodeRefs = seasons.flatMap((item) => {
            const seasonEpisodes = Array.isArray(item?.episodes) ? item.episodes : [];
            return seasonEpisodes.map((episode) => {
                return {
                    mediaType: MEDIA_TYPE.EPISODE,
                    showId: target.showId,
                    seasonNumber: episode?.season ?? null,
                    episodeNumber: episode?.number ?? null,
                    backendLookupKey: buildEpisodeCompositeKey(target.showId, episode?.season ?? null, episode?.number ?? null),
                    availableTranslations: Array.isArray(episode?.available_translations) ? episode.available_translations : null,
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
            const seasonEpisodes = Array.isArray(season?.episodes) ? season.episodes : [];
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

function buildHistoryEpisodesRequestUrl(url) {
    if (!shouldApplyLatestHistoryEpisodeOnly(url)) {
        return url;
    }

    const match = String(url ?? "").match(/^([^?]+)(\?.*)?$/);
    if (!match) {
        return url;
    }

    const path = match[1];
    const query = match[2] ?? "";
    const params = {};
    const queryWithoutPrefix = query.replace(/^\?/, "");

    if (queryWithoutPrefix) {
        queryWithoutPrefix.split("&").forEach((part) => {
            if (!part) {
                return;
            }

            const pieces = part.split("=");
            const key = decodeURIComponent(pieces[0] ?? "");
            if (!key) {
                return;
            }

            const value = pieces.length > 1 ? decodeURIComponent(pieces.slice(1).join("=")) : "";
            params[key] = value;
        });
    }

    params.limit = String(HISTORY_EPISODES_LIMIT);

    const nextQuery = Object.keys(params).map((key) => {
        return `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`;
    }).join("&");

    return `${path}${nextQuery ? `?${nextQuery}` : ""}`;
}

function isHistoryEpisodesListUrl(url) {
    return /\/(?:users\/[^\/]+?\/history\/episodes|sync\/history\/episodes)\/?(?:\?|$)/.test(String(url ?? ""));
}

function shouldApplyLatestHistoryEpisodeOnly(url) {
    return latestHistoryEpisodeOnly && isHistoryEpisodesListUrl(url);
}

function parseUrlParts(url) {
    const match = String(url ?? "").match(/^([^?]+)(?:\?(.*))?$/);
    return {
        path: match?.[1] ?? "",
        query: match?.[2] ?? ""
    };
}

function parseQueryParams(query) {
    const params = {};

    String(query ?? "").split("&").forEach((part) => {
        if (!part) {
            return;
        }

        const pieces = part.split("=");
        const key = decodeURIComponent(pieces[0] ?? "");
        if (!key) {
            return;
        }

        params[key] = pieces.length > 1 ? decodeURIComponent(pieces.slice(1).join("=")) : "";
    });

    return params;
}

function getHistoryEpisodesCacheBucketKey(url) {
    const parts = parseUrlParts(url);
    const params = parseQueryParams(parts.query);
    delete params.page;
    delete params.limit;

    const query = Object.keys(params).sort().map((key) => {
        return `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`;
    }).join("&");

    return `${parts.path}${query ? `?${query}` : ""}`;
}

function getHistoryEpisodesPageNumber(url) {
    const params = parseQueryParams(parseUrlParts(url).query);
    const page = Number(params.page);
    return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function getHistoryEpisodeShowKey(item) {
    const showId = item?.show?.ids?.trakt ?? null;
    return isNonNullish(showId) ? String(showId) : "";
}

function getHistoryEpisodeSortKey(item) {
    const episode = item?.episode ?? null;
    const season = Number.isFinite(Number(episode?.season)) ? Number(episode.season) : -1;
    const number = Number.isFinite(Number(episode?.number)) ? Number(episode.number) : -1;
    return {
        season: season,
        number: number
    };
}

function createHistoryEpisodeCacheSnapshot(item) {
    const showId = getHistoryEpisodeShowKey(item);
    const sortKey = getHistoryEpisodeSortKey(item);

    return {
        id: item && item.id ? Number(item.id) : 0,
        watched_at: item?.watched_at ?? null,
        listed_at: item?.listed_at ?? null,
        show: {
            ids: {
                trakt: showId ?? null
            }
        },
        episode: {
            season: sortKey.season,
            number: sortKey.number
        }
    };
}

function filterHistoryEpisodesAcrossPages(arr, url) {
    if (!Array.isArray(arr) || arr.length === 0 || !isHistoryEpisodesListUrl(url)) {
        return arr;
    }

    const cache = loadHistoryEpisodeCache();
    const bucketKey = getHistoryEpisodesCacheBucketKey(url);
    const pageNumber = getHistoryEpisodesPageNumber(url);
    if (pageNumber === 1) {
        delete cache[bucketKey];
    }

    const bucket = ensureObject(cache[bucketKey], { shows: {} });
    const cachedShows = ensureObject(bucket.shows);

    const filtered = arr.filter((item) => {
        const showKey = getHistoryEpisodeShowKey(item);
        if (!showKey) {
            return true;
        }

        if (pageNumber > 1) {
            return !cachedShows[showKey];
        }

        return true;
    });

    filtered.forEach((item) => {
        const showKey = getHistoryEpisodeShowKey(item);
        if (!showKey) {
            return;
        }

        const snapshot = createHistoryEpisodeCacheSnapshot(item);
        if (!cachedShows[showKey]) {
            cachedShows[showKey] = snapshot;
        }
    });

    bucket.shows = cachedShows;
    cache[bucketKey] = bucket;
    saveHistoryEpisodeCache(cache);

    return filtered;
}

function keepLatestHistoryEpisodes(arr) {
    if (!Array.isArray(arr) || arr.length === 0) {
        return Array.isArray(arr) ? arr : [];
    }

    const latestByShow = {};

    arr.forEach((item) => {
        const key = getHistoryEpisodeShowKey(item);
        if (!key) {
            return;
        }

        const current = latestByShow[key];
        if (!current) {
            latestByShow[key] = item;
            return;
        }

        const itemSortKey = getHistoryEpisodeSortKey(item);
        const currentSortKey = getHistoryEpisodeSortKey(current);
        if (itemSortKey.season > currentSortKey.season) {
            latestByShow[key] = item;
            return;
        }

        if (itemSortKey.season === currentSortKey.season && itemSortKey.number > currentSortKey.number) {
            latestByShow[key] = item;
            return;
        }

        if (itemSortKey.season === currentSortKey.season && itemSortKey.number === currentSortKey.number) {
            const itemTimestamp = Date.parse((item && item.watched_at) || (item && item.listed_at) || "");
            const currentTimestamp = Date.parse((current && current.watched_at) || (current && current.listed_at) || "");
            if (Number.isFinite(itemTimestamp) && Number.isFinite(currentTimestamp) && itemTimestamp > currentTimestamp) {
                latestByShow[key] = item;
                return;
            }

            const itemHistoryId = item && item.id ? item.id : 0;
            const currentHistoryId = current && current.id ? current.id : 0;
            if (itemHistoryId > currentHistoryId) {
                latestByShow[key] = item;
            }
        }
    });

    return arr.filter((item) => {
        const key = getHistoryEpisodeShowKey(item);
        return key ? latestByShow[key] === item : true;
    });
}

async function getProcessedHistoryEpisodesBody() {
    if (!shouldApplyLatestHistoryEpisodeOnly(requestUrl)) {
        return body;
    }

    try {
        const data = keepLatestHistoryEpisodes(JSON.parse(body));
        return JSON.stringify(filterHistoryEpisodesAcrossPages(data, requestUrl));
    } catch (e) {
        $.log(`Trakt history episode local merge failed: ${e}`);
        return body;
    }
}

async function handleHistoryEpisodeList() {
    const historyBody = await getProcessedHistoryEpisodesBody();
    await handleMediaList("history episode", historyBody);
}

(async () => {
    try {
        if (
            typeof $response === "undefined" &&
            (
                /^https:\/\/loon-plugins\.demojameson\.de5\.net\/api\/redirect\?/i.test(requestUrl) ||
                /^https:\/\/image\.tmdb\.org\/t\/p\/w342\/[a-z0-9_-]+_logo\.webp(?:\?.*)?$/i.test(requestUrl)
            )
        ) {
            handleDirectRedirectRequest();
            return;
        }

        if (
            typeof $response === "undefined" &&
            /\/shows\/[^\/]+\/seasons\/\d+(?:\/|\?|$)/.test(requestUrl)
        ) {
            handleCurrentSeasonRequest();
            return;
        }

        if (
            typeof $response === "undefined" &&
            shouldApplyLatestHistoryEpisodeOnly(requestUrl)
        ) {
            $.done({ url: buildHistoryEpisodesRequestUrl(requestUrl) });
            return;
        }

        if (/\/users\/settings(?:\?|$)/.test(requestUrl)) {
            handleUserSettings();
            return;
        }

        if (/\/sync\/progress\/up_next_nitro(?:\?|$)/.test(requestUrl)) {
            await handleMediaList("up_next");
            return;
        }

        if (/\/sync\/playback\/movies(?:\?|$)/.test(requestUrl)) {
            await handleMediaList("playback");
            return;
        }

        if (/\/users\/me\/watchlist\/shows\/released\/desc(?:\?|$)/.test(requestUrl)) {
            await handleMediaList("watchlist show");
            return;
        }

        if (/\/users\/me\/watchlist\/movies\/released\/desc(?:\?|$)/.test(requestUrl)) {
            await handleMediaList("watchlist movie");
            return;
        }

        if (/\/calendars\/my\/shows\/\d{4}-\d{2}-\d{2}\/\d+(?:\?|$)/.test(requestUrl)) {
            await handleMediaList("calendar show");
            return;
        }

        if (/\/calendars\/my\/movies\/\d{4}-\d{2}-\d{2}\/\d+(?:\?|$)/.test(requestUrl)) {
            await handleMediaList("calendar movie");
            return;
        }

        if (/\/users\/[^\/]+?\/history\/episodes(?:\/\d+)?\/?(?:\?|$)/.test(requestUrl)) {
            await handleHistoryEpisodeList();
            return;
        }

        if (/\/users\/[^\/]+?\/history\/movies\/?(?:\?|$)/.test(requestUrl)) {
            await handleMediaList("history movie");
            return;
        }

        if (/\/sync\/history\/episodes\/?(?:\?|$)/.test(requestUrl)) {
            await handleHistoryEpisodeList();
            return;
        }

        if (/\/sync\/history(?:\/(?:movies|shows|episodes))?\/?(?:\?.*)?$/.test(requestUrl)) {
            await handleMediaList("sync history");
            return;
        }

        if (/\/users\/[^\/]+?\/history\/?(?:\?|$)/.test(requestUrl)) {
            await handleMediaList("history");
            return;
        }

        if (/\/users\/[^\/]+?\/collection\/media(?:\?|$)/.test(requestUrl)) {
            await handleMediaList("collection media");
            return;
        }

        if (/\/users\/[^\/]+?\/mir(?:\?|$)/.test(requestUrl)) {
            await handleMir();
            return;
        }

        if (/\/users\/me\/following\/activities(?:\?|$)/.test(requestUrl)) {
            await handleMediaList("following activities");
            return;
        }

        if (/\/users\/[^\/]+?\/lists\/\d+\/items(?:\/(?:show|movie|episode)s?)?(?:\?|$)/.test(requestUrl)) {
            await handleMediaList("list items");
            return;
        }

        if (/\/lists\/\d+\/items(?:\/(?:show|movie|episode)s?)?(?:\?|$)/.test(requestUrl)) {
            await handleMediaList("public list items");
            return;
        }

        if (/\/users\/[^\/]+?\/favorites(?:\/(?:shows|movies))?\/?(?:\?.*)?$/.test(requestUrl)) {
            await handleMediaList("favorites");
            return;
        }

        if (/\/media\/trending(?:\?|$)/.test(requestUrl)) {
            await handleMediaList("media trending");
            return;
        }

        if (/\/media\/recommendations(?:\?|$)/.test(requestUrl)) {
            await handleMediaList("media recommendations");
            return;
        }

        if (/\/media\/anticipated(?:\?|$)/.test(requestUrl)) {
            await handleMediaList("media anticipated");
            return;
        }

        if (/\/media\/popular\/next(?:\?|$)/.test(requestUrl)) {
            await handleMediaList("media popular next");
            return;
        }

        if (/\/users\/me\/watchlist(?:\?|$)/.test(requestUrl)) {
            await handleMediaList("watchlist");
            return;
        }

        if (/\/users\/me\/watchlist\/shows(?:\?|$)/.test(requestUrl)) {
            await handleMediaList("watchlist show");
            return;
        }

        if (/\/users\/me\/watchlist\/movies(?:\?|$)/.test(requestUrl)) {
            await handleMediaList("watchlist movie");
            return;
        }

        if (/^https:\/\/api\.(?:themoviedb|tmdb)\.org\/3\/watch\/providers\/(?:movie|tv)(?:\?.*)?$/i.test(String(requestUrl ?? ""))) {
            handleTmdbProviderCatalog();
            return;
        }

        if (/^https:\/\/streaming-availability\.p\.rapidapi\.com\/shows\/tt\d+(?:\?.*)?$/i.test(requestUrl)) {
            handleSofaTimeStreamingAvailability();
            return;
        }

        if (isStreamingAvailabilityCountriesRequest(requestUrl)) {
            handleSofaTimeCountries();
            return;
        }

        if (/\/watchnow\/sources(?:\?|$)/.test(requestUrl)) {
            handleWatchnowSources();
            return;
        }

        if (/\/(?:movies|shows|episodes)\/\d+\/watchnow(?:\?.*)?$/.test(requestUrl)) {
            await handleWatchnow();
            return;
        }

        if (/\/shows\/[^\/]+\/seasons(?:\?.*)?$/.test(requestUrl)) {
            await handleSeasonEpisodesList();
            return;
        }

        if (/\/shows\/[^\/]+(?:\?.*)?$/.test(requestUrl)) {
            await handleMediaDetail(MEDIA_TYPE.SHOW);
            return;
        }

        if (/\/movies\/[^\/]+(?:\?.*)?$/.test(requestUrl)) {
            await handleMediaDetail(MEDIA_TYPE.MOVIE);
            return;
        }

        if (/\/shows\/[^\/]+\/seasons\/\d+\/episodes\/\d+(?:\?.*)?$/.test(requestUrl)) {
            await handleMediaDetail(MEDIA_TYPE.EPISODE);
            return;
        }

        if (/\/translations\/zh(?:\?|$)/.test(requestUrl)) {
            handleTranslations();
            return;
        }

        $done({ body: body });
    } catch (e) {
        $.log(`Trakt script error: ${e}`);
        $.done({});
    }
})();

function Env(e,t){class s{constructor(e){this.env=e}send(e,t="GET"){e="string"==typeof e?{url:e}:e;let s=this.get;"POST"===t&&(s=this.post);const i=new Promise((t,i)=>{s.call(this,e,(e,s,o)=>{e?i(e):t(s)})});return e.timeout?((e,t=1e3)=>Promise.race([e,new Promise((e,s)=>{setTimeout(()=>{s(new Error("请求超时"))},t)})]))(i,e.timeout):i}get(e){return this.send.call(this.env,e)}post(e){return this.send.call(this.env,e,"POST")}}return new class{constructor(e,t){this.logLevels={debug:0,info:1,warn:2,error:3},this.logLevelPrefixs={debug:"[DEBUG] ",info:"[INFO] ",warn:"[WARN] ",error:"[ERROR] "},this.logLevel="info",this.name=e,this.http=new s(this),this.data=null,this.dataFile="box.dat",this.logs=[],this.isMute=!1,this.isNeedRewrite=!1,this.logSeparator="\n",this.encoding="utf-8",this.startTime=(new Date).getTime(),Object.assign(this,t),this.log("",`🔔${this.name}, 开始!`)}getEnv(){return"undefined"!=typeof Egern?"Egern":"undefined"!=typeof $environment&&$environment["surge-version"]?"Surge":"undefined"!=typeof $environment&&$environment["stash-version"]?"Stash":"undefined"!=typeof module&&module.exports?"Node.js":"undefined"!=typeof $task?"Quantumult X":"undefined"!=typeof $loon?"Loon":"undefined"!=typeof $rocket?"Shadowrocket":void 0}isNode(){return"Node.js"===this.getEnv()}isQuanX(){return"Quantumult X"===this.getEnv()}isSurge(){return"Surge"===this.getEnv()}isLoon(){return"Loon"===this.getEnv()}isShadowrocket(){return"Shadowrocket"===this.getEnv()}isStash(){return"Stash"===this.getEnv()}isEgern(){return"Egern"===this.getEnv()}toObj(e,t=null){try{return JSON.parse(e)}catch{return t}}toStr(e,t=null,...s){try{return JSON.stringify(e,...s)}catch{return t}}getjson(e,t){let s=t;if(this.getdata(e))try{s=JSON.parse(this.getdata(e))}catch{}return s}setjson(e,t){try{return this.setdata(JSON.stringify(e),t)}catch{return!1}}getScript(e){return new Promise(t=>{this.get({url:e},(e,s,i)=>t(i))})}runScript(e,t){return new Promise(s=>{let i=this.getdata("@chavy_boxjs_userCfgs.httpapi");i=i?i.replace(/\n/g,"").trim():i;let o=this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout");o=o?1*o:20,o=t&&t.timeout?t.timeout:o;const[r,a]=i.split("@"),n={url:`http://${a}/v1/scripting/evaluate`,body:{script_text:e,mock_type:"cron",timeout:o},headers:{"X-Key":r,Accept:"*/*"},policy:"DIRECT",timeout:o};this.post(n,(e,t,i)=>s(i))}).catch(e=>this.logErr(e))}loaddata(){if(!this.isNode())return{};{this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const e=this.path.resolve(this.dataFile),t=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(e),i=!s&&this.fs.existsSync(t);if(!s&&!i)return{};{const i=s?e:t;try{return JSON.parse(this.fs.readFileSync(i))}catch(e){return{}}}}}writedata(){if(this.isNode()){this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const e=this.path.resolve(this.dataFile),t=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(e),i=!s&&this.fs.existsSync(t),o=JSON.stringify(this.data);s?this.fs.writeFileSync(e,o):i?this.fs.writeFileSync(t,o):this.fs.writeFileSync(e,o)}}lodash_get(e,t,s=void 0){const i=t.replace(/\[(\d+)\]/g,".$1").split(".");let o=e;for(const e of i)if(o=Object(o)[e],void 0===o)return s;return o}lodash_set(e,t,s){return Object(e)!==e||(Array.isArray(t)||(t=t.toString().match(/[^.[\]]+/g)||[]),t.slice(0,-1).reduce((e,s,i)=>Object(e[s])===e[s]?e[s]:e[s]=(Math.abs(t[i+1])|0)===+t[i+1]?[]:{},e)[t[t.length-1]]=s),e}getdata(e){let t=this.getval(e);if(/^@/.test(e)){const[,s,i]=/^@(.*?)\.(.*?)$/.exec(e),o=s?this.getval(s):"";if(o)try{const e=JSON.parse(o);t=e?this.lodash_get(e,i,""):t}catch(e){t=""}}return t}setdata(e,t){let s=!1;if(/^@/.test(t)){const[,i,o]=/^@(.*?)\.(.*?)$/.exec(t),r=this.getval(i),a=i?"null"===r?null:r||"{}":"{}";try{const t=JSON.parse(a);this.lodash_set(t,o,e),s=this.setval(JSON.stringify(t),i)}catch(t){const r={};this.lodash_set(r,o,e),s=this.setval(JSON.stringify(r),i)}}else s=this.setval(e,t);return s}getval(e){switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":case"Egern":return $persistentStore.read(e);case"Quantumult X":return $prefs.valueForKey(e);case"Node.js":return this.data=this.loaddata(),this.data[e];default:return this.data&&this.data[e]||null}}setval(e,t){switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":case"Egern":return $persistentStore.write(e,t);case"Quantumult X":return $prefs.setValueForKey(e,t);case"Node.js":return this.data=this.loaddata(),this.data[t]=e,this.writedata(),!0;default:return this.data&&this.data[t]||null}}initGotEnv(e){this.got=this.got?this.got:require("got"),this.cktough=this.cktough?this.cktough:require("tough-cookie"),this.ckjar=this.ckjar?this.ckjar:new this.cktough.CookieJar,e&&(e.headers=e.headers?e.headers:{},e&&(e.headers=e.headers?e.headers:{},void 0===e.headers.cookie&&void 0===e.headers.Cookie&&void 0===e.cookieJar&&(e.cookieJar=this.ckjar)))}get(e,t=()=>{}){switch(e.headers&&(delete e.headers["Content-Type"],delete e.headers["Content-Length"],delete e.headers["content-type"],delete e.headers["content-length"]),e.params&&(e.url+="?"+this.queryStr(e.params)),void 0===e.followRedirect||e.followRedirect||((this.isSurge()||this.isLoon())&&(e["auto-redirect"]=!1),this.isQuanX()&&(e.opts?e.opts.redirection=!1:e.opts={redirection:!1})),this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":case"Egern":default:this.isSurge()&&this.isNeedRewrite&&(e.headers=e.headers||{},Object.assign(e.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient.get(e,(e,s,i)=>{!e&&s&&(s.body=i,s.statusCode=s.status?s.status:s.statusCode,s.status=s.statusCode),t(e,s,i)});break;case"Quantumult X":this.isNeedRewrite&&(e.opts=e.opts||{},Object.assign(e.opts,{hints:!1})),$task.fetch(e).then(e=>{const{statusCode:s,statusCode:i,headers:o,body:r,bodyBytes:a}=e;t(null,{status:s,statusCode:i,headers:o,body:r,bodyBytes:a},r,a)},e=>t(e&&e.error||"UndefinedError"));break;case"Node.js":let s=require("iconv-lite");this.initGotEnv(e),this.got(e).on("redirect",(e,t)=>{try{if(e.headers["set-cookie"]){const s=e.headers["set-cookie"].map(this.cktough.Cookie.parse).toString();s&&this.ckjar.setCookieSync(s,null),t.cookieJar=this.ckjar}}catch(e){this.logErr(e)}}).then(e=>{const{statusCode:i,statusCode:o,headers:r,rawBody:a}=e,n=s.decode(a,this.encoding);t(null,{status:i,statusCode:o,headers:r,rawBody:a,body:n},n)},e=>{const{message:i,response:o}=e;t(i,o,o&&s.decode(o.rawBody,this.encoding))})}}post(e,t=()=>{}){const s=e.method?e.method.toLocaleLowerCase():"post";switch(e.body&&e.headers&&!e.headers["Content-Type"]&&!e.headers["content-type"]&&(e.headers["content-type"]="application/x-www-form-urlencoded"),e.headers&&(delete e.headers["Content-Length"],delete e.headers["content-length"]),void 0===e.followRedirect||e.followRedirect||((this.isSurge()||this.isLoon())&&(e["auto-redirect"]=!1),this.isQuanX()&&(e.opts?e.opts.redirection=!1:e.opts={redirection:!1})),this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":case"Egern":default:this.isSurge()&&this.isNeedRewrite&&(e.headers=e.headers||{},Object.assign(e.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient[s](e,(e,s,i)=>{!e&&s&&(s.body=i,s.statusCode=s.status?s.status:s.statusCode,s.status=s.statusCode),t(e,s,i)});break;case"Quantumult X":e.method=s,this.isNeedRewrite&&(e.opts=e.opts||{},Object.assign(e.opts,{hints:!1})),$task.fetch(e).then(e=>{const{statusCode:s,statusCode:i,headers:o,body:r,bodyBytes:a}=e;t(null,{status:s,statusCode:i,headers:o,body:r,bodyBytes:a},r,a)},e=>t(e&&e.error||"UndefinedError"));break;case"Node.js":let i=require("iconv-lite");this.initGotEnv(e);const{url:o,...r}=e;this.got[s](o,r).then(e=>{const{statusCode:s,statusCode:o,headers:r,rawBody:a}=e,n=i.decode(a,this.encoding);t(null,{status:s,statusCode:o,headers:r,rawBody:a,body:n},n)},e=>{const{message:s,response:o}=e;t(s,o,o&&i.decode(o.rawBody,this.encoding))})}}time(e,t=null){const s=t?new Date(t):new Date;let i={"M+":s.getMonth()+1,"d+":s.getDate(),"H+":s.getHours(),"m+":s.getMinutes(),"s+":s.getSeconds(),"q+":Math.floor((s.getMonth()+3)/3),S:s.getMilliseconds()};/(y+)/.test(e)&&(e=e.replace(RegExp.$1,(s.getFullYear()+"").substr(4-RegExp.$1.length)));for(let t in i)new RegExp("("+t+")").test(e)&&(e=e.replace(RegExp.$1,1==RegExp.$1.length?i[t]:("00"+i[t]).substr((""+i[t]).length)));return e}queryStr(e){let t="";for(const s in e){let i=e[s];null!=i&&""!==i&&("object"==typeof i&&(i=JSON.stringify(i)),t+=`${s}=${i}&`)}return t=t.substring(0,t.length-1),t}msg(t=e,s="",i="",o={}){const r=e=>{const{$open:t,$copy:s,$media:i,$mediaMime:o}=e;switch(typeof e){case void 0:return e;case"string":switch(this.getEnv()){case"Surge":case"Stash":case"Egern":default:return{url:e};case"Loon":case"Shadowrocket":return e;case"Quantumult X":return{"open-url":e};case"Node.js":return}case"object":switch(this.getEnv()){case"Surge":case"Stash":case"Shadowrocket":case"Egern":default:{const r={};let a=e.openUrl||e.url||e["open-url"]||t;a&&Object.assign(r,{action:"open-url",url:a});let n=e["update-pasteboard"]||e.updatePasteboard||s;n&&Object.assign(r,{action:"clipboard",text:n});let h=e.mediaUrl||e["media-url"]||i;if(h){let e,t;if(h.startsWith("http"));else if(h.startsWith("data:")){const[s]=h.split(";"),[,i]=h.split(",");e=i,t=s.replace("data:","")}else{e=h,t=(e=>{const t={JVBERi0:"application/pdf",R0lGODdh:"image/gif",R0lGODlh:"image/gif",iVBORw0KGgo:"image/png","/9j/":"image/jpg"};for(var s in t)if(0===e.indexOf(s))return t[s];return null})(h)}Object.assign(r,{"media-url":h,"media-base64":e,"media-base64-mime":o??t})}return Object.assign(r,{"auto-dismiss":e["auto-dismiss"],sound:e.sound}),r}case"Loon":{const s={};let o=e.openUrl||e.url||e["open-url"]||t;o&&Object.assign(s,{openUrl:o});let r=e.mediaUrl||e["media-url"]||i;return r&&Object.assign(s,{mediaUrl:r}),console.log(JSON.stringify(s)),s}case"Quantumult X":{const o={};let r=e["open-url"]||e.url||e.openUrl||t;r&&Object.assign(o,{"open-url":r});let a=e.mediaUrl||e["media-url"]||i;a&&Object.assign(o,{"media-url":a});let n=e["update-pasteboard"]||e.updatePasteboard||s;return n&&Object.assign(o,{"update-pasteboard":n}),console.log(JSON.stringify(o)),o}case"Node.js":return}default:return}};if(!this.isMute)switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":case"Egern":default:$notification.post(t,s,i,r(o));break;case"Quantumult X":$notify(t,s,i,r(o));case"Node.js":}if(!this.isMuteLog){let e=["","==============📣系统通知📣=============="];e.push(t),s&&e.push(s),i&&e.push(i),console.log(e.join("\n")),this.logs=this.logs.concat(e)}}debug(...e){this.logLevels[this.logLevel]<=this.logLevels.debug&&(e.length>0&&(this.logs=[...this.logs,...e]),console.log(`${this.logLevelPrefixs.debug}${e.map(e=>e??String(e)).join(this.logSeparator)}`))}info(...e){this.logLevels[this.logLevel]<=this.logLevels.info&&(e.length>0&&(this.logs=[...this.logs,...e]),console.log(`${this.logLevelPrefixs.info}${e.map(e=>e??String(e)).join(this.logSeparator)}`))}warn(...e){this.logLevels[this.logLevel]<=this.logLevels.warn&&(e.length>0&&(this.logs=[...this.logs,...e]),console.log(`${this.logLevelPrefixs.warn}${e.map(e=>e??String(e)).join(this.logSeparator)}`))}error(...e){this.logLevels[this.logLevel]<=this.logLevels.error&&(e.length>0&&(this.logs=[...this.logs,...e]),console.log(`${this.logLevelPrefixs.error}${e.map(e=>e??String(e)).join(this.logSeparator)}`))}log(...e){e.length>0&&(this.logs=[...this.logs,...e]),console.log(e.map(e=>e??String(e)).join(this.logSeparator))}logErr(e,t){switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":case"Egern":case"Quantumult X":default:this.log("",`❗️${this.name}, 错误!`,t,e);break;case"Node.js":this.log("",`❗️${this.name}, 错误!`,t,void 0!==e.message?e.message:e,e.stack)}}wait(e){return new Promise(t=>setTimeout(t,e))}done(e={}){const t=((new Date).getTime()-this.startTime)/1e3;switch(this.log("",`🔔${this.name}, 结束! 🕛 ${t} 秒`),this.log(),this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":case"Egern":case"Quantumult X":default:$done(e);break;case"Node.js":process.exit(1)}}}(e,t)}
