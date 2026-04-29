import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runScript } from "./run-script.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UNIFIED_CACHE_KEY = "dj_trakt_unified_cache";
const UNIFIED_CACHE_SCHEMA_VERSION = 1;
const UNIFIED_CACHE_MAX_BYTES = (1024 * 1024) - (8 * 1024);

function readFixture(name) {
    return fs.readFileSync(path.resolve(__dirname, "..", "fixtures", "trakt", name), "utf8");
}

function computeStringHash(value) {
    const text = String(value ?? "");
    let hash = 2166136261;

    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }

    return (hash >>> 0).toString(16).padStart(8, "0");
}

function createMediaTranslationEntry(overrides = {}) {
    return {
        status: 1,
        translation: {
            title: "中文电影",
            overview: "中文简介",
            tagline: "中文标语"
        },
        ...overrides
    };
}

function createMediaTranslationCache(entries = {}) {
    return JSON.stringify({
        "movie:123": createMediaTranslationEntry(),
        ...entries
    });
}

function createUnifiedCache(overrides = {}) {
    return JSON.stringify({
        version: UNIFIED_CACHE_SCHEMA_VERSION,
        updatedAt: Number(overrides.updatedAt ?? Date.now()),
        maxBytes: Number(overrides.maxBytes ?? UNIFIED_CACHE_MAX_BYTES),
        trakt: {
            translation: overrides.traktTranslation ?? {},
            historyEpisode: overrides.traktHistoryEpisode ?? {},
            linkIds: overrides.traktLinkIds ?? {}
        },
        google: {
            comments: overrides.googleComments ?? {},
            sentiments: overrides.googleSentiments ?? {},
            people: overrides.googlePeople ?? {},
            listText: overrides.googleListText ?? {}
        },
        persistent: {
            currentSeason: overrides.persistentCurrentSeason ?? null
        }
    });
}

function createUnifiedPersistentData(overrides = {}) {
    return {
        [UNIFIED_CACHE_KEY]: createUnifiedCache(overrides)
    };
}

function parseUnifiedCache(persistentData) {
    return JSON.parse(String(persistentData?.[UNIFIED_CACHE_KEY] ?? createUnifiedCache()));
}

function createMovieTranslationCache() {
    return createMediaTranslationCache();
}

function createPeopleTranslationCache(overrides = {}) {
    const defaultPerson = {
        name: {
            sourceText: "Tom Hanks",
            translatedText: "汤姆·汉克斯"
        },
        biography: {
            sourceTextHash: computeStringHash("An American actor and filmmaker."),
            translatedText: "一位美国演员和电影制作人。"
        }
    };

    return JSON.stringify({
        "42": {
            ...defaultPerson,
            ...overrides["42"]
        },
        ...Object.fromEntries(
            Object.entries(overrides).filter(([key]) => key !== "42")
        )
    });
}

function createCommentTranslationCache(overrides = {}) {
    return JSON.stringify({
        "9001": {
            sourceTextHash: computeStringHash("Great movie"),
            translatedText: "很棒的电影"
        },
        ...overrides
    });
}

function createListTextTranslationCache(overrides = {}) {
    return JSON.stringify({
        "321": {
            description: {
                sourceTextHash: computeStringHash("A good list"),
                translatedText: "一个不错的列表"
            }
        },
        ...overrides
    });
}

function createSentimentTranslationCache(overrides = {}) {
    const defaultTranslation = {
        aspect: {
            pros: [{ sourceTextHash: computeStringHash("Story"), translatedText: "剧情" }],
            cons: [{ sourceTextHash: computeStringHash("Pacing"), translatedText: "节奏" }]
        },
        good: [{ sourceTextHash: computeStringHash("Great cast"), translatedText: "演员阵容出色" }],
        bad: [{ sourceTextHash: computeStringHash("Weak ending"), translatedText: "结尾较弱" }],
        summary: [{ sourceTextHash: computeStringHash("Overall enjoyable"), translatedText: "整体观感不错" }],
        analysis: { sourceTextHash: computeStringHash("Detailed analysis"), translatedText: "详细分析" },
        highlight: { sourceTextHash: computeStringHash("Best moment"), translatedText: "高光时刻" },
        items: [{ sourceTextHash: computeStringHash("Memorable scene"), translatedText: "难忘场景" }],
        text: { sourceTextHash: computeStringHash("Audience text"), translatedText: "观众文本" }
    };

    return JSON.stringify({
        "movie:123": {
            translation: defaultTranslation,
            ...overrides["movie:123"]
        },
        ...Object.fromEntries(
            Object.entries(overrides).filter(([key]) => key !== "movie:123")
        )
    });
}

function createWatchnowIdsEntry(overrides = {}) {
    return {
        ids: {
            trakt: 123,
            tmdb: 456
        },
        ...overrides
    };
}

function createEpisodeWatchnowIdsEntry(overrides = {}) {
    return {
        ids: {
            trakt: 1001,
            tmdb: 9001
        },
        showIds: {
            trakt: 555,
            imdb: "tt-show"
        },
        seasonNumber: 1,
        episodeNumber: 2,
        ...overrides
    };
}

function createWatchnowIdsCache(entries = {}) {
    return JSON.stringify({
        "123": createWatchnowIdsEntry(),
        ...entries
    });
}

function createGoogleTranslateResponse(translatedTexts) {
    return JSON.stringify({
        data: {
            translations: translatedTexts.map((translatedText) => ({ translatedText }))
        }
    });
}

function createHttpErrorMock(message) {
    return {
        error: message
    };
}

function createHttpStatusMock(status, body = "{\"error\":\"server error\"}") {
    return {
        status,
        body
    };
}

function createInvalidJsonResponse() {
    return "{not-json";
}

function createEmptyGoogleTranslateResponse() {
    return createGoogleTranslateResponse([]);
}

function createTmdbMovieCreditsResponse(names = ["汤姆·汉克斯"]) {
    return JSON.stringify({
        credits: {
            cast: names.map((name, index) => ({
                id: index + 31,
                name
            }))
        }
    });
}

function createWrappedMovieBody() {
    return JSON.stringify([
        {
            movie: JSON.parse(readFixture("recommendations-movies.json"))[0]
        }
    ]);
}

function runResponseCase(input) {
    return runScript({
        hasResponse: true,
        ...input
    });
}

function runRequestCase(input) {
    return runScript({
        hasResponse: false,
        ...input
    });
}

export {
    UNIFIED_CACHE_KEY,
    readFixture,
    computeStringHash,
    createMediaTranslationEntry,
    createMediaTranslationCache,
    createUnifiedCache,
    createUnifiedPersistentData,
    parseUnifiedCache,
    createMovieTranslationCache,
    createPeopleTranslationCache,
    createCommentTranslationCache,
    createListTextTranslationCache,
    createSentimentTranslationCache,
    createWatchnowIdsEntry,
    createEpisodeWatchnowIdsEntry,
    createWatchnowIdsCache,
    createGoogleTranslateResponse,
    createHttpErrorMock,
    createHttpStatusMock,
    createInvalidJsonResponse,
    createEmptyGoogleTranslateResponse,
    createTmdbMovieCreditsResponse,
    createWrappedMovieBody,
    runResponseCase,
    runRequestCase
};
