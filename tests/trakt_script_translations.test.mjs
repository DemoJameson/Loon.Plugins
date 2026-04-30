import assert from "node:assert/strict";
import test from "node:test";

import {
    UNIFIED_CACHE_KEY,
    readFixture,
    computeStringHash,
    createMediaTranslationCache,
    createMediaTranslationEntry,
    createCommentTranslationCache,
    createListTranslationCache,
    createSentimentTranslationCache,
    createUnifiedPersistentData,
    parseUnifiedCache,
    createGoogleTranslateResponse,
    createHttpErrorMock,
    createHttpStatusMock,
    createInvalidJsonResponse,
    createEmptyGoogleTranslateResponse,
    runRequestCase,
    runResponseCase
} from "./helpers/trakt-test-helpers.mjs";

const GOOGLE_TRANSLATE_URL = "https://translation.googleapis.com/language/translate/v2";
const TEST_BACKEND_BASE_URL = "https://backend.example";
const TEST_BACKEND_TRANSLATIONS_URL = `${TEST_BACKEND_BASE_URL}/api/trakt/translations`;
const TEST_DIRECT_TRANSLATION_URL = "https://api.trakt.tv/movies/123/translations/zh?extended=all";

function createPendingBackendPostMocks() {
    return {
        [TEST_BACKEND_TRANSLATIONS_URL]: [
            createHttpStatusMock(200, "{}")
        ]
    };
}

function createDirectTranslationLookupBody() {
    return JSON.stringify([
        {
            watchers: 1,
            movie: {
                title: "Original Title",
                overview: "Original Overview",
                tagline: "Original Tagline",
                ids: {
                    trakt: 123
                },
                available_translations: ["zh"]
            }
        }
    ]);
}

async function runDirectTranslationLookupCase(translationMock) {
    const httpPostMocks = createPendingBackendPostMocks();
    const { result, persistentData } = await runResponseCase({
        url: "https://api.trakt.tv/movies/trending",
        body: createDirectTranslationLookupBody(),
        argument: {
            backendBaseUrl: TEST_BACKEND_BASE_URL
        },
        httpGetMocks: {
            [TEST_DIRECT_TRANSLATION_URL]: translationMock
        },
        httpPostMocks
    });

    return {
        result,
        persistentData,
        backendPostQueue: httpPostMocks[TEST_BACKEND_TRANSLATIONS_URL]
    };
}

function createGoogleFailureCases() {
    return [
        {
            name: "Google 翻译失败",
            mock: createHttpErrorMock("google translate unavailable")
        },
        {
            name: "Google 返回 HTTP 500",
            mock: createHttpStatusMock(500)
        },
        {
            name: "Google 返回非法 JSON",
            mock: createInvalidJsonResponse()
        }
    ];
}

test("/translations/zh 会把 fallback zh 响应归一化为 zh-cn 条目", async () => {
    const { result, persistentData } = await runResponseCase({
        url: "https://api.trakt.tv/movies/123/translations/zh?extended=all",
        body: readFixture("translations.json")
    });

    const payload = JSON.parse(result.body);
    assert.equal(payload[0].country, "cn");
    assert.equal(payload[0].title, "港版标题");
    assert.equal(payload[0].status, 2);
    assert.ok(persistentData[UNIFIED_CACHE_KEY]);
});

test("/translations/zh 排序后会把 zh-CN 条目放在最前", async () => {
    const { result } = await runResponseCase({
        url: "https://api.trakt.tv/movies/123/translations/zh?extended=all",
        body: readFixture("translations-mixed.json")
    });

    const payload = JSON.parse(result.body);
    assert.equal(payload[0].language, "zh");
    assert.equal(payload[0].country, "cn");
    assert.equal(payload[0].title, "国行标题");
});

[
    {
        name: "空响应体",
        mock: createHttpStatusMock(200, "")
    },
    {
        name: "空白响应体",
        mock: createHttpStatusMock(200, "   ")
    },
    {
        name: "空数组响应",
        mock: "[]"
    },
    {
        name: "无有效翻译字段响应",
        mock: JSON.stringify([
            {
                language: "zh",
                country: "cn"
            }
        ])
    }
].forEach(({ name, mock }) => {
    test(`媒体列表直查翻译在 ${name} 时会缓存 NOT_FOUND 并回传 backend`, async () => {
        const { result, persistentData, backendPostQueue } = await runDirectTranslationLookupCase(mock);

        const payload = JSON.parse(result.body);
        assert.equal(payload[0].movie.title, "Original Title");

        const cacheEntry = parseUnifiedCache(persistentData).trakt.translation["movie:123"];
        assert.deepEqual(cacheEntry.translation, null);
        assert.equal(cacheEntry.status, 3);
        assert.equal(backendPostQueue.length, 0);
    });
});

