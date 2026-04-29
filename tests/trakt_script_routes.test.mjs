import assert from "node:assert/strict";
import test from "node:test";
import { TRAKT_DIRECT_TRANSLATION_MAX_REFS } from "../trakt_simplified_chinese/src/core/constants.mjs";

import {
    readFixture,
    createMovieTranslationCache,
    createMediaTranslationEntry,
    createWrappedMovieBody,
    createUnifiedPersistentData,
    runRequestCase,
    runResponseCase
} from "./helpers/trakt-test-helpers.mjs";

test("Sofa countries 会注入自定义服务", async () => {
    const { result } = await runResponseCase({
        url: "https://streaming-availability.p.rapidapi.com/countries/us",
        body: readFixture("sofa-countries.json"),
        headers: {
            "user-agent": "Sofa Time/1.0"
        }
    });

    const payload = JSON.parse(result.body);
    assert.deepEqual(payload.services.slice(0, 3).map((item) => item.id), ["eplayerx", "forward", "infuse"]);
    assert.ok(payload.services.some((item) => item.id === "netflix"));
    assert.equal(payload.services.filter((item) => item.id === "forward").length, 1);
});

test("TMDb provider catalog 会注入自定义 provider", async () => {
    const { result } = await runResponseCase({
        url: "https://api.themoviedb.org/3/watch/providers/movie",
        body: readFixture("tmdb-provider-catalog.json"),
        headers: {
            "user-agent": "Sofa Time/1.0"
        }
    });

    const payload = JSON.parse(result.body);
    assert.deepEqual(payload.results.slice(0, 3).map((item) => item.provider_id), [1, 2, 3]);
    assert.ok(payload.results.some((item) => item.provider_id === 8));
    assert.equal(payload.results.filter((item) => item.provider_id === 2).length, 1);
});

test("Sofa streaming availability 会注入自定义 streaming options", async () => {
    const { result } = await runResponseCase({
        url: "https://streaming-availability.p.rapidapi.com/shows/tt1234567",
        body: readFixture("sofa-streaming-availability.json"),
        headers: {
            "user-agent": "Sofa Time/1.0"
        }
    });

    const payload = JSON.parse(result.body);
    assert.equal(payload.tmdbId, "movie/123");
    assert.deepEqual(payload.streamingOptions.us.map((item) => item.service.id), ["eplayerx", "forward", "infuse"]);
    assert.ok(payload.streamingOptions.us.every((item) => typeof item.link === "string" && item.link.length > 0));
});

test("Sofa streaming availability 在 404 时会反查 IMDb 到 TMDb 并返回注入结果", async () => {
    const lookupUrl = "https://film-show-ratings.p.rapidapi.com/item/?id=tt1234567";
    const { result } = await runResponseCase({
        url: "https://streaming-availability.p.rapidapi.com/shows/tt1234567",
        body: readFixture("sofa-streaming-404.json"),
        responseStatus: 404,
        headers: {
            "user-agent": "Sofa Time/1.0",
            "x-rapidapi-key": "test-key"
        },
        httpGetMocks: {
            [lookupUrl]: JSON.stringify({
                result: {
                    type: "film",
                    ids: {
                        TMDB: 987
                    }
                }
            })
        }
    });

    const payload = JSON.parse(result.body);
    assert.equal(result.status, 200);
    assert.equal(payload.tmdbId, "movie/987");
    assert.deepEqual(payload.streamingOptions.us.map((item) => item.service.id), ["eplayerx", "forward", "infuse"]);
});

test("mir 会把缓存中的中文翻译应用到 first_watched 媒体", async () => {
    const { result } = await runResponseCase({
        url: "https://api.trakt.tv/users/me/mir",
        body: readFixture("mir.json"),
        persistentData: createUnifiedPersistentData({
            traktTranslation: JSON.parse(createMovieTranslationCache())
        })
    });

    const payload = JSON.parse(result.body);
    assert.equal(payload.first_watched.movie.title, "中文电影");
    assert.equal(payload.first_watched.movie.overview, "中文简介");
    assert.equal(payload.first_watched.movie.tagline, "中文标语");
});

test("typed recommendations 路由会应用缓存中的中文翻译", async () => {
    const { result } = await runResponseCase({
        url: "https://api.trakt.tv/recommendations/movies",
        body: readFixture("recommendations-movies.json"),
        persistentData: createUnifiedPersistentData({
            traktTranslation: JSON.parse(createMovieTranslationCache())
        })
    });

    const payload = JSON.parse(result.body);
    assert.equal(payload[0].title, "中文电影");
    assert.equal(payload[0].overview, "中文简介");
    assert.equal(payload[0].tagline, "中文标语");
});

test("watchlist typed 路由会应用缓存中的中文翻译", async () => {
    const { result } = await runResponseCase({
        url: "https://api.trakt.tv/users/me/watchlist/movies",
        body: createWrappedMovieBody(),
        persistentData: createUnifiedPersistentData({
            traktTranslation: JSON.parse(createMovieTranslationCache())
        })
    });

    const payload = JSON.parse(result.body);
    assert.equal(payload[0].movie.title, "中文电影");
    assert.equal(payload[0].movie.overview, "中文简介");
});

