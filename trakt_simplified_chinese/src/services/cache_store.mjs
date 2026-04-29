import {
    ensureObject,
    isNonNullish,
    isNullish,
    isPlainObject
} from "../utils.mjs";

function createEmptyUnifiedCache(schemaVersion, maxBytes) {
    return {
        version: schemaVersion,
        updatedAt: Date.now(),
        maxBytes,
        trakt: {
            translation: {},
            historyEpisode: {},
            linkIds: {}
        },
        google: {
            comments: {},
            sentiments: {},
            people: {},
            listText: {}
        },
        persistent: {
            currentSeason: null
        }
    };
}

function normalizeUpdatedAtEntryMap(cache) {
    const nextCache = {};
    const now = Date.now();

    Object.keys(ensureObject(cache)).forEach((key) => {
        const entry = ensureObject(cache[key], null);
        if (!entry) {
            return;
        }

        nextCache[key] = Number.isFinite(Number(entry.updatedAt))
            ? entry
            : { ...entry, updatedAt: now };
    });

    return nextCache;
}

function normalizeUnifiedCache(rawCache, schemaVersion, maxBytes) {
    const cache = isPlainObject(rawCache) ? rawCache : {};
    const nextCache = createEmptyUnifiedCache(schemaVersion, maxBytes);

    nextCache.updatedAt = Number.isFinite(Number(cache.updatedAt))
        ? Number(cache.updatedAt)
        : nextCache.updatedAt;
    nextCache.maxBytes = Number.isFinite(Number(cache.maxBytes))
        ? Number(cache.maxBytes)
        : maxBytes;

    const traktCache = ensureObject(cache.trakt);
    nextCache.trakt.translation = ensureObject(traktCache.translation);
    nextCache.trakt.historyEpisode = normalizeUpdatedAtEntryMap(traktCache.historyEpisode);
    nextCache.trakt.linkIds = normalizeUpdatedAtEntryMap(traktCache.linkIds);

    const googleCache = ensureObject(cache.google);
    nextCache.google.comments = normalizeUpdatedAtEntryMap(googleCache.comments);
    nextCache.google.sentiments = normalizeUpdatedAtEntryMap(googleCache.sentiments);
    nextCache.google.people = normalizeUpdatedAtEntryMap(googleCache.people);
    nextCache.google.listText = normalizeUpdatedAtEntryMap(googleCache.listText);

    const persistentCache = ensureObject(cache.persistent);
    nextCache.persistent.currentSeason = isPlainObject(persistentCache.currentSeason)
        ? persistentCache.currentSeason
        : null;

    return nextCache;
}