[
    {
        name: "HTTP 非 200",
        mock: createHttpStatusMock(500)
    },
    {
        name: "网络异常",
        mock: createHttpErrorMock("trakt unavailable")
    },
    {
        name: "非法 JSON 非空响应",
        mock: createInvalidJsonResponse()
    }
].forEach(({ name, mock }) => {
    test(`媒体列表直查翻译在 ${name} 时不会回传 backend`, async () => {
        const { result, persistentData, backendPostQueue } = await runDirectTranslationLookupCase(mock);

        const payload = JSON.parse(result.body);
        assert.equal(payload[0].movie.title, "Original Title");
        assert.deepEqual(parseUnifiedCache(persistentData).trakt.translation, {});
        assert.equal(backendPostQueue.length, 1);
    });
});

test("/movies/:id 会把缓存中的中文翻译应用到详情响应", async () => {
    const { result } = await runResponseCase({
        url: "https://api.trakt.tv/movies/123",
        body: readFixture("movie-detail.json"),
        headers: {
            "user-agent": "Rippple/1.0"
        },
        persistentData: createUnifiedPersistentData({
            traktTranslation: JSON.parse(createMediaTranslationCache({
                "movie:123": createMediaTranslationEntry({
                    translation: {
                        title: "中文标题",
                        overview: "中文简介",
                        tagline: "中文标语"
                    }
                })
            }))
        })
    });

    const payload = JSON.parse(result.body);
    assert.equal(payload.title, "中文标题");
    assert.equal(payload.original_title, "中文标题");
    assert.equal(payload.overview, "中文简介");
    assert.equal(payload.tagline, "中文标语");
});

test("/translations/zh 写回媒体缓存时只保留状态、翻译和更新时间", async () => {
    const { persistentData } = await runResponseCase({
        url: "https://api.trakt.tv/movies/123/translations/zh?extended=all",
        body: readFixture("translations.json")
    });

    const cacheEntry = parseUnifiedCache(persistentData).trakt.translation["movie:123"];
    assert.ok(cacheEntry);
    assert.deepEqual(Object.keys(cacheEntry).sort(), ["status", "translation", "updatedAt"]);
});

test("/movies/:id 遇到损坏的媒体缓存字符串时会安全降级", async () => {
    const { result } = await runResponseCase({
        url: "https://api.trakt.tv/movies/123",
        body: readFixture("movie-detail.json"),
        persistentData: {
            [UNIFIED_CACHE_KEY]: "{not-json"
        }
    });

    const payload = JSON.parse(result.body);
    assert.equal(payload.title, "Original Title");
    assert.equal(payload.overview, "Original Overview");
    assert.equal(payload.tagline, "Original Tagline");
});

test("统一缓存 version 不匹配时会清空旧内容并重建后正常写入新翻译", async () => {
    const { persistentData } = await runResponseCase({
        url: "https://api.trakt.tv/movies/123/translations/zh?extended=all",
        body: readFixture("translations.json"),
        persistentData: {
            [UNIFIED_CACHE_KEY]: JSON.stringify({
                version: 999,
                trakt: {
                    translation: {
                        "movie:123": createMediaTranslationEntry({
                            translation: {
                                title: "旧标题"
                            }
                        })
                    }
                }
            })
        }
    });

    const unifiedCache = parseUnifiedCache(persistentData);
    assert.equal(unifiedCache.version, 2);
    assert.equal(unifiedCache.trakt.translation["movie:123"].translation.title, "港版标题");
});

test("统一缓存超过上限时会按 updatedAt 裁剪 google 分区旧条目并保留较新项", async () => {
    const largeText = "A".repeat(600 * 1024);
    const { persistentData } = await runResponseCase({
        url: "https://api.trakt.tv/comments/123/replies",
        body: readFixture("comments.json"),
        persistentData: createUnifiedPersistentData({
            googleComments: {
                old: {
                    sourceTextHash: computeStringHash("old"),
                    translatedText: largeText,
                    updatedAt: 1
                },
                newer: {
                    sourceTextHash: computeStringHash("newer"),
                    translatedText: largeText,
                    updatedAt: 2
                }
            }
        }),
        httpPostMocks: {
            [GOOGLE_TRANSLATE_URL]: createGoogleTranslateResponse([
                "很棒的电影"
            ])
        }
    });

    const unifiedCache = parseUnifiedCache(persistentData);
    assert.equal(unifiedCache.google.comments.old, undefined);
    assert.equal(typeof unifiedCache.google.comments.newer?.translatedText, "string");
    assert.equal(unifiedCache.google.comments["9001"].translatedText, "很棒的电影");
    assert.equal(unifiedCache.persistent.currentSeason, null);
});

