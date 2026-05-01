import * as commonUtils from "../utils/common.mjs";

const UNIFIED_CACHE_KEY = "dj_trakt_unified_cache";
const UNIFIED_CACHE_SCHEMA_VERSION = 2;
const UNIFIED_CACHE_MAX_BYTES = 1024 * 1024 - 8 * 1024;

function buildFieldTranslationCacheKey(id) {
    return commonUtils.isNullish(id) ? "" : String(id);
}

function estimatePrunableEntryBytes(env, key, entry) {
    const serialized = env.toStr({ [key]: entry }, "");
    return serialized ? Math.max(serialized.length - 2, 0) : 0;
}

function getHashedFieldTranslation(cache, id, field, sourceText) {
    const cacheKey = buildFieldTranslationCacheKey(id);
    if (!cacheKey) {
        return "";
    }

    const entry = cache?.[cacheKey];
    const fieldEntry = commonUtils.isPlainObject(entry?.[field]) ? entry[field] : null;
    return fieldEntry && String(fieldEntry.sourceTextHash ?? "") === commonUtils.computeStringHash(sourceText) ? String(fieldEntry.translatedText ?? "").trim() : "";
}

function setHashedFieldTranslation(cache, id, field, sourceText, translatedText) {
    const cacheKey = buildFieldTranslationCacheKey(id);
    const normalizedTranslation = String(translatedText ?? "").trim();
    if (!cacheKey || !normalizedTranslation) {
        return false;
    }

    const currentEntry = commonUtils.isPlainObject(cache?.[cacheKey]) ? cache[cacheKey] : {};
    const nextFieldEntry = {
        sourceTextHash: commonUtils.computeStringHash(sourceText),
        translatedText: normalizedTranslation,
    };
    const currentFieldEntry = commonUtils.isPlainObject(currentEntry[field]) ? currentEntry[field] : null;
    if (currentFieldEntry && currentFieldEntry.sourceTextHash === nextFieldEntry.sourceTextHash && currentFieldEntry.translatedText === nextFieldEntry.translatedText) {
        return false;
    }

    cache[cacheKey] = {
        ...currentEntry,
        [field]: nextFieldEntry,
        updatedAt: Date.now(),
    };
    return true;
}

function createEmptyUnifiedCache(schemaVersion = UNIFIED_CACHE_SCHEMA_VERSION, maxBytes = UNIFIED_CACHE_MAX_BYTES) {
    return {
        version: schemaVersion,
        updatedAt: Date.now(),
        maxBytes,
        trakt: {
            translation: {},
            historyEpisodesMergedByShow: {},
            linkIds: {},
        },
        google: {
            comments: {},
            sentiments: {},
            people: {},
            list: {},
        },
        persistent: {
            currentSeason: null,
        },
    };
}

function normalizeUpdatedAtEntryMap(cache) {
    const nextCache = {};
    const now = Date.now();

    Object.keys(commonUtils.ensureObject(cache)).forEach((key) => {
        const entry = commonUtils.ensureObject(cache[key], null);
        if (!entry) {
            return;
        }

        nextCache[key] = Number.isFinite(Number(entry.updatedAt)) ? entry : { ...entry, updatedAt: now };
    });

    return nextCache;
}

function normalizeUnifiedCache(rawCache, schemaVersion = UNIFIED_CACHE_SCHEMA_VERSION, maxBytes = UNIFIED_CACHE_MAX_BYTES) {
    const cache = commonUtils.isPlainObject(rawCache) ? rawCache : {};
    const nextCache = createEmptyUnifiedCache(schemaVersion, maxBytes);

    nextCache.updatedAt = Number.isFinite(Number(cache.updatedAt)) ? Number(cache.updatedAt) : nextCache.updatedAt;
    nextCache.maxBytes = Number.isFinite(Number(cache.maxBytes)) ? Number(cache.maxBytes) : maxBytes;

    const traktCache = commonUtils.ensureObject(cache.trakt);
    nextCache.trakt.translation = commonUtils.ensureObject(traktCache.translation);
    nextCache.trakt.historyEpisodesMergedByShow = normalizeUpdatedAtEntryMap(traktCache.historyEpisodesMergedByShow);
    nextCache.trakt.linkIds = normalizeUpdatedAtEntryMap(traktCache.linkIds);

    const googleCache = commonUtils.ensureObject(cache.google);
    nextCache.google.comments = normalizeUpdatedAtEntryMap(googleCache.comments);
    nextCache.google.sentiments = normalizeUpdatedAtEntryMap(googleCache.sentiments);
    nextCache.google.people = normalizeUpdatedAtEntryMap(googleCache.people);
    nextCache.google.list = normalizeUpdatedAtEntryMap(googleCache.list);

    const persistentCache = commonUtils.ensureObject(cache.persistent);
    nextCache.persistent.currentSeason = commonUtils.isPlainObject(persistentCache.currentSeason) ? persistentCache.currentSeason : null;

    return nextCache;
}

