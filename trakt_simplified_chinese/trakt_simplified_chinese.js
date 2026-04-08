const CACHE_KEY = "trakt_zh_cn_cache_v2";
const CURRENT_SEASON_CACHE_KEY = "trakt_current_season_v1";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PARTIAL_FOUND_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REQUEST_BATCH_SIZE = 10;
const SEASON_EPISODE_TRANSLATION_LIMIT = 50;
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
const HISTORY_EPISODES_LIMIT = 1000;
const MEDIA_CONFIG = {
    [MEDIA_TYPE.SHOW]: {
        buildTranslationPath: function (ref) {
            return isNonNullish(ref && ref.traktId)
                ? "/shows/" + ref.traktId + "/translations/zh?extended=all"
                : "";
        }
    },
    [MEDIA_TYPE.MOVIE]: {
        buildTranslationPath: function (ref) {
            return isNonNullish(ref && ref.traktId)
                ? "/movies/" + ref.traktId + "/translations/zh?extended=all"
                : "";
        }
    },
    [MEDIA_TYPE.EPISODE]: {
        buildTranslationPath: function (ref) {
            return ref &&
                isNonNullish(ref.showId) &&
                isNonNullish(ref.seasonNumber) &&
                isNonNullish(ref.episodeNumber)
                ? "/shows/" + ref.showId + "/seasons/" + ref.seasonNumber + "/episodes/" + ref.episodeNumber + "/translations/zh?extended=all"
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
        config.backendBaseUrl = ($argument.backendBaseUrl || "").trim() || config.backendBaseUrl;
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
            config.backendBaseUrl = parts[1];
        } else if (/^https?:\/\//i.test(parts[0])) {
            config.backendBaseUrl = parts[0];
        }
    }

    return config;
}

const argumentConfig = parseArgumentConfig();
const latestHistoryEpisodeOnly = argumentConfig.latestHistoryEpisodeOnly;
const backendBaseUrl = (() => {
    let value = argumentConfig.backendBaseUrl;

    if (typeof value !== "string") {
        return "";
    }

    value = value.trim();
    if (!/^https?:\/\//i.test(value)) {
        return "";
    }

    return value.replace(/\/+$/, "");
})();
const preferredLanguage = "zh-CN";
const SCRIPT_TRANSLATION_REQUEST_HEADER = "X-Loon-Trakt-Translation-Request";
const SCRIPT_TRANSLATION_REQUEST_VALUE = "script";
const body = typeof $response !== "undefined" && typeof $response.body === "string"
    ? $response.body
    : "";
const requestUrl = ($request && $request.url) ? $request.url : "";

const pendingBackendWrites = createMediaMap();

function loadCache() {
    if (typeof $persistentStore === "undefined") {
        return {};
    }

    const raw = $persistentStore.read(CACHE_KEY);
    if (!raw) {
        return {};
    }

    try {
        const parsed = JSON.parse(raw);
        const cache = parsed && typeof parsed === "object" ? parsed : {};
        const prunedCache = pruneExpiredCacheEntries(cache);

        if (prunedCache.modified) {
            saveCache(prunedCache.cache);
        }

        return prunedCache.cache;
    } catch (e) {
        console.log("Trakt cache load failed: " + e);
        return {};
    }
}

function saveCache(cache) {
    if (typeof $persistentStore === "undefined") {
        return;
    }

    try {
        $persistentStore.write(JSON.stringify(cache), CACHE_KEY);
    } catch (e) {
        console.log("Trakt cache save failed: " + e);
    }
}

function setCurrentSeason(showId, seasonNumber) {
    if (
        typeof $persistentStore === "undefined" ||
        !isNonNullish(showId) ||
        !isNonNullish(seasonNumber)
    ) {
        return;
    }

    try {
        $persistentStore.write(JSON.stringify({
            showId: String(showId),
            seasonNumber: Number(seasonNumber)
        }), CURRENT_SEASON_CACHE_KEY);
    } catch (e) {
        console.log("Trakt current season cache save failed: " + e);
    }
}