test("history episodes 请求会在 request phase 改写为最小 limit", async () => {
    const { result } = await runRequestCase({
        url: "https://api.trakt.tv/users/me/history/episodes?page=2&limit=10",
        headers: {
            "user-agent": "Infuse/8.0"
        }
    });

    assert.equal(result.url, "https://api.trakt.tv/users/me/history/episodes?page=2&limit=500");
});

test("Rippple history 请求会在 request phase 改写为最小 limit", async () => {
    const { result } = await runRequestCase({
        url: "https://api.trakt.tv/users/me/history?page=1&limit=20",
        headers: {
            "user-agent": "Rippple/1.0"
        }
    });

    assert.equal(result.url, "https://api.trakt.tv/users/me/history?page=1&limit=100");
});

test("history episodes 列表会按 show 保留最新一条并应用缓存翻译", async () => {
    const { result, persistentData } = await runResponseCase({
        url: "https://api.trakt.tv/users/me/history/episodes?page=1&limit=10",
        body: readFixture("history-episodes.json"),
        headers: {
            "user-agent": "Infuse/8.0"
        },
        httpGetMocks: {
            "https://api.trakt.tv/shows/555/translations/zh?extended=all": "[]",
            "https://api.trakt.tv/shows/777/translations/zh?extended=all": "[]"
        },
        persistentData: createUnifiedPersistentData({
            traktTranslation: JSON.parse(createMediaTranslationCache({
                "episode:555:1:2": createMediaTranslationEntry({
                    translation: {
                        title: "第二集中文",
                        overview: "第二集中文简介",
                        tagline: "第二集中文标语"
                    }
                }),
                "episode:777:2:1": createMediaTranslationEntry({
                    translation: {
                        title: "其他剧中文",
                        overview: "其他剧中文简介",
                        tagline: "其他剧中文标语"
                    }
                })
            }))
        })
    });

    const payload = JSON.parse(result.body);
    assert.deepEqual(payload.map((item) => item.id), [2, 3]);
    assert.equal(payload[0].episode.title, "第二集中文");
    assert.equal(payload[1].episode.title, "其他剧中文");

    const historyCache = parseUnifiedCache(persistentData).trakt.historyEpisode;
    const bucketKey = "https://api.trakt.tv/users/me/history/episodes";
    assert.ok(historyCache[bucketKey]);
    assert.ok(historyCache[bucketKey].shows["555"]);
    assert.ok(historyCache[bucketKey].shows["777"]);
});

test("comments 列表会应用缓存中的评论翻译", async () => {
    const { result } = await runResponseCase({
        url: "https://api.trakt.tv/comments/123/replies",
        body: readFixture("comments.json"),
        persistentData: createUnifiedPersistentData({
            googleComments: JSON.parse(createCommentTranslationCache())
        })
    });

    const payload = JSON.parse(result.body);
    assert.equal(payload[0].comment, "很棒的电影");
});

test("googleTranslationEnabled=false 时 comments 不触发 Google 翻译，但仍可应用缓存", async () => {
    const cachedComments = JSON.parse(createCommentTranslationCache());
    const { result, persistentData, httpLogs } = await runResponseCase({
        url: "https://api.trakt.tv/comments/123/replies",
        body: readFixture("comments.json"),
        argument: {
            googleTranslationEnabled: false
        },
        persistentData: createUnifiedPersistentData({
            googleComments: cachedComments
        })
    });

    const payload = JSON.parse(result.body);
    assert.equal(payload[0].comment, "很棒的电影");
    assert.equal(parseUnifiedCache(persistentData).google.comments["9001"].translatedText, "很棒的电影");
    assert.equal(httpLogs.some((entry) => entry.method === "POST" && entry.url === GOOGLE_TRANSLATE_URL), false);
});

