import { MEDIA_TYPE } from "../../shared/media-types.mjs";
import {
    areTranslationsEqual,
    extractNormalizedTranslation,
    normalizeTranslations,
    sortTranslations
} from "./translations.mjs";
import {
    ensureArray,
    isArray,
    isNonNullish,
    isNotArray,
    isNullish,
    isPlainObject
} from "../../shared/common.mjs";

const REQUEST_BATCH_SIZE = 10;
const SEASON_EPISODE_TRANSLATION_LIMIT = 10;
const TRAKT_DIRECT_TRANSLATION_MAX_REFS = 200;
const PREFERRED_TRANSLATION_LANGUAGE = "zh-CN";

const DIRECT_MEDIA_TYPE_SHOW_STATUSES = [
    "returning series",
    "ended",
    "canceled"
];

const DIRECT_MEDIA_TYPE_MOVIE_STATUSES = [
    "released",
    "post production",
    "in production"
];

const DIRECT_MEDIA_ORIGINAL_KEY = "__directOriginal";

function createMediaTranslationHandlers(deps) {
    const {
        scriptContext,
        body,
        requestUrl,
        mediaConfig,
        normalizeUrlPath,
        loadCache,
        saveCache,
        loadLinkIdsCache,
        saveLinkIdsCache,
        getCurrentSeason,
        clearCurrentSeason,
        setCurrentSeason,
        buildEpisodeCompositeKey,
        buildMediaCacheLookupKey,
        getCachedTranslation,
        getMissingRefs,
        applyTranslation,
        cacheMediaIdsFromDetailResponse,
        cacheEpisodeIdsFromSeasonList,
        fetchTranslationsFromBackend,
        fetchDirectTranslation,
        storeTranslationEntry,
        queueBackendWrite,
        flushBackendWrites,
        isScriptInitiatedTranslationRequest
    } = deps;

    function createMediaCollection() {
        return Object.keys(mediaConfig).reduce((collection, mediaType) => {
            collection[mediaType] = [];
            return collection;
        }, {});
    }

    function resolveTranslationRequestTarget(url) {
        const normalizedPath = normalizeUrlPath(url);
        let match = normalizedPath.match(/^\/shows\/(\d+)\/translations\/zh$/);
        if (match) {
            return { mediaType: MEDIA_TYPE.SHOW, traktId: match[1] };
        }

        match = normalizedPath.match(/^\/movies\/(\d+)\/translations\/zh$/);
        if (match) {
            return { mediaType: MEDIA_TYPE.MOVIE, traktId: match[1] };
        }

        match = normalizedPath.match(/^\/shows\/(\d+)\/seasons\/(\d+)\/episodes\/(\d+)\/translations\/zh$/);
        return match ? {
            mediaType: MEDIA_TYPE.EPISODE,
            showId: match[1],
            seasonNumber: match[2],
            episodeNumber: match[3]
        } : null;
    }

    function resolveMediaDetailTarget(url, data, mediaType) {
        if (mediaType === MEDIA_TYPE.EPISODE) {
            const match = normalizeUrlPath(url).match(/^\/shows\/(\d+)\/seasons\/(\d+)\/episodes\/(\d+)$/);
            return match ? {
                mediaType: MEDIA_TYPE.EPISODE,
                showId: match[1],
                seasonNumber: match[2],
                episodeNumber: match[3]
            } : null;
        }

        return isNonNullish(data?.ids?.trakt) ? { mediaType, traktId: data.ids.trakt } : null;
    }

    function resolveCurrentSeasonTarget(url) {
        const match = normalizeUrlPath(url).match(/^\/shows\/(\d+)\/seasons\/(\d+)$/);
        return match ? { showId: match[1], seasonNumber: Number(match[2]) } : null;
    }

    function resolveSeasonListTarget(url) {
        const match = normalizeUrlPath(url).match(/^\/shows\/(\d+)\/seasons$/);
        return match ? { showId: match[1] } : null;
    }

    function collectUniqueRef(target, seen, ref) {
        const mediaType = ref?.mediaType ?? null;
        const key = mediaType ? buildMediaCacheLookupKey(mediaType, ref) : "";
        if (key && !seen[key]) {
            seen[key] = true;
            target.push(ref);
        }
    }

    function getItemMediaTarget(item, mediaType) {
        if (mediaType === MEDIA_TYPE.EPISODE) {
            return item?.episode ?? item?.progress?.next_episode ?? null;
        }
        return item?.[mediaType] ?? null;
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
            showId,
            seasonNumber,
            episodeNumber,
            backendLookupKey: buildEpisodeCompositeKey(showId, seasonNumber, episodeNumber),
            availableTranslations: isArray(episode.available_translations) ? episode.available_translations : null
        };
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
            mediaType,
            traktId,
            backendLookupKey: String(traktId),
            availableTranslations: isArray(target.available_translations) ? target.available_translations : null
        };
    }

    function collectMediaRefs(arr) {
        const seenRefsByType = createMediaCollection();
        const refsByType = createMediaCollection();
        arr.forEach((item) => {
            Object.keys(mediaConfig).forEach((mediaType) => {
                collectUniqueRef(refsByType[mediaType], seenRefsByType[mediaType], buildMediaRef(item, mediaType));
            });
        });
        return refsByType;
    }

    function applyTranslationsToItems(arr, cache) {
        arr.forEach((item) => {
            Object.keys(mediaConfig).forEach((mediaType) => {
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
            Object.keys(mediaConfig).forEach((mediaType) => {
                missingRefsByType[mediaType] = getMissingRefs(cache, mediaType, refsByType[mediaType] ?? []);
            });
            await fetchTranslationsFromBackend(cache, missingRefsByType);
        } catch (e) {
            scriptContext.log(`Trakt backend cache read failed: ${e}`);
        }
    }

    async function processInBatches(items, worker) {
        for (let i = 0; i < items.length; i += REQUEST_BATCH_SIZE) {
            await Promise.all(items.slice(i, i + REQUEST_BATCH_SIZE).map((item) => worker(item)));
        }
    }

    async function fetchAndPersistMissing(cache, mediaType, refs, logLabel) {
        await processInBatches(refs, async (ref) => {
            try {
                const merged = await fetchDirectTranslation(mediaType, ref);
                storeTranslationEntry(cache, mediaType, ref, merged);
                queueBackendWrite(mediaType, ref, merged);
            } catch (e) {
                scriptContext.log(`Trakt ${logLabel} translation fetch failed for key=${buildMediaCacheLookupKey(mediaType, ref)}: ${e}`);
            }
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
        for (const mediaType of Object.keys(mediaConfig)) {
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

    function resolveDirectMediaTypeFromItem(item) {
        if (!isPlainObject(item) || isNullish(item?.ids?.trakt)) {
            return null;
        }

        if (isNonNullish(item.first_aired) || isNonNullish(item.network) || isPlainObject(item.airs) || isNonNullish(item.aired_episodes)) {
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
        return isNonNullish(item.tagline) ? MEDIA_TYPE.MOVIE : null;
    }

    function wrapDirectMediaItems(arr) {
        const wrapped = [];
        for (const item of arr) {
            const mediaType = resolveDirectMediaTypeFromItem(item);
            wrapped.push(mediaType ? { [mediaType]: item } : { [DIRECT_MEDIA_ORIGINAL_KEY]: item });
        }
        return wrapped;
    }

    function unwrapDirectMediaItems(arr) {
        return arr.map((item) => {
            for (const mediaType of Object.keys(mediaConfig)) {
                if (item?.[mediaType]) {
                    return item[mediaType];
                }
            }
            return item?.[DIRECT_MEDIA_ORIGINAL_KEY] ?? item;
        });
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
            scriptContext.done({ body: sourceBody });
            return;
        }

        const wrappedItems = wrapDirectMediaItems(parsed);
        await translateMediaItemsInPlace(wrappedItems, logLabel);
        scriptContext.done({ body: JSON.stringify(unwrapDirectMediaItems(wrappedItems)) });
    }

    async function handleWrapperMediaList(logLabel, bodyOverride) {
        const sourceBody = isNonNullish(bodyOverride) ? bodyOverride : body;
        scriptContext.done({ body: await processWrappedMediaItems(logLabel, sourceBody) });
    }

    async function handleMonthlyReview() {
        const data = JSON.parse(body);
        const firstWatched = data?.first_watched;
        if (!isPlainObject(data) || !isPlainObject(firstWatched) || (!firstWatched.show && !firstWatched.movie && !firstWatched.episode)) {
            scriptContext.done({});
            return;
        }

        const translated = JSON.parse(await processWrappedMediaItems("mir", JSON.stringify([firstWatched])));
        const translatedItem = isArray(translated) ? translated[0] : null;
        if (!translatedItem || typeof translatedItem !== "object") {
            scriptContext.done({});
            return;
        }

        Object.keys(mediaConfig).forEach((mediaType) => {
            if (firstWatched[mediaType] && translatedItem[mediaType]) {
                firstWatched[mediaType] = translatedItem[mediaType];
            }
        });
        scriptContext.done({ body: JSON.stringify(data) });
    }

    async function handleMediaDetail(mediaType) {
        const data = JSON.parse(body);
        if (!isPlainObject(data)) {
            scriptContext.done({});
            return;
        }

        const ref = resolveMediaDetailTarget(requestUrl, data, mediaType);
        if (!ref || !buildMediaCacheLookupKey(mediaType, ref)) {
            scriptContext.done({});
            return;
        }

        const linkCache = loadLinkIdsCache();
        if (cacheMediaIdsFromDetailResponse(linkCache, mediaType, ref, data)) {
            saveLinkIdsCache(linkCache);
        }

        const cache = loadCache();
        applyTranslation(data, getCachedTranslation(cache, mediaType, ref));
        scriptContext.done({ body: JSON.stringify(data) });
    }

    function handleTranslations() {
        const arr = JSON.parse(body);
        if (isNotArray(arr) || arr.length === 0) {
            scriptContext.done({});
            return;
        }

        const merged = normalizeTranslations(sortTranslations(arr, PREFERRED_TRANSLATION_LANGUAGE));
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

        scriptContext.done({ body: JSON.stringify(merged) });
    }

    function handleCurrentSeasonRequest() {
        const target = resolveCurrentSeasonTarget(requestUrl);
        if (!target) {
            scriptContext.done({});
            return;
        }

        setCurrentSeason(target.showId, target.seasonNumber);
        scriptContext.done({});
    }

    async function handleSeasonEpisodesList() {
        try {
            const target = resolveSeasonListTarget(requestUrl);
            const seasons = JSON.parse(body);
            if (!target || isNotArray(seasons) || seasons.length === 0) {
                scriptContext.done({});
                return;
            }

            const linkCache = loadLinkIdsCache();
            if (cacheEpisodeIdsFromSeasonList(linkCache, target.showId, seasons)) {
                saveLinkIdsCache(linkCache);
            }

            const currentSeasonNumber = getCurrentSeason(target.showId);
            const targetSeason = seasons.find((item) => {
                return ensureArray(item?.episodes).some((episode) => Number(episode?.season) === currentSeasonNumber);
            });
            if (!targetSeason) {
                scriptContext.done({});
                return;
            }

            const cache = loadCache();
            const allEpisodeRefs = seasons.flatMap((item) => {
                return ensureArray(item?.episodes).map((episode) => ({
                    mediaType: MEDIA_TYPE.EPISODE,
                    showId: target.showId,
                    seasonNumber: episode?.season ?? null,
                    episodeNumber: episode?.number ?? null,
                    backendLookupKey: buildEpisodeCompositeKey(target.showId, episode?.season ?? null, episode?.number ?? null),
                    availableTranslations: isArray(episode?.available_translations) ? episode.available_translations : null,
                    seasonFirstAired: item?.first_aired ?? null,
                    episodeFirstAired: episode?.first_aired ?? null
                }));
            }).filter((ref) => !!buildMediaCacheLookupKey(MEDIA_TYPE.EPISODE, ref));

            await hydrateFromBackend(cache, { show: [], movie: [], episode: allEpisodeRefs });

            const missingEpisodeRefs = getMissingRefs(cache, MEDIA_TYPE.EPISODE, allEpisodeRefs).filter((ref) => {
                return isNonNullish(ref?.seasonFirstAired) && isNonNullish(ref?.episodeFirstAired);
            });
            const prioritizedEpisodeRefs = missingEpisodeRefs
                .map((ref, index) => ({ ref, index }))
                .sort((left, right) => {
                    const leftSeason = Number(left.ref?.seasonNumber);
                    const rightSeason = Number(right.ref?.seasonNumber);
                    const leftBucket = leftSeason === currentSeasonNumber ? 0 : leftSeason > currentSeasonNumber ? 1 : 2;
                    const rightBucket = rightSeason === currentSeasonNumber ? 0 : rightSeason > currentSeasonNumber ? 1 : 2;
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

            await fetchAndPersistMissing(cache, MEDIA_TYPE.EPISODE, prioritizedEpisodeRefs, "season episode");
            saveCache(cache);
            flushBackendWrites();

            seasons.forEach((season) => {
                ensureArray(season?.episodes).forEach((episode) => {
                    applyTranslation(episode, getCachedTranslation(cache, MEDIA_TYPE.EPISODE, {
                        mediaType: MEDIA_TYPE.EPISODE,
                        showId: target.showId,
                        seasonNumber: episode?.season ?? null,
                        episodeNumber: episode?.number ?? null
                    }));
                });
            });

            scriptContext.done({ body: JSON.stringify(seasons) });
        } finally {
            clearCurrentSeason();
        }
    }

    return {
        handleCurrentSeasonRequest,
        handleDirectMediaList,
        handleMediaDetail,
        handleMonthlyReview,
        handleSeasonEpisodesList,
        handleTranslations,
        handleWrapperMediaList,
        translateMediaItemsInPlace
    };
}

export {
    createMediaTranslationHandlers,
    TRAKT_DIRECT_TRANSLATION_MAX_REFS
};
