const CACHE_KEY = "trakt_zh_cn_cache_v2";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const REQUEST_BATCH_SIZE = 10;
const CACHE_STATUS = {
    FOUND: 1,
    NOT_FOUND: 2
};
const MEDIA_TYPE = {
    SHOW: 1,
    MOVIE: 2
};
const preferredLanguage = "zh-CN";
const body = $response.body;
const requestUrl = ($request && $request.url) ? $request.url : "";

const pendingBackendWrites = {
    shows: {},
    movies: {}
};

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
        return parsed && typeof parsed === "object" ? parsed : {};
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

function createCacheEntry(status, translation) {
    return {
        status: status,
        translation: translation || null,
        expiresAt: Date.now() + CACHE_TTL_MS
    };
}

function createPermanentCacheEntry(status, translation) {
    return {
        status: status,
        translation: translation || null,
        expiresAt: null
    };
}

function isFresh(entry) {
    return !!(
        entry &&
        (entry.expiresAt === null || (entry.expiresAt && entry.expiresAt > Date.now()))
    );
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

function normalizeTranslations(items) {
    if (!Array.isArray(items)) {
        items = [];
    }

    const fallbackRegions = ["sg", "hk", "tw"];
    const fields = ["title", "overview", "tagline"];
    let cnTranslation = findTranslationByRegion(items, "cn");
    const originalCnFound = !!cnTranslation;
    const originalCnComplete = originalCnFound && fields.every((field) => {
        return !isEmptyTranslationValue(cnTranslation[field]);
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

    cnTranslation.status = originalCnComplete ? CACHE_STATUS.FOUND : CACHE_STATUS.NOT_FOUND;

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
            if (extraHeaders[key] !== undefined && extraHeaders[key] !== null && extraHeaders[key] !== "") {
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

function getBatchBackendBaseUrl() {
    let value = "https://loon-plugins.demojameson.de5.net";

    if (typeof $argument === "object" && $argument !== null) {
        value = ($argument.backendBaseUrl || "").trim();
    } else if (typeof $argument === "string") {
        value = $argument.replace(/^\[|\]$/g, "").trim();
    }

    if (typeof value !== "string") {
        return "";
    }

    value = value.trim();
    if (!/^https?:\/\//i.test(value)) {
        return "";
    }

    return value.replace(/\/+$/, "");
}

function buildMediaCacheKey(mediaType, traktId) {
    const prefix = mediaType === MEDIA_TYPE.MOVIE ? "movie:" : "show:";
    return prefix + String(traktId);
}

function storeTranslationEntry(cache, mediaType, traktId, entry) {
    const cacheKey = buildMediaCacheKey(mediaType, traktId);
    const translation = normalizeTranslationPayload(entry ? entry.translation : null);
    const status = entry && entry.status === CACHE_STATUS.FOUND ? CACHE_STATUS.FOUND : CACHE_STATUS.NOT_FOUND;

    if (status === CACHE_STATUS.FOUND && translation) {
        cache[cacheKey] = createPermanentCacheEntry(CACHE_STATUS.FOUND, translation);
    } else {
        cache[cacheKey] = createCacheEntry(CACHE_STATUS.NOT_FOUND, translation);
    }

    return cache[cacheKey];
}

function getCachedTranslation(cache, mediaType, traktId) {
    return cache[buildMediaCacheKey(mediaType, traktId)];
}

function getMissingIds(cache, mediaType, ids) {
    return ids.filter((traktId) => {
        return !isFresh(getCachedTranslation(cache, mediaType, traktId));
    });
}

async function fetchCachedTranslationsFromBackend(cache, showIds, movieIds) {
    const baseUrl = getBatchBackendBaseUrl();
    if (!baseUrl) {
        return false;
    }

    const query = [];
    if (showIds.length > 0) {
        query.push("shows=" + showIds.map((id) => encodeURIComponent(String(id))).join(","));
    }
    if (movieIds.length > 0) {
        query.push("movies=" + movieIds.map((id) => encodeURIComponent(String(id))).join(","));
    }

    if (query.length === 0) {
        return true;
    }

    const url = baseUrl + "/api/trakt/translations?" + query.join("&");
    const payload = await fetchJson(url, null, false);

    if (payload && payload.shows && typeof payload.shows === "object") {
        Object.keys(payload.shows).forEach((id) => {
            storeTranslationEntry(cache, MEDIA_TYPE.SHOW, id, payload.shows[id]);
        });
    }

    if (payload && payload.movies && typeof payload.movies === "object") {
        Object.keys(payload.movies).forEach((id) => {
            storeTranslationEntry(cache, MEDIA_TYPE.MOVIE, id, payload.movies[id]);
        });
    }

    saveCache(cache);
    return true;
}

function queueBackendWrite(mediaType, traktId, entry) {
    if (mediaType === MEDIA_TYPE.SHOW) {
        pendingBackendWrites.shows[String(traktId)] = entry;
    } else {
        pendingBackendWrites.movies[String(traktId)] = entry;
    }
}

function flushBackendWrites() {
    const baseUrl = getBatchBackendBaseUrl();
    if (!baseUrl) {
        return;
    }

    if (Object.keys(pendingBackendWrites.shows).length === 0 && Object.keys(pendingBackendWrites.movies).length === 0) {
        return;
    }

    const url = baseUrl + "/api/trakt/translations";
    postJson(url, {
        shows: pendingBackendWrites.shows,
        movies: pendingBackendWrites.movies
    }, {
        "Content-Type": "application/json"
    }, false).catch(e => {
        console.log("Trakt backend cache write failed during flush: " + e);
    });

    // Clear the queues immediately so we don't accidentally write twice
    pendingBackendWrites.shows = {};
    pendingBackendWrites.movies = {};
}

async function fetchDirectTranslation(mediaType, traktId) {
    const path = mediaType === MEDIA_TYPE.MOVIE ? "movies" : "shows";
    const url = "https://apiz.trakt.tv/" + path + "/" + encodeURIComponent(traktId) + "/translations/zh?extended=all";
    const translations = normalizeTranslations(await fetchJson(url));
    return extractNormalizedTranslation(translations);
}

async function getTranslation(cache, mediaType, traktId) {
    const cacheEntry = getCachedTranslation(cache, mediaType, traktId);
    if (isFresh(cacheEntry)) {
        return cacheEntry;
    }

    const merged = await fetchDirectTranslation(mediaType, traktId);
    const stored = storeTranslationEntry(cache, mediaType, traktId, merged);
    saveCache(cache);

    queueBackendWrite(mediaType, traktId, merged);

    return stored;
}

async function processInBatches(items, worker) {
    for (let i = 0; i < items.length; i += REQUEST_BATCH_SIZE) {
        const batch = items.slice(i, i + REQUEST_BATCH_SIZE);
        await Promise.all(batch.map((item) => worker(item)));
    }
}

function applyShowTranslation(item, entry) {
    if (!item || !item.show || !entry || !entry.translation) {
        return;
    }

    if (entry.translation.title) {
        item.show.title = entry.translation.title;
    }
    if (entry.translation.overview) {
        item.show.overview = entry.translation.overview;
    }
    if (entry.translation.tagline) {
        item.show.tagline = entry.translation.tagline;
    }
}

function applyMovieTranslation(item, entry) {
    if (!item || !item.movie || !entry || !entry.translation) {
        return;
    }

    if (entry.translation.title) {
        item.movie.title = entry.translation.title;
    }
    if (entry.translation.overview) {
        item.movie.overview = entry.translation.overview;
    }
    if (entry.translation.tagline) {
        item.movie.tagline = entry.translation.tagline;
    }
}

function applyTranslationToDetail(data, entry) {
    if (!data || !entry || !entry.translation) {
        return;
    }

    if (entry.translation.title) {
        data.title = entry.translation.title;
    }
    if (entry.translation.overview) {
        data.overview = entry.translation.overview;
    }
    if (entry.translation.tagline) {
        data.tagline = entry.translation.tagline;
    }
}

function collectMediaIds(arr) {
    const seenShows = {};
    const seenMovies = {};
    const showIds = [];
    const movieIds = [];

    arr.forEach((item) => {
        const showId = item && item.show && item.show.ids ? item.show.ids.trakt : null;
        if (showId !== undefined && showId !== null) {
            const showKey = String(showId);
            if (!seenShows[showKey]) {
                seenShows[showKey] = true;
                showIds.push(showId);
            }
        }

        const movieId = item && item.movie && item.movie.ids ? item.movie.ids.trakt : null;
        if (movieId !== undefined && movieId !== null) {
            const movieKey = String(movieId);
            if (!seenMovies[movieKey]) {
                seenMovies[movieKey] = true;
                movieIds.push(movieId);
            }
        }
    });

    return {
        showIds: showIds,
        movieIds: movieIds
    };
}

function applyTranslationsToItems(arr, cache) {
    arr.forEach((item) => {
        const showId = item && item.show && item.show.ids ? item.show.ids.trakt : null;
        if (showId !== undefined && showId !== null) {
            applyShowTranslation(item, getCachedTranslation(cache, MEDIA_TYPE.SHOW, showId));
        }

        const movieId = item && item.movie && item.movie.ids ? item.movie.ids.trakt : null;
        if (movieId !== undefined && movieId !== null) {
            applyMovieTranslation(item, getCachedTranslation(cache, MEDIA_TYPE.MOVIE, movieId));
        }
    });
}

async function hydrateFromBackend(cache, ids) {
    try {
        await fetchCachedTranslationsFromBackend(
            cache,
            getMissingIds(cache, MEDIA_TYPE.SHOW, ids.showIds),
            getMissingIds(cache, MEDIA_TYPE.MOVIE, ids.movieIds)
        );
    } catch (e) {
        console.log("Trakt backend cache read failed: " + e);
    }
}

async function fetchAndPersistMissing(cache, mediaType, ids, logLabel) {
    await processInBatches(getMissingIds(cache, mediaType, ids), async (traktId) => {
        try {
            const merged = await fetchDirectTranslation(mediaType, traktId);
            storeTranslationEntry(cache, mediaType, traktId, merged);
            queueBackendWrite(mediaType, traktId, merged);
        } catch (e) {
            console.log("Trakt " + logLabel + " translation fetch failed for id=" + traktId + ": " + e);
        }
    });
}

async function handleMediaList(logLabel) {
    const arr = JSON.parse(body);
    if (!Array.isArray(arr) || arr.length === 0) {
        $done({ body: body });
        return;
    }

    const cache = loadCache();
    const ids = collectMediaIds(arr);

    await hydrateFromBackend(cache, ids);

    await fetchAndPersistMissing(cache, MEDIA_TYPE.SHOW, ids.showIds, logLabel + " show");
    await fetchAndPersistMissing(cache, MEDIA_TYPE.MOVIE, ids.movieIds, logLabel + " movie");

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

    const traktId = data && data.ids ? data.ids.trakt : null;
    if (traktId === undefined || traktId === null) {
        $done({ body: body });
        return;
    }

    const cache = loadCache();

    if (!isFresh(getCachedTranslation(cache, mediaType, traktId))) {
        try {
            await fetchCachedTranslationsFromBackend(
                cache,
                mediaType === MEDIA_TYPE.SHOW ? [traktId] : [],
                mediaType === MEDIA_TYPE.MOVIE ? [traktId] : []
            );
        } catch (e) {
            console.log("Trakt detail backend cache read failed for id=" + traktId + ": " + e);
        }
    }

    try {
        await getTranslation(cache, mediaType, traktId);
    } catch (e) {
        console.log("Trakt detail translation fetch failed for id=" + traktId + ": " + e);
    }
    
    flushBackendWrites();

    applyTranslationToDetail(data, getCachedTranslation(cache, mediaType, traktId));
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

(async () => {
    try {
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

        if (/\/users\/[^\/]+?\/history\/episodes\/?(?:\?|$)/.test(requestUrl)) {
            await handleMediaList("history episode");
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

        if (/\/users\/[^\/]+?\/favorites\/?(?:\?.*)?$/.test(requestUrl)) {
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

        if (/\/shows\/[^\/]+(?:\?.*)?$/.test(requestUrl)) {
            await handleMediaDetail(MEDIA_TYPE.SHOW);
            return;
        }

        if (/\/movies\/[^\/]+(?:\?.*)?$/.test(requestUrl)) {
            await handleMediaDetail(MEDIA_TYPE.MOVIE);
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