test("comments 列表会翻译未命中的评论并写回缓存", async () => {
    const { result, persistentData } = await runResponseCase({
        url: "https://api.trakt.tv/comments/123/replies",
        body: readFixture("comments.json"),
        httpPostMocks: {
            "https://translation.googleapis.com/language/translate/v2": createGoogleTranslateResponse([
                "很棒的电影"
            ])
        }
    });

    const payload = JSON.parse(result.body);
    assert.equal(payload[0].comment, "很棒的电影");

    const cache = parseUnifiedCache(persistentData).google.comments;
    assert.equal(cache["9001"].translatedText, "很棒的电影");
    assert.equal(cache["9001"].sourceTextHash, computeStringHash("Great movie"));
});

test("comments 写回缓存时会保留其他 comment 项", async () => {
    const { persistentData } = await runResponseCase({
        url: "https://api.trakt.tv/comments/123/replies",
        body: readFixture("comments.json"),
        persistentData: createUnifiedPersistentData({
            googleComments: {
                "7777": {
                    sourceTextHash: "cafebabe",
                    translatedText: "其他评论"
                }
            }
        }),
        httpPostMocks: {
            "https://translation.googleapis.com/language/translate/v2": createGoogleTranslateResponse([
                "很棒的电影"
            ])
        }
    });

    const cache = parseUnifiedCache(persistentData).google.comments;
    assert.equal(cache["9001"].translatedText, "很棒的电影");
    assert.equal(cache["7777"].translatedText, "其他评论");
});

test("comments 列表会按语言分组翻译并跳过中文项", async () => {
    const body = JSON.stringify([
        {
            id: 9001,
            language: "en",
            comment: "Great movie"
        },
        {
            id: 9002,
            language: "es",
            comment: "Excelente pelicula"
        },
        {
            id: 9003,
            language: "zh-CN",
            comment: "已经是中文"
        }
    ]);

    const { result, persistentData } = await runResponseCase({
        url: "https://api.trakt.tv/comments/123/replies",
        body,
        httpPostMocks: {
            "https://translation.googleapis.com/language/translate/v2": [
                createGoogleTranslateResponse(["很棒的电影"]),
                createGoogleTranslateResponse(["优秀的电影"])
            ]
        }
    });

    const payload = JSON.parse(result.body);
    assert.equal(payload[0].comment, "很棒的电影");
    assert.equal(payload[1].comment, "优秀的电影");
    assert.equal(payload[2].comment, "已经是中文");

    const cache = parseUnifiedCache(persistentData).google.comments;
    assert.equal(cache["9001"].translatedText, "很棒的电影");
    assert.equal(cache["9002"].translatedText, "优秀的电影");
    assert.equal(cache["9003"], undefined);
});

test("comments 在部分翻译结果为空时只更新成功项并保留其他原文", async () => {
    const body = JSON.stringify([
        {
            id: 9001,
            language: "en",
            comment: "Great movie"
        },
        {
            id: 9002,
            language: "en",
            comment: "Needs work"
        }
    ]);

    const { result, persistentData } = await runResponseCase({
        url: "https://api.trakt.tv/comments/123/replies",
        body,
        httpPostMocks: {
            "https://translation.googleapis.com/language/translate/v2": createGoogleTranslateResponse([
                "很棒的电影"
            ])
        }
    });

    const payload = JSON.parse(result.body);
    assert.equal(payload[0].comment, "很棒的电影");
    assert.equal(payload[1].comment, "Needs work");

    const cache = parseUnifiedCache(persistentData).google.comments;
    assert.equal(cache["9001"].translatedText, "很棒的电影");
    assert.equal(cache["9002"], undefined);
});

test("comments 列表遇到 hash 不匹配的旧缓存时会忽略旧值并刷新缓存", async () => {
    const { result, persistentData } = await runResponseCase({
        url: "https://api.trakt.tv/comments/123/replies",
        body: readFixture("comments.json"),
        persistentData: createUnifiedPersistentData({
            googleComments: JSON.parse(createCommentTranslationCache({
                "9001": {
                    sourceTextHash: "deadbeef",
                    translatedText: "旧错误翻译"
                }
            }))
        }),
        httpPostMocks: {
            "https://translation.googleapis.com/language/translate/v2": createGoogleTranslateResponse([
                "很棒的电影"
            ])
        }
    });

    const payload = JSON.parse(result.body);
    assert.equal(payload[0].comment, "很棒的电影");

    const cache = parseUnifiedCache(persistentData).google.comments;
    assert.equal(cache["9001"].translatedText, "很棒的电影");
    assert.equal(cache["9001"].sourceTextHash, computeStringHash("Great movie"));
});

