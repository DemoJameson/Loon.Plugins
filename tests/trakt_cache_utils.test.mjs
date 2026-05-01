import assert from "node:assert/strict";
import test from "node:test";

import {
    createEmptyUnifiedCache,
    getHashedFieldTranslation,
    normalizeUnifiedCache,
    pruneUnifiedCacheToLimit,
    setHashedFieldTranslation,
} from "../trakt_simplified_chinese/src/utils/cache.mjs";

function createEnv() {
    let toStrCalls = 0;
    return {
        toStr(value, fallback = "") {
            toStrCalls += 1;
            try {
                return JSON.stringify(value);
            } catch {
                return fallback;
            }
        },
        getToStrCalls() {
            return toStrCalls;
        },
    };
}

test("cache utils: hashed field translation roundtrip works for comments cache shape", () => {
    const cache = {};

    assert.equal(setHashedFieldTranslation(cache, 9001, "comment", "Great movie", " 很棒的电影 "), true);
    assert.equal(getHashedFieldTranslation(cache, 9001, "comment", "Great movie"), "很棒的电影");
    assert.equal(getHashedFieldTranslation(cache, 9001, "comment", "Another movie"), "");
    assert.equal(cache["9001"].comment.translatedText, "很棒的电影");
});

test("cache utils: normalizeUnifiedCache keeps comments cache in current nested shape", () => {
    const normalized = normalizeUnifiedCache({
        version: 2,
        maxBytes: 512,
        google: {
            comments: {
                9001: {
                    comment: {
                        sourceTextHash: "cafebabe",
                        translatedText: "很棒的电影",
                    },
                },
            },
        },
    });

    assert.equal(normalized.google.comments["9001"].comment.translatedText, "很棒的电影");
    assert.equal(typeof normalized.google.comments["9001"].updatedAt, "number");
});

test("cache utils: pruneUnifiedCacheToLimit removes oldest entries first", () => {
    const env = createEnv();
    const cache = createEmptyUnifiedCache(2, 420);

    cache.google.comments.oldest = {
        comment: {
            sourceTextHash: "oldest",
            translatedText: "A".repeat(240),
        },
        updatedAt: 1,
    };
    cache.google.comments.middle = {
        comment: {
            sourceTextHash: "middle",
            translatedText: "B".repeat(240),
        },
        updatedAt: 2,
    };
    cache.google.comments.newest = {
        comment: {
            sourceTextHash: "newest",
            translatedText: "C".repeat(40),
        },
        updatedAt: 3,
    };

    const pruned = pruneUnifiedCacheToLimit(env, cache, 2, 420);

    assert.equal(pruned.google.comments.oldest, undefined);
    assert.equal(pruned.google.comments.middle, undefined);
    assert.equal(pruned.google.comments.newest.comment.translatedText, "C".repeat(40));
});

test("cache utils: pruneUnifiedCacheToLimit keeps serialization calls bounded", () => {
    const env = createEnv();
    const cache = createEmptyUnifiedCache(2, 900);

    for (let index = 0; index < 12; index += 1) {
        cache.google.comments[String(index)] = {
            comment: {
                sourceTextHash: `hash-${index}`,
                translatedText: "X".repeat(180),
            },
            updatedAt: index + 1,
        };
    }

    pruneUnifiedCacheToLimit(env, cache, 2, 900);

    assert.ok(env.getToStrCalls() <= 20, `expected bounded serialization calls, got ${env.getToStrCalls()}`);
});
