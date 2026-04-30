import { MEDIA_TYPE } from "../../shared/media-types.mjs";
import {
    cloneObject,
    ensureArray,
    ensureObject,
    isNonNullish,
    isNotArray,
    isNullish,
    isPlainObject
} from "../../shared/common.mjs";

function createLinkIdsService(deps) {
    const {
        traktApiClient,
        loadLinkIdsCache,
        saveLinkIdsCache
    } = deps;

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

    async function ensureMediaIdsCacheEntry(linkCache, mediaType, traktId) {
        if (!linkCache || isNullish(traktId)) {
            return null;
        }

        let entry = getLinkIdsCacheEntry(linkCache, traktId);
        if (entry?.ids && isNonNullish(entry.ids.tmdb)) {
            return entry;
        }

        const payload = await traktApiClient.fetchMediaDetail(mediaType, traktId);
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

        if (isNonNullish(episodeEntry.showIds.tmdb) || isNullish(episodeEntry.showIds.trakt)) {
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

    return {
        cacheEpisodeIdsFromSeasonList,
        cacheMediaIdsFromDetailResponse,
        ensureEpisodeShowIds,
        ensureMediaIdsCacheEntry,
        getLinkIdsCacheEntry,
        loadLinkIdsCache,
        saveLinkIdsCache
    };
}

export {
    createLinkIdsService
};