createGoogleFailureCases().forEach(({ name, mock }) => {
    test(`comments 列表在${name}时会保留原文且不写入脏缓存`, async () => {
        const { result, persistentData } = await runResponseCase({
            url: "https://api.trakt.tv/comments/123/replies",
            body: readFixture("comments.json"),
            httpPostMocks: {
                [GOOGLE_TRANSLATE_URL]: mock
            }
        });

        const payload = JSON.parse(result.body);
        assert.equal(payload[0].comment, "Great movie");
        assert.deepEqual(parseUnifiedCache(persistentData).google.comments, {});
    });
});

test("comments 列表在 Google 返回空翻译结果时会保留原文且不写入脏缓存", async () => {
    const { result, persistentData } = await runResponseCase({
        url: "https://api.trakt.tv/comments/123/replies",
        body: readFixture("comments.json"),
        httpPostMocks: {
            "https://translation.googleapis.com/language/translate/v2": createEmptyGoogleTranslateResponse()
        }
    });

    const payload = JSON.parse(result.body);
    assert.equal(payload[0].comment, "Great movie");
    assert.deepEqual(parseUnifiedCache(persistentData).google.comments, {});
});

test("recent comments 列表会同时应用媒体翻译和评论翻译", async () => {
    const { result } = await runResponseCase({
        url: "https://api.trakt.tv/comments/recent/movies/weekly",
        body: readFixture("recent-comments.json"),
        persistentData: createUnifiedPersistentData({
            traktTranslation: JSON.parse(createMediaTranslationCache()),
            googleComments: JSON.parse(createCommentTranslationCache())
        })
    });

    const payload = JSON.parse(result.body);
    assert.equal(payload[0].movie.title, "中文电影");
    assert.equal(payload[0].comment.comment, "很棒的电影");
});

test("list descriptions 会应用缓存中的描述翻译", async () => {
    const { result } = await runResponseCase({
        url: "https://api.trakt.tv/movies/123/lists/popular",
        body: readFixture("list-descriptions.json"),
        persistentData: createUnifiedPersistentData({
            googleList: JSON.parse(createListTranslationCache())
        })
    });

    const payload = JSON.parse(result.body);
    assert.equal(payload[0].description, "一个不错的列表");
});

test("googleTranslationEnabled=false 时 list descriptions 不触发 Google 翻译，但仍可应用缓存", async () => {
    const cachedList = JSON.parse(createListTranslationCache({
        "321": {
            name: {
                sourceTextHash: computeStringHash("Favorites"),
                translatedText: "收藏夹"
            },
            description: {
                sourceTextHash: computeStringHash("A good list"),
                translatedText: "一个不错的列表"
            }
        }
    }));
    const { result, persistentData, httpLogs } = await runResponseCase({
        url: "https://api.trakt.tv/movies/123/lists/popular",
        body: readFixture("list-descriptions.json"),
        argument: {
            googleTranslationEnabled: false
        },
        persistentData: createUnifiedPersistentData({
            googleList: cachedList
        })
    });

    const payload = JSON.parse(result.body);
    assert.equal(payload[0].name, "收藏夹");
    assert.equal(payload[0].description, "一个不错的列表");
    const cache = parseUnifiedCache(persistentData).google.list;
    assert.equal(cache["321"].name.translatedText, "收藏夹");
    assert.equal(cache["321"].description.translatedText, "一个不错的列表");
    assert.equal(httpLogs.some((entry) => entry.method === "POST" && entry.url === GOOGLE_TRANSLATE_URL), false);
});

test("list descriptions 会翻译未命中的描述并写回缓存", async () => {
    const { result, persistentData } = await runResponseCase({
        url: "https://api.trakt.tv/movies/123/lists/popular",
        body: readFixture("list-descriptions.json"),
        httpPostMocks: {
            "https://translation.googleapis.com/language/translate/v2": createGoogleTranslateResponse([
                "收藏夹",
                "一个不错的列表"
            ])
        }
    });

    const payload = JSON.parse(result.body);
    assert.equal(payload[0].description, "一个不错的列表");

    const cache = parseUnifiedCache(persistentData).google.list;
    assert.equal(cache["321"].description.translatedText, "一个不错的列表");
    assert.equal(cache["321"].description.sourceTextHash, computeStringHash("A good list"));
});

