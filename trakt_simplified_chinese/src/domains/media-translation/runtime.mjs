import { CACHE_STATUS, normalizeTranslationPayload } from "./translations.mjs";
import { MEDIA_TYPE } from "../../shared/media-types.mjs";
import { ensureArray, isArray, isNonNullish, isNullish } from "../../shared/common.mjs";

function createMediaTranslationRuntime(deps) {
    const {
        mediaConfig,
        scriptContext,
        saveCache,
        traktApiClient,
        vercelBackendClient
    } = deps;

    function createCacheEntry(status, translation) {
        return {
            status,
            translation,
            updatedAt: Date.now()
        };
    }

    function buildEpisodeCompositeKey(showId, seasonNumber, episodeNumber) {
        if (isNullish(showId) || isNullish(seasonNumber) || isNullish(episodeNumber)) {
            return "";
        }

        return `${showId}:${seasonNumber}:${episodeNumber}`;
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
        return lookupKey ? `${mediaType}:${lookupKey}` : "";
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

        cache[cacheKey] = (status === CACHE_STATUS.FOUND || status === CACHE_STATUS.PARTIAL_FOUND) && translation
            ? createCacheEntry(status, translation)
            : createCacheEntry(CACHE_STATUS.NOT_FOUND, translation);

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
        return !!(availableTranslations.length > 0 && !hasZhAvailableTranslation(availableTranslations));
    }

    function getMissingRefs(cache, mediaType, refs) {
        return refs.filter((ref) => {
            return ref &&
                buildMediaCacheLookupKey(mediaType, ref) &&
                !shouldSkipTranslationLookup(ref) &&
                !getCachedTranslation(cache, mediaType, ref);
        });
    }

    function fetchTranslationsFromBackend(cache, refsByType) {
        return vercelBackendClient.fetchTranslationsFromBackend(cache, storeTranslationEntry, saveCache, refsByType);
    }

    function queueBackendWrite(mediaType, ref, entry) {
        vercelBackendClient.queueBackendWrite(mediaType, buildMediaCacheLookupKey(mediaType, ref), entry);
    }

    function flushBackendWrites() {
        vercelBackendClient.flushBackendWrites();
    }

    function fetchDirectTranslation(mediaType, ref) {
        return traktApiClient.fetchDirectTranslation(mediaType, ref, mediaConfig);
    }

    function isScriptInitiatedTranslationRequest() {
        return traktApiClient.isScriptInitiatedTranslationRequest();
    }

    function applyTranslation(target, entry) {
        if (!target || !entry?.translation) {
            return;
        }

        if (entry.translation.title) {
            target.title = entry.translation.title;
            if (/^Rippple/i.test(String(scriptContext.request?.headers?.["user-agent"] ?? "").trim())) {
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

    return {
        applyTranslation,
        buildEpisodeCompositeKey,
        buildMediaCacheLookupKey,
        fetchDirectTranslation,
        fetchTranslationsFromBackend,
        flushBackendWrites,
        getCachedTranslation,
        getMissingRefs,
        isScriptInitiatedTranslationRequest,
        queueBackendWrite,
        storeTranslationEntry
    };
}

export {
    createMediaTranslationRuntime
};
