import { URL } from "@nsnanocat/url";
import {
    ensureArray,
    ensureObject,
    isNonNullish,
    isNotArray,
    parseQueryParams,
    parseUrlParts
} from "../utils.mjs";

const HISTORY_EPISODES_LIMIT = 500;
const RIPPPLE_HISTORY_MIN_LIMIT = 100;

function buildMinimumLimitRequestUrl(url, minimumLimit) {
    const normalizedMinimumLimit = Number(minimumLimit);
    if (!Number.isFinite(normalizedMinimumLimit) || normalizedMinimumLimit <= 0) {
        return url;
    }

    try {
        const parsedUrl = new URL(String(url ?? ""));
        const currentLimit = Number(parsedUrl.searchParams.get("limit"));
        if (!Number.isFinite(currentLimit) || currentLimit < normalizedMinimumLimit) {
            parsedUrl.searchParams.set("limit", String(normalizedMinimumLimit));
        }

        return parsedUrl.toString();
    } catch (e) {
        return url;
    }
}

function buildHistoryEpisodesRequestUrl(url, shouldApply) {
    if (!shouldApply) {
        return url;
    }

    return buildMinimumLimitRequestUrl(url, HISTORY_EPISODES_LIMIT);
}

function buildRipppleHistoryRequestUrl(url, shouldApply) {
    if (!shouldApply) {
        return url;
    }

    return buildMinimumLimitRequestUrl(url, RIPPPLE_HISTORY_MIN_LIMIT);
}

function isHistoryEpisodesListUrl(url) {
    return /\/(?:users\/[^\/]+?\/history\/episodes|sync\/history\/episodes)\/?(?:\?|$)/.test(String(url ?? ""));
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

function filterHistoryEpisodesAcrossPages(arr, url, cache) {
    if (isNotArray(arr) || arr.length === 0 || !isHistoryEpisodesListUrl(url)) {
        return arr;
    }

    const nextCache = ensureObject(cache);
    const bucketKey = getHistoryEpisodesCacheBucketKey(url);
    const pageNumber = getHistoryEpisodesPageNumber(url);
    if (pageNumber === 1) {
        delete nextCache[bucketKey];
    }

    const bucket = ensureObject(nextCache[bucketKey], { shows: {} });
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

        if (!cachedShows[showKey]) {
            cachedShows[showKey] = createHistoryEpisodeCacheSnapshot(item);
        }
    });

    bucket.shows = cachedShows;
    nextCache[bucketKey] = bucket;

    return {
        filtered,
        cache: nextCache
    };
}

function keepLatestHistoryEpisodes(arr) {
    if (isNotArray(arr) || arr.length === 0) {
        return ensureArray(arr);
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

export {
    HISTORY_EPISODES_LIMIT,
    RIPPPLE_HISTORY_MIN_LIMIT,
    buildHistoryEpisodesRequestUrl,
    buildMinimumLimitRequestUrl,
    buildRipppleHistoryRequestUrl,
    createHistoryEpisodeCacheSnapshot,
    filterHistoryEpisodesAcrossPages,
    getHistoryEpisodeShowKey,
    getHistoryEpisodeSortKey,
    getHistoryEpisodesCacheBucketKey,
    getHistoryEpisodesPageNumber,
    isHistoryEpisodesListUrl,
    keepLatestHistoryEpisodes,
    parseQueryParams,
    parseUrlParts
};