function clearCurrentSeason() {
    if (typeof $persistentStore === "undefined") {
        return;
    }

    try {
        $persistentStore.write("", CURRENT_SEASON_CACHE_KEY);
    } catch (e) {
        console.log("Trakt current season cache save failed: " + e);
    }
}

function getCurrentSeason(showId) {
    if (typeof $persistentStore === "undefined" || !isNonNullish(showId)) {
        return 1;
    }

    const raw = $persistentStore.read(CURRENT_SEASON_CACHE_KEY);
    if (!raw) {
        return 1;
    }

    try {
        const cache = JSON.parse(raw);
        if (
            !cache ||
            typeof cache !== "object" ||
            !isNonNullish(cache.showId) ||
            !isNonNullish(cache.seasonNumber) ||
            String(cache.showId) !== String(showId)
        ) {
            return 1;
        }

        return Number.isFinite(Number(cache.seasonNumber)) ? Number(cache.seasonNumber) : 1;
    } catch (e) {
        console.log("Trakt current season cache load failed: " + e);
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
        modified: modified
    };
}

function getLanguagePreference() {
    const match = preferredLanguage.match(/([a-zA-Z]{2})(?:-([a-zA-Z]{2}))?/);
    return {
        lang: match && match[1] ? match[1].toLowerCase() : null,
        region: match && match[2] ? match[2].toLowerCase() : null
    };
}