test("calendar 路由会应用缓存中的中文翻译", async () => {
    const { result } = await runResponseCase({
        url: "https://api.trakt.tv/calendars/all/movies/2025-01-01/7",
        body: createWrappedMovieBody(),
        persistentData: createUnifiedPersistentData({
            traktTranslation: JSON.parse(createMovieTranslationCache())
        })
    });

    const payload = JSON.parse(result.body);
    assert.equal(payload[0].movie.title, "中文电影");
    assert.equal(payload[0].movie.tagline, "中文标语");
});

test("apiz shows popular 路由会应用缓存中的中文翻译", async () => {
    const body = JSON.stringify([
        {
            title: "Original Show Title",
            overview: "Original Show Overview",
            first_aired: "2025-01-01T00:00:00.000Z",
            network: "HBO",
            ids: {
                trakt: 456
            }
        }
    ]);

    const { result } = await runResponseCase({
        url: "https://apiz.trakt.tv/shows/popular?extended=cloud9,full&limit=100&local_name=%E7%83%AD%E9%97%A8%E5%89%A7%E9%9B%86&page=1&ratings=80-100",
        body,
        persistentData: createUnifiedPersistentData({
            traktTranslation: {
                "show:456": createMediaTranslationEntry({
                    translation: {
                        title: "中文剧名",
                        overview: "中文剧集简介",
                        tagline: "中文剧集标语"
                    }
                })
            }
        })
    });

    const payload = JSON.parse(result.body);
    assert.equal(payload[0].title, "中文剧名");
    assert.equal(payload[0].overview, "中文剧集简介");
    assert.equal(payload[0].tagline, "中文剧集标语");
});

test("apiz movies popular 路由会应用缓存中的中文翻译", async () => {
    const body = JSON.stringify([
        {
            title: "Original Movie Title",
            overview: "Original Movie Overview",
            released: "2025-01-01",
            tagline: "Original Movie Tagline",
            ids: {
                trakt: 123
            }
        }
    ]);

    const { result } = await runResponseCase({
        url: "https://apiz.trakt.tv/movies/popular?extended=cloud9,full&limit=100&local_name=%E7%83%AD%E9%97%A8%E7%94%B5%E5%BD%B1&page=1&ratings=80-100",
        body,
        persistentData: createUnifiedPersistentData({
            traktTranslation: {
                "movie:123": createMediaTranslationEntry({
                    translation: {
                        title: "中文电影",
                        overview: "中文简介",
                        tagline: "中文标语"
                    }
                })
            }
        })
    });

    const payload = JSON.parse(result.body);
    assert.equal(payload[0].title, "中文电影");
    assert.equal(payload[0].overview, "中文简介");
    assert.equal(payload[0].tagline, "中文标语");
});

test("apiz movies boxoffice 路由会应用缓存中的中文翻译", async () => {
    const body = JSON.stringify([
        {
            title: "Original Movie Title",
            overview: "Original Movie Overview",
            released: "2025-01-01",
            tagline: "Original Movie Tagline",
            ids: {
                trakt: 123
            }
        }
    ]);

    const { result } = await runResponseCase({
        url: "https://apiz.trakt.tv/movies/boxoffice?extended=full&limit=100&page=1",
        body,
        persistentData: createUnifiedPersistentData({
            traktTranslation: {
                "movie:123": createMediaTranslationEntry({
                    translation: {
                        title: "中文电影",
                        overview: "中文简介",
                        tagline: "中文标语"
                    }
                })
            }
        })
    });

    const payload = JSON.parse(result.body);
    assert.equal(payload[0].title, "中文电影");
    assert.equal(payload[0].overview, "中文简介");
    assert.equal(payload[0].tagline, "中文标语");
});

test(`media list 向 Trakt 批量补翻译时最多只请求 ${TRAKT_DIRECT_TRANSLATION_MAX_REFS} 条`, async () => {
    const body = JSON.stringify(Array.from({ length: TRAKT_DIRECT_TRANSLATION_MAX_REFS + 1 }, (_, index) => {
        const traktId = index + 1000;
        return {
            movie: {
                title: `Original Movie ${traktId}`,
                overview: `Original Overview ${traktId}`,
                released: "2025-01-01",
                ids: {
                    trakt: traktId
                }
            }
        };
    }));

    const translationBody = JSON.stringify([
        {
            language: "zh",
            country: "cn",
            title: "中文电影",
            overview: "中文简介",
            tagline: "中文标语"
        }
    ]);

    const { result } = await runResponseCase({
        url: "https://api.trakt.tv/users/me/watchlist/movies?page=1&limit=501",
        body,
        httpGetMocks: {
            "regex:^https://api\\.trakt\\.tv/movies/\\d+/translations/zh\\?extended=all$": translationBody
        }
    });

    const payload = JSON.parse(result.body);
    assert.equal(payload[0].movie.title, "中文电影");
    assert.equal(payload[TRAKT_DIRECT_TRANSLATION_MAX_REFS - 1].movie.title, "中文电影");
    assert.equal(
        payload[TRAKT_DIRECT_TRANSLATION_MAX_REFS].movie.title,
        `Original Movie ${1000 + TRAKT_DIRECT_TRANSLATION_MAX_REFS}`
    );
});

