const CACHE_KEY = "trakt_zh_cn_cache_v1";
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

function buildRequestHeaders() {
    const headers = {};
    const sourceHeaders = ($request && $request.headers) ? $request.headers : {};

    Object.keys(sourceHeaders).forEach((key) => {
        const lowerKey = key.toLowerCase();
        if (lowerKey === "host" || lowerKey === "content-length" || lowerKey === ":authority") {
            return;
        }
        headers[key] = sourceHeaders[key];
    });

    headers.Accept = "application/json";
    return headers;
}

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        $httpClient.get({ url: url, headers: buildRequestHeaders() }, (error, response, data) => {
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

    const translation = {
        title: cnTranslation.title || null,
        overview: cnTranslation.overview || null,
        tagline: cnTranslation.tagline || null
    };

    return {
        status: cnTranslation.status || CACHE_STATUS.NOT_FOUND,
        translation: translation
    };
}

async function getTranslation(cache, mediaType, traktId) {
    const cacheKey = String(traktId);
    if (isFresh(cache[cacheKey])) {
        return cache[cacheKey];
    }

    const path = mediaType === MEDIA_TYPE.MOVIE ? "movies" : "shows";
    const url = "https://apiz.trakt.tv/" + path + "/" + encodeURIComponent(traktId) + "/translations/zh?extended=all";
    const translations = normalizeTranslations(await fetchJson(url));
    const merged = extractNormalizedTranslation(translations);
    if (!merged.translation) {
        cache[cacheKey] = createCacheEntry(merged.status, null);
        return cache[cacheKey];
    }

    if (merged.status === CACHE_STATUS.FOUND) {
        cache[cacheKey] = createPermanentCacheEntry(CACHE_STATUS.FOUND, merged.translation);
        return cache[cacheKey];
    }

    cache[cacheKey] = createCacheEntry(CACHE_STATUS.NOT_FOUND, merged.translation);
    return cache[cacheKey];
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
    const seen = {};
    const showIds = [];
    const movieIds = [];

    arr.forEach((item) => {
        const showId = item && item.show && item.show.ids ? item.show.ids.trakt : null;
        if (showId !== undefined && showId !== null) {
            const showKey = String(showId);
            if (!seen[showKey]) {
                seen[showKey] = true;
                showIds.push(showId);
            }
        }

        const movieId = item && item.movie && item.movie.ids ? item.movie.ids.trakt : null;
        if (movieId !== undefined && movieId !== null) {
            const movieKey = String(movieId);
            if (!seen[movieKey]) {
                seen[movieKey] = true;
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
            applyShowTranslation(item, cache[String(showId)]);
        }

        const movieId = item && item.movie && item.movie.ids ? item.movie.ids.trakt : null;
        if (movieId !== undefined && movieId !== null) {
            applyMovieTranslation(item, cache[String(movieId)]);
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

    await processInBatches(ids.showIds, async (showId) => {
        try {
            await getTranslation(cache, MEDIA_TYPE.SHOW, showId);
        } catch (e) {
            console.log("Trakt " + logLabel + " translation fetch failed for show_id=" + showId + ": " + e);
        }
    });

    await processInBatches(ids.movieIds, async (movieId) => {
        try {
            await getTranslation(cache, MEDIA_TYPE.MOVIE, movieId);
        } catch (e) {
            console.log("Trakt " + logLabel + " translation fetch failed for movie_id=" + movieId + ": " + e);
        }
    });

    applyTranslationsToItems(arr, cache);
    saveCache(cache);
    $done({ body: JSON.stringify(arr) });
}

function handleMediaDetail() {
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
    const entry = cache[String(traktId)];
    applyTranslationToDetail(data, entry);
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
            await handleMediaList("playback movie");
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
            handleMediaDetail();
            return;
        }

        if (/\/movies\/[^\/]+(?:\?.*)?$/.test(requestUrl)) {
            handleMediaDetail();
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