function sortTranslations(arr) {
    const preference = getLanguagePreference();
    if (!preference.lang) {
        return arr;
    }

    arr.sort((a, b) => {
        const getScore = (item) => {
            const itemLang = item && item.language ? item.language.toLowerCase() : null;
            const itemRegion = item && item.country ? item.country.toLowerCase() : null;

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

function isNonNullish(value) {
    return value !== undefined && value !== null;
}

function getMediaConfig(mediaType) {
    return MEDIA_CONFIG[mediaType];
}

function getMediaBackendField(mediaType) {
    return mediaType + "s";
}

function getMediaCachePrefix(mediaType) {
    return mediaType + ":";
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
        title: translation.title || null,
        overview: translation.overview || null,
        tagline: translation.tagline || null
    };

    return hasUsefulTranslation(normalized) ? normalized : null;
}

function findTranslationByRegion(items, region) {
    return items.find((item) => {
        return item &&
            String(item.language || "").toLowerCase() === "zh" &&
            String(item.country || "").toLowerCase() === region;
    }) || null;
}

function isChineseTranslation(item) {
    return !!(item && String(item.language || "").toLowerCase() === "zh");
}

function normalizeTranslations(items) {
    if (!Array.isArray(items)) {
        items = [];
    }

    const fallbackRegions = ["sg", "hk", "tw"];
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
    const sourceHeaders = ($request && $request.headers) ? $request.headers : {};

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

    if (extraHeaders && typeof extraHeaders === "object") {
        Object.keys(extraHeaders).forEach((key) => {
            if (isNonNullish(extraHeaders[key]) && extraHeaders[key] !== "") {
                headers[key] = extraHeaders[key];
            }
        });
    }

    return headers;
}

function fetchJson(url, extraHeaders, useSourceHeaders) {
    return new Promise((resolve, reject) => {
        $httpClient.get({ url: url, headers: buildRequestHeaders(extraHeaders, useSourceHeaders) }, (error, response, data) => {
            if (error) {
                reject(error);
                return;
            }

            const statusCode = response ? response.status : 0;
            if (statusCode < 200 || statusCode >= 300) {
                reject("HTTP " + statusCode + " for " + url);
                return;
            }

            try {
                resolve(JSON.parse(data));
            } catch (e) {
                reject("JSON parse failed for " + url + ": " + e);
            }
        });
    });
}

function getRequestHeaderValue(headerName) {
    if (!$request || !$request.headers || !headerName) {
        return null;
    }

    const targetName = String(headerName).toLowerCase();
    const headers = $request.headers;
    const matchedKey = Object.keys(headers).find((key) => String(key).toLowerCase() === targetName);
    return matchedKey ? headers[matchedKey] : null;
}

function isScriptInitiatedTranslationRequest() {
    return String(getRequestHeaderValue(SCRIPT_TRANSLATION_REQUEST_HEADER) || "").toLowerCase() ===
        SCRIPT_TRANSLATION_REQUEST_VALUE;
}

function postJson(url, payload, extraHeaders, useSourceHeaders) {
    return new Promise((resolve, reject) => {
        $httpClient.post({
            url: url,
            headers: buildRequestHeaders(extraHeaders, useSourceHeaders),
            body: JSON.stringify(payload)
        }, (error, response, data) => {
            if (error) {
                reject(error);
                return;
            }

            const statusCode = response ? response.status : 0;
            if (statusCode < 200 || statusCode >= 300) {
                reject("HTTP " + statusCode + " for " + url);
                return;
            }

            if (!data) {
                resolve({});
                return;
            }

            try {
                resolve(JSON.parse(data));
            } catch (e) {
                reject("JSON parse failed for " + url + ": " + e);
            }
        });
    });
}

function pickCnTranslation(items) {
    if (!Array.isArray(items) || items.length === 0) {
        return null;
    }

    return items.find((item) => {
        return item &&
            String(item.language || "").toLowerCase() === "zh" &&
            String(item.country || "").toLowerCase() === "cn";
    }) || null;
}

function extractNormalizedTranslation(items) {
    const cnTranslation = pickCnTranslation(items);
    const translation = normalizeTranslationPayload(cnTranslation);

    return {
        status: cnTranslation && cnTranslation.status ? cnTranslation.status : CACHE_STATUS.NOT_FOUND,
        translation: translation
    };
}

function buildEpisodeCompositeKey(showId, seasonNumber, episodeNumber) {
    if (!isNonNullish(showId) || !isNonNullish(seasonNumber) || !isNonNullish(episodeNumber)) {
        return "";
    }

    return String(showId) + ":" + String(seasonNumber) + ":" + String(episodeNumber);
}

function parseEpisodeLookupKey(value) {
    const match = String(value || "").match(/^(\d+):(\d+):(\d+)$/);
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

    const translation = normalizeTranslationPayload(entry ? entry.translation : null);
    const status = entry && entry.status === CACHE_STATUS.FOUND
        ? CACHE_STATUS.FOUND
        : entry && entry.status === CACHE_STATUS.PARTIAL_FOUND
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
        return String(language || "").toLowerCase() === "zh";
    });
}

function shouldSkipTranslationLookup(ref) {
    const availableTranslations = ref && Array.isArray(ref.availableTranslations)
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

    const query = [];
    Object.keys(MEDIA_CONFIG).forEach((mediaType) => {
        const refs = refsByType && Array.isArray(refsByType[mediaType]) ? refsByType[mediaType] : [];
        const ids = getBackendFieldIds(refs);
        if (ids.length > 0) {
            query.push(getMediaBackendField(mediaType) + "=" + ids.map((id) => String(id)).join(","));
        }
    });

    if (query.length === 0) {
        return true;
    }

    const url = backendBaseUrl + "/api/trakt/translations?" + query.join("&");
    const payload = await fetchJson(url, null, false);

    Object.keys(MEDIA_CONFIG).forEach((mediaType) => {
        const collectionField = getMediaBackendField(mediaType);
        const entries = payload && payload[collectionField] && typeof payload[collectionField] === "object"
            ? payload[collectionField]
            : null;
        if (!entries) {
            return;
        }

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

    const url = backendBaseUrl + "/api/trakt/translations";
    postJson(url, buildBackendWritePayload(), {
        "Content-Type": "application/json"
    }, false).catch(e => {
        console.log("Trakt backend cache write failed during flush: " + e);
    });

    Object.keys(pendingBackendWrites).forEach((field) => {
        pendingBackendWrites[field] = {};
    });
}

function buildTranslationUrl(mediaType, ref) {
    const path = getMediaConfig(mediaType).buildTranslationPath(ref);
    return path ? "https://apiz.trakt.tv" + path : "";
}

function resolveTranslationRequestTarget(url) {
    const normalizedUrl = String(url || "");
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
        const match = String(url || "").match(/\/shows\/(\d+)\/seasons\/(\d+)\/episodes\/(\d+)(?:\?|$)/);
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

    const traktId = data && data.ids ? data.ids.trakt : null;
    return isNonNullish(traktId)
        ? {
            mediaType: mediaType,
            traktId: traktId
        }
        : null;
}

function resolveCurrentSeasonTarget(url) {
    const match = String(url || "").match(/\/shows\/(\d+)\/seasons\/(\d+)(?:\/|\?|$)/);
    if (!match) {
        return null;
    }

    return {
        showId: match[1],
        seasonNumber: Number(match[2])
    };
}

function resolveSeasonListTarget(url) {
    const match = String(url || "").match(/\/shows\/(\d+)\/seasons(?:\?|$)/);
    if (!match) {
        return null;
    }

    return {
        showId: match[1]
    };
}

async function fetchDirectTranslation(mediaType, ref) {
    const traktId = ref && isNonNullish(ref.traktId) ? ref.traktId : null;
    const url = buildTranslationUrl(mediaType, ref);

    if (!url) {
        throw new Error("Missing translation lookup metadata for mediaType=" + mediaType + ", traktId=" + traktId);
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

    const mediaType = ref.mediaType || null;
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
        if (item && item.episode) {
            return item.episode;
        }

        if (item && item.progress && item.progress.next_episode) {
            return item.progress.next_episode;
        }

        return null;
    }

    return item ? item[mediaType] : null;
}

function buildMediaRef(item, mediaType) {
    if (mediaType === MEDIA_TYPE.EPISODE) {
        return buildEpisodeRef(item, getItemMediaTarget(item, mediaType));
    }

    const target = getItemMediaTarget(item, mediaType);
    const traktId = target && target.ids ? target.ids.trakt : null;
    if (!isNonNullish(traktId)) {
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
    const showId = item && item.show && item.show.ids ? item.show.ids.trakt : null;
    const seasonNumber = episode ? episode.season : null;
    const episodeNumber = episode ? episode.number : null;

    if (!isNonNullish(showId) || !isNonNullish(seasonNumber) || !isNonNullish(episodeNumber)) {
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
            missingRefsByType[mediaType] = getMissingRefs(cache, mediaType, refsByType[mediaType] || []);
        });
        await fetchTranslationsFromBackend(cache, missingRefsByType);
    } catch (e) {
        console.log("Trakt backend cache read failed: " + e);
    }
}

async function fetchAndPersistMissing(cache, mediaType, refs, logLabel) {
    await processInBatches(getMissingRefs(cache, mediaType, refs), async (ref) => {
        try {
            const merged = await fetchDirectTranslation(mediaType, ref);
            storeTranslationEntry(cache, mediaType, ref, merged);
            queueBackendWrite(mediaType, ref, merged);
        } catch (e) {
            console.log("Trakt " + logLabel + " translation fetch failed for key=" + buildMediaCacheLookupKey(mediaType, ref) + ": " + e);
        }
    });
}

async function handleMediaList(logLabel, bodyOverride) {
    const sourceBody = isNonNullish(bodyOverride) ? bodyOverride : body;
    const arr = JSON.parse(sourceBody);
    if (!Array.isArray(arr) || arr.length === 0) {
        $done({ body: sourceBody });
        return;
    }

    const cache = loadCache();
    const refsByType = collectMediaRefs(arr);

    await hydrateFromBackend(cache, refsByType);

    for (const mediaType of Object.keys(MEDIA_CONFIG)) {
        await fetchAndPersistMissing(cache, mediaType, refsByType[mediaType], logLabel + " " + mediaType);
    }

    saveCache(cache);
    flushBackendWrites();

    applyTranslationsToItems(arr, cache);
    $done({ body: JSON.stringify(arr) });
}

async function handleMediaDetail(mediaType) {
    const data = JSON.parse(body);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        $done({ body: body });
        return;
    }

    const ref = resolveMediaDetailTarget(requestUrl, data, mediaType);
    if (!ref || !buildMediaCacheLookupKey(mediaType, ref)) {
        $done({ body: body });
        return;
    }

    const cache = loadCache();
    applyTranslation(data, getCachedTranslation(cache, mediaType, ref));
    $done({ body: JSON.stringify(data) });
}

function handleTranslations() {
    const arr = JSON.parse(body);
    if (!Array.isArray(arr) || arr.length === 0) {
        $done({ body: body });
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

    $done({ body: JSON.stringify(merged) });
}

function handleUserSettings() {
    const data = JSON.parse(body);

    if (!data || typeof data !== "object") {
        $done({ body: body });
        return;
    }

    if (!data.user || typeof data.user !== "object") {
        data.user = {};
    }
    data.user.vip = true;

    if (!data.account || typeof data.account !== "object") {
        data.account = {};
    }
    data.account.display_ads = false;

    $done({ body: JSON.stringify(data) });
}

function handleCurrentSeasonRequest() {
    const target = resolveCurrentSeasonTarget(requestUrl);
    if (!target) {
        $done({});
        return;
    }

    setCurrentSeason(target.showId, target.seasonNumber);
    $done({});
}

async function handleSeasonEpisodesList() {
    try {
        const target = resolveSeasonListTarget(requestUrl);
        const seasons = JSON.parse(body);
        if (!target || !Array.isArray(seasons) || seasons.length === 0) {
            $done({ body: body });
            return;
        }

        const currentSeasonNumber = getCurrentSeason(target.showId);
        const targetSeason = seasons.find((item) => {
            const episodes = item && Array.isArray(item.episodes) ? item.episodes : [];
            return episodes.some((episode) => {
                return Number(episode && episode.season) === currentSeasonNumber;
            });
        });

        if (!targetSeason) {
            $done({ body: body });
            return;
        }

        const cache = loadCache();
        const allEpisodeRefs = seasons.flatMap((item) => {
            const seasonEpisodes = item && Array.isArray(item.episodes) ? item.episodes : [];
            return seasonEpisodes.map((episode) => {
                return {
                    mediaType: MEDIA_TYPE.EPISODE,
                    showId: target.showId,
                    seasonNumber: episode ? episode.season : null,
                    episodeNumber: episode ? episode.number : null,
                    backendLookupKey: buildEpisodeCompositeKey(target.showId, episode ? episode.season : null, episode ? episode.number : null),
                    availableTranslations: episode && Array.isArray(episode.available_translations) ? episode.available_translations : null,
                    seasonFirstAired: item ? item.first_aired : null,
                    episodeFirstAired: episode ? episode.first_aired : null
                };
            });
        }).filter((ref) => {
            return !!buildMediaCacheLookupKey(MEDIA_TYPE.EPISODE, ref);
        });
        const episodes = Array.isArray(targetSeason.episodes) ? targetSeason.episodes : [];
        episodes.map((episode) => {
            return {
                mediaType: MEDIA_TYPE.EPISODE,
                showId: target.showId,
                seasonNumber: currentSeasonNumber,
                episodeNumber: episode ? episode.number : null,
                backendLookupKey: buildEpisodeCompositeKey(target.showId, currentSeasonNumber, episode ? episode.number : null),
                availableTranslations: episode && Array.isArray(episode.available_translations) ? episode.available_translations : null
            };
        }).filter((ref) => {
            return !!buildMediaCacheLookupKey(MEDIA_TYPE.EPISODE, ref);
        });
        await hydrateFromBackend(cache, {
            show: [],
            movie: [],
            episode: allEpisodeRefs
        });
        const missingEpisodeRefs = getMissingRefs(cache, MEDIA_TYPE.EPISODE, allEpisodeRefs).filter((ref) => {
            return isNonNullish(ref && ref.seasonFirstAired) && isNonNullish(ref && ref.episodeFirstAired);
        });
        const prioritizedEpisodeRefs = missingEpisodeRefs
            .map((ref, index) => {
                return {
                    ref: ref,
                    index: index
                };
            })
            .sort((left, right) => {
                const leftSeason = Number(left.ref && left.ref.seasonNumber);
                const rightSeason = Number(right.ref && right.ref.seasonNumber);
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

        episodes.forEach((episode) => {
            const ref = {
                mediaType: MEDIA_TYPE.EPISODE,
                showId: target.showId,
                seasonNumber: currentSeasonNumber,
                episodeNumber: episode ? episode.number : null
            };
            applyTranslation(episode, getCachedTranslation(cache, MEDIA_TYPE.EPISODE, ref));
        });

        $done({ body: JSON.stringify(seasons) });
    } finally {
        clearCurrentSeason();
    }
}

function buildHistoryEpisodesRequestUrl(url) {
    if (!shouldApplyLatestHistoryEpisodeOnly(url)) {
        return url;
    }

    const match = String(url || "").match(/^([^?]+)(\?.*)?$/);
    if (!match) {
        return url;
    }

    const path = match[1];
    const query = match[2] || "";
    const params = {};
    const queryWithoutPrefix = query.replace(/^\?/, "");

    if (queryWithoutPrefix) {
        queryWithoutPrefix.split("&").forEach((part) => {
            if (!part) {
                return;
            }

            const pieces = part.split("=");
            const key = decodeURIComponent(pieces[0] || "");
            if (!key) {
                return;
            }

            const value = pieces.length > 1 ? decodeURIComponent(pieces.slice(1).join("=")) : "";
            params[key] = value;
        });
    }

    params.limit = String(HISTORY_EPISODES_LIMIT);

    const nextQuery = Object.keys(params).map((key) => {
        return encodeURIComponent(key) + "=" + encodeURIComponent(params[key]);
    }).join("&");

    return path + (nextQuery ? "?" + nextQuery : "");
}

function isHistoryEpisodesListUrl(url) {
    return /\/users\/[^\/]+?\/history\/episodes\/?(?:\?|$)/.test(String(url || ""));
}

function shouldApplyLatestHistoryEpisodeOnly(url) {
    return latestHistoryEpisodeOnly && isHistoryEpisodesListUrl(url);
}

function getHistoryEpisodeShowKey(item) {
    const showId = item && item.show && item.show.ids ? item.show.ids.trakt : null;
    return isNonNullish(showId) ? String(showId) : "";
}

function getHistoryEpisodeSortKey(item) {
    const episode = item && item.episode ? item.episode : null;
    const season = episode && Number.isFinite(Number(episode.season)) ? Number(episode.season) : -1;
    const number = episode && Number.isFinite(Number(episode.number)) ? Number(episode.number) : -1;
    return {
        season: season,
        number: number
    };
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
    const url = buildHistoryEpisodesRequestUrl(requestUrl);
    if (url === requestUrl) {
        if (!shouldApplyLatestHistoryEpisodeOnly(requestUrl)) {
            return body;
        }

        try {
            return JSON.stringify(keepLatestHistoryEpisodes(JSON.parse(body)));
        } catch (e) {
            console.log("Trakt history episode local merge failed: " + e);
            return body;
        }
    }

    try {
        const data = await fetchJson(url);
        return JSON.stringify(keepLatestHistoryEpisodes(data));
    } catch (e) {
        console.log("Trakt history episode refetch failed: " + e);
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
            /\/shows\/[^\/]+\/seasons\/\d+(?:\/|\?|$)/.test(requestUrl)
        ) {
            handleCurrentSeasonRequest();
            return;
        }

        if (
            typeof $response === "undefined" &&
            shouldApplyLatestHistoryEpisodeOnly(requestUrl)
        ) {
            $done({ url: buildHistoryEpisodesRequestUrl(requestUrl) });
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

        if (/\/users\/[^\/]+?\/history\/?(?:\?|$)/.test(requestUrl)) {
            await handleMediaList("history");
            return;
        }

        if (/\/users\/[^\/]+?\/collection\/media(?:\?|$)/.test(requestUrl)) {
            await handleMediaList("collection media");
            return;
        }

        if (/\/users\/me\/following\/activities(?:\?|$)/.test(requestUrl)) {
            await handleMediaList("following activities");
            return;
        }

        if (/\/users\/[^\/]+?\/lists\/\d+\/items(?:\?|$)/.test(requestUrl)) {
            await handleMediaList("list items");
            return;
        }

        if (/\/lists\/\d+\/items(?:\?|$)/.test(requestUrl)) {
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
        console.log("Trakt script error: " + e);
        $done({});
    }
})();
