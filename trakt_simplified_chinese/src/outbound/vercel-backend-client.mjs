import { MEDIA_TYPE } from "../shared/media-types.mjs";
import { ensureArray, ensureObject, isNonNullish } from "../shared/common.mjs";

const DEFAULT_BACKEND_BASE_URL = "https://loon-plugins.demojameson.de5.net";
const BACKEND_FETCH_MIN_REFS = 3;
const BACKEND_WRITE_BATCH_SIZE = 50;

function createVercelBackendClient(deps) {
    const {
        backendBaseUrl,
        backendFetchMinRefs,
        backendWriteBatchSize,
        mediaConfig,
        fetchJson,
        postJson
    } = deps;

    function getMediaBackendField(mediaType) {
        return `${mediaType}s`;
    }

    function getBackendFieldIds(refs) {
        return refs.map((ref) => {
            if (isNonNullish(ref?.backendLookupKey)) {
                return String(ref.backendLookupKey);
            }
            if (isNonNullish(ref?.traktId)) {
                return String(ref.traktId);
            }
            return "";
        }).filter(Boolean);
    }

    function parseEpisodeLookupKey(value) {
        const match = String(value ?? "").match(/^(\d+):(\d+):(\d+)$/);
        return match ? {
            mediaType: MEDIA_TYPE.EPISODE,
            showId: match[1],
            seasonNumber: match[2],
            episodeNumber: match[3],
            backendLookupKey: match[0]
        } : null;
    }

    const pendingBackendWrites = Object.keys(mediaConfig).reduce((map, mediaType) => {
        map[mediaType] = {};
        return map;
    }, {});

    async function fetchTranslationsFromBackend(cache, storeTranslationEntry, saveCache, refsByType) {
        if (!backendBaseUrl) {
            return;
        }

        const totalRefs = Object.keys(mediaConfig).reduce((count, mediaType) => {
            return count + ensureArray(refsByType?.[mediaType]).length;
        }, 0);
        if (totalRefs <= backendFetchMinRefs) {
            return;
        }

        const query = [];
        Object.keys(mediaConfig).forEach((mediaType) => {
            const ids = getBackendFieldIds(ensureArray(refsByType?.[mediaType]));
            if (ids.length > 0) {
                query.push(`${getMediaBackendField(mediaType)}=${ids.join(",")}`);
            }
        });
        if (query.length === 0) {
            return;
        }

        const payload = await fetchJson(`${backendBaseUrl}/api/trakt/translations?${query.join("&")}`, null, false);
        Object.keys(mediaConfig).forEach((mediaType) => {
            const entries = ensureObject(payload?.[getMediaBackendField(mediaType)]);
            Object.keys(entries).forEach((id) => {
                const ref = mediaType === MEDIA_TYPE.EPISODE ? parseEpisodeLookupKey(id) : { traktId: id };
                storeTranslationEntry(cache, mediaType, ref, entries[id]);
            });
        });
        saveCache(cache);
    }

    function getPendingBackendWriteCount() {
        return Object.keys(pendingBackendWrites).reduce((count, mediaType) => {
            return count + Object.keys(ensureObject(pendingBackendWrites[mediaType])).length;
        }, 0);
    }

    function queueBackendWrite(mediaType, lookupKey, entry) {
        if (!lookupKey) {
            return;
        }
        pendingBackendWrites[mediaType][lookupKey] = entry;
        if (getPendingBackendWriteCount() >= backendWriteBatchSize) {
            flushBackendWriteBatch(backendWriteBatchSize);
        }
    }

    function extractBackendWritePayload(maxBatchSize) {
        const payload = {};
        const batchSize = Number(maxBatchSize) > 0 ? Number(maxBatchSize) : backendWriteBatchSize;
        let count = 0;

        Object.keys(mediaConfig).forEach((mediaType) => {
            payload[getMediaBackendField(mediaType)] = {};
        });

        for (const mediaType of Object.keys(mediaConfig)) {
            const entries = ensureObject(pendingBackendWrites[mediaType]);
            for (const lookupKey of Object.keys(entries)) {
                if (count >= batchSize) {
                    return payload;
                }
                payload[getMediaBackendField(mediaType)][lookupKey] = entries[lookupKey];
                delete pendingBackendWrites[mediaType][lookupKey];
                count += 1;
            }
        }

        return payload;
    }

    function flushBackendWriteBatch(maxBatchSize) {
        if (!backendBaseUrl || getPendingBackendWriteCount() === 0) {
            return false;
        }

        postJson(`${backendBaseUrl}/api/trakt/translations`, extractBackendWritePayload(maxBatchSize), {
            "content-type": "application/json"
        }, false).catch(() => {});
        return true;
    }

    function flushBackendWrites() {
        flushBackendWriteBatch(getPendingBackendWriteCount());
    }

    return {
        fetchTranslationsFromBackend,
        flushBackendWrites,
        queueBackendWrite
    };
}

export {
    BACKEND_FETCH_MIN_REFS,
    BACKEND_WRITE_BATCH_SIZE,
    createVercelBackendClient,
    DEFAULT_BACKEND_BASE_URL
};