function estimateCacheBytes(env, value) {
    const serialized = env.toStr(value, "");
    return serialized ? serialized.length : 0;
}

function pruneUnifiedCacheToLimit(env, cache, schemaVersion = UNIFIED_CACHE_SCHEMA_VERSION, maxBytes = UNIFIED_CACHE_MAX_BYTES) {
    const nextCache = normalizeUnifiedCache(cache, schemaVersion, maxBytes);
    const limit = Number.isFinite(Number(nextCache.maxBytes)) ? Number(nextCache.maxBytes) : maxBytes;
    const prunableEntries = [];

    [
        ["trakt", "translation"],
        ["trakt", "historyEpisodesMergedByShow"],
        ["trakt", "linkIds"],
        ["google", "comments"],
        ["google", "sentiments"],
        ["google", "people"],
        ["google", "list"],
    ].forEach(([scope, bucket]) => {
        const entries = commonUtils.ensureObject(nextCache[scope][bucket]);
        Object.keys(entries).forEach((key) => {
            const entry = commonUtils.ensureObject(entries[key], null);
            if (!entry) {
                return;
            }

            prunableEntries.push({
                scope,
                bucket,
                key,
                updatedAt: Number.isFinite(Number(entry.updatedAt)) ? Number(entry.updatedAt) : 0,
                estimatedBytes: estimatePrunableEntryBytes(env, key, entry),
            });
        });
    });

    prunableEntries.sort((a, b) => a.updatedAt - b.updatedAt);

    let estimatedBytes = estimateCacheBytes(env, nextCache);
    while (estimatedBytes > limit && prunableEntries.length > 0) {
        const target = prunableEntries.shift();
        if (!target) {
            break;
        }

        delete nextCache[target.scope][target.bucket][target.key];
        estimatedBytes = Math.max(estimatedBytes - target.estimatedBytes, 0);
    }

    while (estimateCacheBytes(env, nextCache) > limit && prunableEntries.length > 0) {
        const target = prunableEntries.shift();
        if (!target) {
            break;
        }

        delete nextCache[target.scope][target.bucket][target.key];
    }

    nextCache.updatedAt = Date.now();
    return nextCache;
}

function loadUnifiedCache(env, unifiedCacheKey = UNIFIED_CACHE_KEY, unifiedCacheSchemaVersion = UNIFIED_CACHE_SCHEMA_VERSION, unifiedCacheMaxBytes = UNIFIED_CACHE_MAX_BYTES) {
    try {
        const cache = env.getjson(unifiedCacheKey, null);
        if (!commonUtils.isPlainObject(cache) || Number(cache.version) !== unifiedCacheSchemaVersion) {
            const nextCache = createEmptyUnifiedCache(unifiedCacheSchemaVersion, unifiedCacheMaxBytes);
            saveUnifiedCache(env, nextCache, unifiedCacheKey, unifiedCacheSchemaVersion, unifiedCacheMaxBytes);
            return nextCache;
        }

        const normalizedCache = normalizeUnifiedCache(cache, unifiedCacheSchemaVersion, unifiedCacheMaxBytes);
        if (env.toStr(cache, "") !== env.toStr(normalizedCache, "")) {
            saveUnifiedCache(env, normalizedCache, unifiedCacheKey, unifiedCacheSchemaVersion, unifiedCacheMaxBytes);
        }

        return normalizedCache;
    } catch (error) {
        env.log(`Trakt unified cache load failed: ${error}`);
        const nextCache = createEmptyUnifiedCache(unifiedCacheSchemaVersion, unifiedCacheMaxBytes);
        saveUnifiedCache(env, nextCache, unifiedCacheKey, unifiedCacheSchemaVersion, unifiedCacheMaxBytes);
        return nextCache;
    }
}

function saveUnifiedCache(
    env,
    cache,
    unifiedCacheKey = UNIFIED_CACHE_KEY,
    unifiedCacheSchemaVersion = UNIFIED_CACHE_SCHEMA_VERSION,
    unifiedCacheMaxBytes = UNIFIED_CACHE_MAX_BYTES,
) {
    try {
        env.setjson(pruneUnifiedCacheToLimit(env, cache, unifiedCacheSchemaVersion, unifiedCacheMaxBytes), unifiedCacheKey);
    } catch (error) {
        env.log(`Trakt unified cache save failed: ${error}`);
    }
}

function loadCache(env) {
    return commonUtils.ensureObject(loadUnifiedCache(env).trakt.translation);
}

function saveCache(env, cache) {
    const unifiedCache = loadUnifiedCache(env);
    unifiedCache.trakt.translation = commonUtils.ensureObject(cache);
    saveUnifiedCache(env, unifiedCache);
}

