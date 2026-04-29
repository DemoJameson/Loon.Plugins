import { Env } from "../../scripts/vendor/Env.module.mjs";
import {
    createEmptyUnifiedCache,
    normalizeUnifiedCache
} from "./services/cache_store.mjs";

const TITLE = "Trakt增强";
const $ = new Env(TITLE);
const CACHE_KEY = "dj_trakt_unified_cache";
const CACHE_SCHEMA_VERSION = 1;
const STRESS_TEST_KEY = "__trakt_cache_stress_test__";
const CHUNK_SIZE_BYTES = 8 * 1024;
const CHUNKS_PER_RUN = 64;
const CHUNK_CHAR = "A";
function ensureObject(value, fallback = {}) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function loadCache() {
    try {
        return normalizeUnifiedCache($.getjson(CACHE_KEY, {}), CACHE_SCHEMA_VERSION, null);
    } catch (e) {
        $.log("Trakt cache load failed: " + e);
        return createEmptyUnifiedCache(CACHE_SCHEMA_VERSION, null);
    }
}

function saveCache(cache) {
    try {
        cache.updatedAt = Date.now();
        return $.setjson(cache, CACHE_KEY);
    } catch (e) {
        $.log("Trakt cache save failed: " + e);
        return false;
    }
}

function createChunk() {
    return CHUNK_CHAR.repeat(CHUNK_SIZE_BYTES);
}

function createChunks(count) {
    return Array.from({ length: count }, () => createChunk());
}

function estimateBytes(value) {
    const serialized = $.toStr(value, "");
    return serialized ? serialized.length : 0;
}

function formatMB(bytes) {
    return (bytes / 1024 / 1024).toFixed(2) + " MB";
}

function buildStressTestEntry(previousEntry) {
    const normalizedEntry = ensureObject(previousEntry);
    const normalizedTranslation = ensureObject(normalizedEntry.translation);
    const existingPayload = typeof normalizedTranslation.overview === "string"
        ? normalizedTranslation.overview
        : "";
    const previousChunks = Number.isFinite(Number(normalizedEntry.testChunkCount))
        ? Number(normalizedEntry.testChunkCount)
        : Math.floor(existingPayload.length / CHUNK_SIZE_BYTES);
    const appendedChunkCount = CHUNKS_PER_RUN;
    const nextChunkCount = previousChunks + appendedChunkCount;
    const payload = existingPayload + createChunks(appendedChunkCount).join("");

    return {
        status: 1,
        translation: {
            title: "cache stress test",
            overview: payload,
            tagline: "chunks " + nextChunkCount
        },
        testChunkCount: nextChunkCount,
        testChunkSizeBytes: CHUNK_SIZE_BYTES,
        chunksPerRun: appendedChunkCount,
        updatedAt: Date.now()
    };
}

(function () {
    const cache = loadCache();
    const beforeBytes = estimateBytes(cache);
    const linkIdsCache = ensureObject(cache.trakt?.linkIds);
    const nextEntry = buildStressTestEntry(linkIdsCache[STRESS_TEST_KEY]);
    linkIdsCache[STRESS_TEST_KEY] = nextEntry;
    cache.trakt.linkIds = linkIdsCache;
    const saved = saveCache(cache);
    const afterBytes = estimateBytes(cache);

    if (saved) {
        $.msg(
            TITLE,
            "缓存压力数据已追加 64 x 8KB",
            "当前测试块数: " + nextEntry.testChunkCount +
            " | 缓存大小: " + formatMB(beforeBytes) + " -> " + formatMB(afterBytes)
        );
    } else {
        $.msg(TITLE, "缓存压力数据写入失败", "");
    }

    $.done({});
})();