test("list descriptions 遇到 hash 不匹配的旧缓存时会忽略旧值并刷新缓存", async () => {
    const { result, persistentData } = await runResponseCase({
        url: "https://api.trakt.tv/movies/123/lists/popular",
        body: readFixture("list-descriptions.json"),
        persistentData: createUnifiedPersistentData({
            googleList: JSON.parse(createListTranslationCache({
                "321": {
                    description: {
                        sourceTextHash: "deadbeef",
                        translatedText: "旧错误描述"
                    }
                }
            }))
        }),
        httpPostMocks: {
            "https://translation.googleapis.com/language/translate/v2": createGoogleTranslateResponse([
                "收藏夹",
                "一个不错的列表"
            ])
        }
    });

    const payload = JSON.parse(result.body);
    assert.equal(payload[0].description, "一个不错的列表");

    const cache = parseUnifiedCache(persistentData).google.list;
    assert.equal(cache["321"].description.translatedText, "一个不错的列表");
    assert.equal(cache["321"].description.sourceTextHash, computeStringHash("A good list"));
});

test("list descriptions 会批量翻译多个非中文描述并跳过已是中文的描述", async () => {
    const body = JSON.stringify([
        {
            name: "Favorites",
            language: "en",
            description: "A good list",
            ids: {
                trakt: 321
            }
        },
        {
            name: "Popular",
            language: "es",
            description: "Lista excelente",
            ids: {
                trakt: 322
            }
        },
        {
            name: "中文列表",
            language: "zh-CN",
            description: "已经是中文描述",
            ids: {
                trakt: 323
            }
        }
    ]);

    const { result, persistentData } = await runResponseCase({
        url: "https://api.trakt.tv/movies/123/lists/popular",
        body,
        httpPostMocks: {
            "https://translation.googleapis.com/language/translate/v2": createGoogleTranslateResponse([
                "收藏夹",
                "一个不错的列表",
                "热门",
                "优秀列表"
            ])
        }
    });

    const payload = JSON.parse(result.body);
    assert.equal(payload[0].name, "收藏夹");
    assert.equal(payload[0].description, "一个不错的列表");
    assert.equal(payload[1].name, "热门");
    assert.equal(payload[1].description, "优秀列表");
    assert.equal(payload[2].description, "已经是中文描述");

    const cache = parseUnifiedCache(persistentData).google.list;
    assert.equal(cache["321"].description.translatedText, "一个不错的列表");
    assert.equal(cache["322"].description.translatedText, "优秀列表");
    assert.equal(cache["323"], undefined);
});

test("list descriptions 在部分翻译结果为空时只更新成功项并保留其他原文", async () => {
    const body = JSON.stringify([
        {
            name: "Favorites",
            description: "A good list",
            ids: {
                trakt: 321
            }
        },
        {
            name: "Popular",
            description: "Needs more detail",
            ids: {
                trakt: 322
            }
        }
    ]);

    const { result, persistentData } = await runResponseCase({
        url: "https://api.trakt.tv/movies/123/lists/popular",
        body,
        httpPostMocks: {
            "https://translation.googleapis.com/language/translate/v2": createGoogleTranslateResponse([
                "收藏夹",
                "一个不错的列表"
            ])
        }
    });

    const payload = JSON.parse(result.body);
    assert.equal(payload[0].description, "一个不错的列表");
    assert.equal(payload[1].description, "Needs more detail");

    const cache = parseUnifiedCache(persistentData).google.list;
    assert.equal(cache["321"].description.translatedText, "一个不错的列表");
    assert.equal(cache["322"], undefined);
});

createGoogleFailureCases().forEach(({ name, mock }) => {
    test(`list descriptions 在${name}时会保留原描述且不写入脏缓存`, async () => {
        const { result, persistentData } = await runResponseCase({
            url: "https://api.trakt.tv/movies/123/lists/popular",
            body: readFixture("list-descriptions.json"),
            httpPostMocks: {
                [GOOGLE_TRANSLATE_URL]: mock
            }
        });

        const payload = JSON.parse(result.body);
        assert.equal(payload[0].description, "A good list");
        assert.deepEqual(parseUnifiedCache(persistentData).google.list, {});
    });
});

test("list descriptions 在 Google 返回空翻译结果时会保留原描述且不写入脏缓存", async () => {
    const { result, persistentData } = await runResponseCase({
        url: "https://api.trakt.tv/movies/123/lists/popular",
        body: readFixture("list-descriptions.json"),
        httpPostMocks: {
            "https://translation.googleapis.com/language/translate/v2": createEmptyGoogleTranslateResponse()
        }
    });

    const payload = JSON.parse(result.body);
    assert.equal(payload[0].description, "A good list");
    assert.deepEqual(parseUnifiedCache(persistentData).google.list, {});
});