function loadHistoryEpisodesMergedByShowCache(env) {
    return commonUtils.ensureObject(loadUnifiedCache(env).trakt.historyEpisodesMergedByShow);
}

function saveHistoryEpisodesMergedByShowCache(env, cache) {
    const unifiedCache = loadUnifiedCache(env);
    unifiedCache.trakt.historyEpisodesMergedByShow = normalizeUpdatedAtEntryMap(cache);
    saveUnifiedCache(env, unifiedCache);
}

function loadLinkIdsCache(env) {
    return commonUtils.ensureObject(loadUnifiedCache(env).trakt.linkIds);
}

function saveLinkIdsCache(env, cache) {
    const unifiedCache = loadUnifiedCache(env);
    unifiedCache.trakt.linkIds = normalizeUpdatedAtEntryMap(cache);
    saveUnifiedCache(env, unifiedCache);
}

function loadCommentTranslationCache(env) {
    return commonUtils.ensureObject(loadUnifiedCache(env).google.comments);
}

function saveCommentTranslationCache(env, cache) {
    const unifiedCache = loadUnifiedCache(env);
    unifiedCache.google.comments = normalizeUpdatedAtEntryMap(cache);
    saveUnifiedCache(env, unifiedCache);
}

function loadSentimentTranslationCache(env) {
    return commonUtils.ensureObject(loadUnifiedCache(env).google.sentiments);
}

function saveSentimentTranslationCache(env, cache) {
    const unifiedCache = loadUnifiedCache(env);
    unifiedCache.google.sentiments = normalizeUpdatedAtEntryMap(cache);
    saveUnifiedCache(env, unifiedCache);
}

function loadPeopleTranslationCache(env) {
    return commonUtils.ensureObject(loadUnifiedCache(env).google.people);
}

function savePeopleTranslationCache(env, cache) {
    const unifiedCache = loadUnifiedCache(env);
    unifiedCache.google.people = normalizeUpdatedAtEntryMap(cache);
    saveUnifiedCache(env, unifiedCache);
}

function loadListTranslationCache(env) {
    return commonUtils.ensureObject(loadUnifiedCache(env).google.list);
}

function saveListTranslationCache(env, cache) {
    const unifiedCache = loadUnifiedCache(env);
    unifiedCache.google.list = normalizeUpdatedAtEntryMap(cache);
    saveUnifiedCache(env, unifiedCache);
}

function setCurrentSeason(env, showId, seasonNumber) {
    if (commonUtils.isNullish(showId) || commonUtils.isNullish(seasonNumber)) {
        return;
    }

    const unifiedCache = loadUnifiedCache(env);
    unifiedCache.persistent.currentSeason = {
        showId: String(showId),
        seasonNumber: Number(seasonNumber),
    };
    saveUnifiedCache(env, unifiedCache);
}

function clearCurrentSeason(env) {
    const unifiedCache = loadUnifiedCache(env);
    unifiedCache.persistent.currentSeason = null;
    saveUnifiedCache(env, unifiedCache);
}

function getCurrentSeason(env, showId) {
    if (commonUtils.isNullish(showId)) {
        return 1;
    }

    try {
        const cache = loadUnifiedCache(env).persistent.currentSeason;
        return commonUtils.isPlainObject(cache) &&
            commonUtils.isNonNullish(cache.showId) &&
            commonUtils.isNonNullish(cache.seasonNumber) &&
            String(cache.showId) === String(showId) &&
            Number.isFinite(Number(cache.seasonNumber))
            ? Number(cache.seasonNumber)
            : 1;
    } catch (error) {
        env.log(`Trakt current season cache load failed: ${error}`);
        return 1;
    }
}

export {
    UNIFIED_CACHE_KEY,
    UNIFIED_CACHE_MAX_BYTES,
    UNIFIED_CACHE_SCHEMA_VERSION,
    clearCurrentSeason,
    buildFieldTranslationCacheKey,
    createEmptyUnifiedCache,
    getCurrentSeason,
    getHashedFieldTranslation,
    loadCache,
    loadCommentTranslationCache,
    loadHistoryEpisodesMergedByShowCache,
    loadLinkIdsCache,
    loadListTranslationCache,
    loadPeopleTranslationCache,
    loadSentimentTranslationCache,
    loadUnifiedCache,
    normalizeUnifiedCache,
    normalizeUpdatedAtEntryMap,
    pruneUnifiedCacheToLimit,
    saveCache,
    setHashedFieldTranslation,
    saveCommentTranslationCache,
    saveHistoryEpisodesMergedByShowCache,
    saveLinkIdsCache,
    saveListTranslationCache,
    savePeopleTranslationCache,
    saveSentimentTranslationCache,
    saveUnifiedCache,
    setCurrentSeason,
};