function createCacheStore(options) {
    const {
        scriptContext,
        unifiedCacheKey,
        unifiedCacheSchemaVersion,
        unifiedCacheMaxBytes,
        legacyCacheKeys
    } = options;

    let didClearLegacyCacheKeys = false;

    function estimateCacheBytes(value) {
        const serialized = scriptContext.env.toStr(value, "");
        return serialized ? serialized.length : 0;
    }

    function pruneUnifiedCacheToLimit(cache) {
        const nextCache = normalizeUnifiedCache(cache, unifiedCacheSchemaVersion, unifiedCacheMaxBytes);
        const maxBytes = Number.isFinite(Number(nextCache.maxBytes))
            ? Number(nextCache.maxBytes)
            : unifiedCacheMaxBytes;
        const prunableEntries = [];

        [
            ["trakt", "translation"],
            ["trakt", "historyEpisode"],
            ["trakt", "linkIds"],
            ["google", "comments"],
            ["google", "sentiments"],
            ["google", "people"],
            ["google", "listText"]
        ].forEach(([scope, bucket]) => {
            const entries = ensureObject(nextCache?.[scope]?.[bucket]);
            Object.keys(entries).forEach((key) => {
                const entry = ensureObject(entries[key], null);
                if (!entry) {
                    return;
                }

                prunableEntries.push({
                    scope,
                    bucket,
                    key,
                    updatedAt: Number.isFinite(Number(entry.updatedAt)) ? Number(entry.updatedAt) : 0
                });
            });
        });

        prunableEntries.sort((a, b) => a.updatedAt - b.updatedAt);

        while (estimateCacheBytes(nextCache) > maxBytes && prunableEntries.length > 0) {
            const target = prunableEntries.shift();
            if (!target) {
                break;
            }

            delete nextCache[target.scope][target.bucket][target.key];
        }

        nextCache.updatedAt = Date.now();
        return nextCache;
    }

    function saveUnifiedCache(cache) {
        try {
            scriptContext.env.setjson(pruneUnifiedCacheToLimit(cache), unifiedCacheKey);
        } catch (e) {
            scriptContext.log(`Trakt unified cache save failed: ${e}`);
        }
    }

    function clearLegacyCacheKeys() {
        if (didClearLegacyCacheKeys) {
            return;
        }

        didClearLegacyCacheKeys = true;
        legacyCacheKeys.forEach((key) => {
            try {
                scriptContext.env.setdata(null, key);
            } catch (e) {
                scriptContext.log(`Trakt legacy cache clear failed for key=${key}: ${e}`);
            }
        });
    }

    function loadUnifiedCache() {
        clearLegacyCacheKeys();

        try {
            const cache = scriptContext.env.getjson(unifiedCacheKey, null);
            if (!isPlainObject(cache) || Number(cache.version) !== unifiedCacheSchemaVersion) {
                const nextCache = createEmptyUnifiedCache(unifiedCacheSchemaVersion, unifiedCacheMaxBytes);
                saveUnifiedCache(nextCache);
                return nextCache;
            }

            const normalizedCache = normalizeUnifiedCache(cache, unifiedCacheSchemaVersion, unifiedCacheMaxBytes);
            if (scriptContext.env.toStr(cache, "") !== scriptContext.env.toStr(normalizedCache, "")) {
                saveUnifiedCache(normalizedCache);
            }

            return normalizedCache;
        } catch (e) {
            scriptContext.log(`Trakt unified cache load failed: ${e}`);
            const nextCache = createEmptyUnifiedCache(unifiedCacheSchemaVersion, unifiedCacheMaxBytes);
            saveUnifiedCache(nextCache);
            return nextCache;
        }
    }

    function loadCache() {
        return ensureObject(loadUnifiedCache().trakt.translation);
    }

    function saveCache(cache) {
        const unifiedCache = loadUnifiedCache();
        unifiedCache.trakt.translation = ensureObject(cache);
        saveUnifiedCache(unifiedCache);
    }

    function loadHistoryEpisodeCache() {
        return ensureObject(loadUnifiedCache().trakt.historyEpisode);
    }

    function saveHistoryEpisodeCache(cache) {
        const unifiedCache = loadUnifiedCache();
        unifiedCache.trakt.historyEpisode = normalizeUpdatedAtEntryMap(cache);
        saveUnifiedCache(unifiedCache);
    }

    function loadLinkIdsCache() {
        return ensureObject(loadUnifiedCache().trakt.linkIds);
    }

    function saveLinkIdsCache(cache) {
        const unifiedCache = loadUnifiedCache();
        unifiedCache.trakt.linkIds = normalizeUpdatedAtEntryMap(cache);
        saveUnifiedCache(unifiedCache);
    }

    function loadCommentTranslationCache() {
        return ensureObject(loadUnifiedCache().google.comments);
    }

    function saveCommentTranslationCache(cache) {
        const unifiedCache = loadUnifiedCache();
        unifiedCache.google.comments = normalizeUpdatedAtEntryMap(cache);
        saveUnifiedCache(unifiedCache);
    }

    function loadSentimentTranslationCache() {
        return ensureObject(loadUnifiedCache().google.sentiments);
    }

    function saveSentimentTranslationCache(cache) {
        const unifiedCache = loadUnifiedCache();
        unifiedCache.google.sentiments = normalizeUpdatedAtEntryMap(cache);
        saveUnifiedCache(unifiedCache);
    }

    function loadPeopleTranslationCache() {
        return ensureObject(loadUnifiedCache().google.people);
    }

    function savePeopleTranslationCache(cache) {
        const unifiedCache = loadUnifiedCache();
        unifiedCache.google.people = normalizeUpdatedAtEntryMap(cache);
        saveUnifiedCache(unifiedCache);
    }

    function loadListTextTranslationCache() {
        return ensureObject(loadUnifiedCache().google.listText);
    }

    function saveListTextTranslationCache(cache) {
        const unifiedCache = loadUnifiedCache();
        unifiedCache.google.listText = normalizeUpdatedAtEntryMap(cache);
        saveUnifiedCache(unifiedCache);
    }

    function setCurrentSeason(showId, seasonNumber) {
        if (isNullish(showId) || isNullish(seasonNumber)) {
            return;
        }

        const unifiedCache = loadUnifiedCache();
        unifiedCache.persistent.currentSeason = {
            showId: String(showId),
            seasonNumber: Number(seasonNumber)
        };
        saveUnifiedCache(unifiedCache);
    }

    function clearCurrentSeason() {
        const unifiedCache = loadUnifiedCache();
        unifiedCache.persistent.currentSeason = null;
        saveUnifiedCache(unifiedCache);
    }

    function getCurrentSeason(showId) {
        if (isNullish(showId)) {
            return 1;
        }

        try {
            const cache = loadUnifiedCache().persistent.currentSeason;
            return (
                isPlainObject(cache) &&
                isNonNullish(cache.showId) &&
                isNonNullish(cache.seasonNumber) &&
                String(cache.showId) === String(showId) &&
                Number.isFinite(Number(cache.seasonNumber))
            )
                ? Number(cache.seasonNumber)
                : 1;
        } catch (e) {
            scriptContext.log(`Trakt current season cache load failed: ${e}`);
            return 1;
        }
    }

    return {
        clearCurrentSeason,
        createEmptyUnifiedCache,
        getCurrentSeason,
        loadCache,
        loadCommentTranslationCache,
        loadHistoryEpisodeCache,
        loadLinkIdsCache,
        loadListTextTranslationCache,
        loadPeopleTranslationCache,
        loadSentimentTranslationCache,
        loadUnifiedCache,
        normalizeUpdatedAtEntryMap,
        normalizeUnifiedCache,
        saveCache,
        saveCommentTranslationCache,
        saveHistoryEpisodeCache,
        saveLinkIdsCache,
        saveListTextTranslationCache,
        savePeopleTranslationCache,
        saveSentimentTranslationCache,
        saveUnifiedCache,
        setCurrentSeason
    };
}

export {
    createCacheStore,
    createEmptyUnifiedCache,
    normalizeUnifiedCache,
    normalizeUpdatedAtEntryMap
};