test("sentiments 会应用缓存中的翻译结果", async () => {
    const data = JSON.parse(readFixture("sentiments.json"));
    const { result } = await runResponseCase({
        url: "https://api.trakt.tv/movies/123/sentiments",
        body: JSON.stringify(data),
        persistentData: createUnifiedPersistentData({
            googleSentiments: JSON.parse(createSentimentTranslationCache())
        })
    });

    const payload = JSON.parse(result.body);
    assert.equal(payload.aspect.pros[0].theme, "剧情");
    assert.equal(payload.aspect.cons[0].theme, "节奏");
    assert.equal(payload.good[0].sentiment, "演员阵容出色");
    assert.equal(payload.bad[0].sentiment, "结尾较弱");
    assert.equal(payload.summary[0], "整体观感不错");
    assert.equal(payload.analysis, "详细分析");
    assert.equal(payload.highlight, "高光时刻");
    assert.equal(payload.items[0].text, "难忘场景");
    assert.equal(payload.text, "观众文本");
});

test("googleTranslationEnabled=false 时 sentiments 不触发 Google 翻译，但仍可应用缓存", async () => {
    const cachedSentiments = JSON.parse(createSentimentTranslationCache());
    const { result, persistentData, httpLogs } = await runResponseCase({
        url: "https://api.trakt.tv/movies/123/sentiments",
        body: readFixture("sentiments.json"),
        argument: {
            googleTranslationEnabled: false
        },
        persistentData: createUnifiedPersistentData({
            googleSentiments: cachedSentiments
        })
    });

    const payload = JSON.parse(result.body);
    assert.equal(payload.aspect.pros[0].theme, "剧情");
    assert.equal(payload.good[0].sentiment, "演员阵容出色");
    assert.equal(payload.text, "观众文本");
    const cache = parseUnifiedCache(persistentData).google.sentiments;
    assert.equal(cache["movie:123"].translation.aspect.pros[0].translatedText, "剧情");
    assert.equal(cache["movie:123"].translation.text.translatedText, "观众文本");
    assert.equal(httpLogs.some((entry) => entry.method === "POST" && entry.url === GOOGLE_TRANSLATE_URL), false);
});

[
    "https://apiz.trakt.tv/v3/media/movie/853702/info/5/version/1",
    "https://apiz.trakt.tv/v3/media/movie/853702/info/0/version/1"
].forEach((url) => {
    test(`${url} 会应用缓存中的 sentiments 翻译`, async () => {
        const data = JSON.parse(readFixture("sentiments.json"));
        const googleSentiments = JSON.parse(createSentimentTranslationCache());
        googleSentiments["movie:853702"] = JSON.parse(JSON.stringify(googleSentiments["movie:123"]));

        const { result } = await runResponseCase({
            url,
            body: JSON.stringify(data),
            persistentData: createUnifiedPersistentData({
                googleSentiments
            })
        });

        const payload = JSON.parse(result.body);
        assert.equal(payload.aspect.pros[0].theme, "剧情");
        assert.equal(payload.aspect.cons[0].theme, "节奏");
        assert.equal(payload.good[0].sentiment, "演员阵容出色");
        assert.equal(payload.bad[0].sentiment, "结尾较弱");
        assert.equal(payload.summary[0], "整体观感不错");
        assert.equal(payload.analysis, "详细分析");
        assert.equal(payload.highlight, "高光时刻");
        assert.equal(payload.items[0].text, "难忘场景");
        assert.equal(payload.text, "观众文本");
    });
});

test("sentiments 会翻译未命中的内容并写回缓存", async () => {
    const { result, persistentData } = await runResponseCase({
        url: "https://api.trakt.tv/movies/123/sentiments",
        body: readFixture("sentiments.json"),
        httpPostMocks: {
            "https://translation.googleapis.com/language/translate/v2": createGoogleTranslateResponse([
                "剧情",
                "节奏",
                "演员阵容出色",
                "结尾较弱",
                "整体观感不错",
                "详细分析",
                "高光时刻",
                "难忘场景",
                "观众文本"
            ])
        }
    });

    const payload = JSON.parse(result.body);
    assert.equal(payload.aspect.pros[0].theme, "剧情");
    assert.equal(payload.good[0].sentiment, "演员阵容出色");
    assert.equal(payload.text, "观众文本");

    const cache = parseUnifiedCache(persistentData).google.sentiments;
    assert.equal(cache["movie:123"].translation.aspect.pros[0].translatedText, "剧情");
    assert.equal(cache["movie:123"].translation.text.translatedText, "观众文本");
});