test("未命中任何已知 handler 的响应会以空结果直接放行", async () => {
    const body = JSON.stringify({
        untouched: true,
        value: 42
    });

    const { result } = await runResponseCase({
        url: "https://api.trakt.tv/sync/unknown-endpoint",
        body
    });

    assert.equal(Object.keys(result).length, 0);
});

test("未命中任何已知 handler 的 request phase 请求会以空结果直接放行", async () => {
    const { result } = await runRequestCase({
        url: "https://api.trakt.tv/sync/unknown-endpoint",
        headers: {
            "user-agent": "UnitTest/1.0",
            "x-demo": "keep"
        }
    });

    assert.equal(Object.keys(result).length, 0);
});

[
    {
        name: "typed trending 路由会应用缓存中的中文翻译",
        url: "https://api.trakt.tv/movies/trending",
        body: createWrappedMovieBody(),
        assertPayload(payload) {
            assert.equal(payload[0].movie.title, "中文电影");
            assert.equal(payload[0].movie.overview, "中文简介");
        }
    },
    {
        name: "media recommendations 路由会应用缓存中的中文翻译",
        url: "https://api.trakt.tv/media/recommendations",
        body: createWrappedMovieBody(),
        assertPayload(payload) {
            assert.equal(payload[0].movie.title, "中文电影");
            assert.equal(payload[0].movie.tagline, "中文标语");
        }
    },
    {
        name: "favorites 路由会应用缓存中的中文翻译",
        url: "https://api.trakt.tv/users/me/favorites/movies",
        body: createWrappedMovieBody(),
        assertPayload(payload) {
            assert.equal(payload[0].movie.title, "中文电影");
            assert.equal(payload[0].movie.overview, "中文简介");
        }
    },
    {
        name: "ratings all 路由会应用缓存中的中文翻译",
        url: "https://api.trakt.tv/users/me/ratings/all",
        body: createWrappedMovieBody(),
        assertPayload(payload) {
            assert.equal(payload[0].movie.title, "中文电影");
            assert.equal(payload[0].movie.tagline, "中文标语");
        }
    },
    {
        name: "media anticipated 路由会应用缓存中的中文翻译",
        url: "https://api.trakt.tv/media/anticipated",
        body: createWrappedMovieBody(),
        assertPayload(payload) {
            assert.equal(payload[0].movie.title, "中文电影");
            assert.equal(payload[0].movie.overview, "中文简介");
        }
    },
    {
        name: "media popular next 路由会应用缓存中的中文翻译",
        url: "https://api.trakt.tv/media/popular/next",
        body: createWrappedMovieBody(),
        assertPayload(payload) {
            assert.equal(payload[0].movie.title, "中文电影");
            assert.equal(payload[0].movie.tagline, "中文标语");
        }
    },
    {
        name: "sync watched 路由会应用缓存中的中文翻译",
        url: "https://api.trakt.tv/sync/watched/movies",
        body: createWrappedMovieBody(),
        assertPayload(payload) {
            assert.equal(payload[0].movie.title, "中文电影");
            assert.equal(payload[0].movie.overview, "中文简介");
        }
    },
    {
        name: "collection typed 路由会应用缓存中的中文翻译",
        url: "https://api.trakt.tv/users/me/collection/movies",
        body: createWrappedMovieBody(),
        assertPayload(payload) {
            assert.equal(payload[0].movie.title, "中文电影");
            assert.equal(payload[0].movie.tagline, "中文标语");
        }
    },
    {
        name: "following activities 路由会应用缓存中的中文翻译",
        url: "https://api.trakt.tv/users/me/following/activities",
        body: createWrappedMovieBody(),
        assertPayload(payload) {
            assert.equal(payload[0].movie.title, "中文电影");
            assert.equal(payload[0].movie.overview, "中文简介");
        }
    },
    {
        name: "public list items 路由会应用缓存中的中文翻译",
        url: "https://api.trakt.tv/lists/321/items",
        body: createWrappedMovieBody(),
        assertPayload(payload) {
            assert.equal(payload[0].movie.title, "中文电影");
            assert.equal(payload[0].movie.tagline, "中文标语");
        }
    }
].forEach(({ name, url, body, assertPayload }) => {
    test(name, async () => {
        const { result } = await runResponseCase({
            url,
            body,
            persistentData: createUnifiedPersistentData({
                traktTranslation: JSON.parse(createMovieTranslationCache())
            })
        });

        const payload = JSON.parse(result.body);
        assertPayload(payload);
    });
});