test("sentiments 在部分翻译结果为空时只更新成功项并保留其他原文", async () => {
    const { result, persistentData } = await runResponseCase({
        url: "https://api.trakt.tv/movies/123/sentiments",
        body: readFixture("sentiments.json"),
        httpPostMocks: {
            "https://translation.googleapis.com/language/translate/v2": createGoogleTranslateResponse([
                "剧情",
                "",
                "演员阵容出色"
            ])
        }
    });

    const payload = JSON.parse(result.body);
    assert.equal(payload.aspect.pros[0].theme, "剧情");
    assert.equal(payload.aspect.cons[0].theme, "Pacing");
    assert.equal(payload.good[0].sentiment, "演员阵容出色");
    assert.equal(payload.bad[0].sentiment, "Weak ending");
    assert.equal(payload.text, "Audience text");

    const cache = parseUnifiedCache(persistentData).google.sentiments;
    assert.equal(cache["movie:123"].translation.aspect.pros[0].translatedText, "剧情");
    assert.equal(cache["movie:123"].translation.aspect.cons[0].translatedText, "Pacing");
    assert.equal(cache["movie:123"].translation.good[0].translatedText, "演员阵容出色");
    assert.equal(cache["movie:123"].translation.bad[0].translatedText, "Weak ending");
});

test("sentiments 遇到 sourceTextHash 不匹配的旧缓存时会忽略旧值并刷新缓存", async () => {
    const { result, persistentData } = await runResponseCase({
        url: "https://api.trakt.tv/movies/123/sentiments",
        body: readFixture("sentiments.json"),
        persistentData: createUnifiedPersistentData({
            googleSentiments: JSON.parse(createSentimentTranslationCache({
                "movie:123": {
                    translation: {
                        aspect: {
                            pros: [{ sourceTextHash: "deadbeef", translatedText: "旧剧情" }]
                        },
                        good: [],
                        bad: [],
                        summary: [],
                        analysis: { sourceTextHash: "deadbeef", translatedText: "旧分析" },
                        highlight: { sourceTextHash: "deadbeef", translatedText: "旧高光" },
                        items: [],
                        text: { sourceTextHash: "deadbeef", translatedText: "旧文本" }
                    }
                }
            }))
        }),
        httpPostMocks: {
            "https://translation.googleapis.com/language/translate/v2": createGoogleTranslateResponse([
                "剧情",
                "节奏",
                "演员阵容出色",
                "结尾较弱",
                "整体观感不错",
                "详细分析",
                "高光时刻",
                "难忘场景",
                "观众文本"
            ])
        }
    });

    const payload = JSON.parse(result.body);
    assert.equal(payload.aspect.pros[0].theme, "剧情");
    assert.equal(payload.analysis, "详细分析");

    const cache = parseUnifiedCache(persistentData).google.sentiments;
    assert.equal(cache["movie:123"].translation.aspect.pros[0].translatedText, "剧情");
    assert.equal(cache["movie:123"].translation.analysis.translatedText, "详细分析");
});

createGoogleFailureCases().forEach(({ name, mock }) => {
    test(`sentiments 在${name}时会保留原文且不写入缓存`, async () => {
        const { result, persistentData } = await runResponseCase({
            url: "https://api.trakt.tv/movies/123/sentiments",
            body: readFixture("sentiments.json"),
            httpPostMocks: {
                [GOOGLE_TRANSLATE_URL]: mock
            }
        });

        const payload = JSON.parse(result.body);
        assert.equal(payload.aspect.pros[0].theme, "Story");
        assert.equal(payload.good[0].sentiment, "Great cast");
        assert.equal(payload.text, "Audience text");
        assert.deepEqual(parseUnifiedCache(persistentData).google.sentiments, {});
    });
});

test("sentiments 在 Google 返回空翻译结果时会保留原文并按原文回写缓存", async () => {
    const { result, persistentData } = await runResponseCase({
        url: "https://api.trakt.tv/movies/123/sentiments",
        body: readFixture("sentiments.json"),
        httpPostMocks: {
            "https://translation.googleapis.com/language/translate/v2": createEmptyGoogleTranslateResponse()
        }
    });

    const payload = JSON.parse(result.body);
    assert.equal(payload.aspect.pros[0].theme, "Story");
    assert.equal(payload.good[0].sentiment, "Great cast");
    assert.equal(payload.text, "Audience text");

    const cache = parseUnifiedCache(persistentData).google.sentiments;
    assert.equal(cache["movie:123"].translation.aspect.pros[0].translatedText, "Story");
    assert.equal(cache["movie:123"].translation.good[0].translatedText, "Great cast");
});
