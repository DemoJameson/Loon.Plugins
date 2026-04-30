import assert from "node:assert/strict";
import test from "node:test";
import { TRAKT_DIRECT_TRANSLATION_MAX_REFS } from "../trakt_simplified_chinese/src/domains/media-translation/handlers.mjs";
import {
    createResponsePhaseRoutes,
    createResponseRouteContext
} from "../trakt_simplified_chinese/src/routing/response-routes.mjs";

import {
    readFixture,
    computeStringHash,
    createMovieTranslationCache,
    createMediaTranslationEntry,
    createCommentTranslationCache,
    createListTranslationCache,
    createPeopleTranslationCache,
    createSentimentTranslationCache,
    createWrappedMovieBody,
    createUnifiedPersistentData,
    runRequestCase,
    runResponseCase
} from "./helpers/trakt-test-helpers.mjs";

function createMoviePersistentData() {
    return createUnifiedPersistentData({
        traktTranslation: JSON.parse(createMovieTranslationCache())
    });
}

function createShowPersistentData() {
    return createUnifiedPersistentData({
        traktTranslation: {
            "show:456": createMediaTranslationEntry({
                translation: {
                    title: "中文剧名",
                    overview: "中文剧集简介",
                    tagline: "中文剧集标语"
                }
            })
        }
    });
}

function createEpisodePersistentData() {
    return createUnifiedPersistentData({
        traktTranslation: {
            "episode:555:1:1": createMediaTranslationEntry({
                translation: {
                    title: "第一集中文",
                    overview: "第一集中文简介",
                    tagline: "第一集中文标语"
                }
            }),
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
        }
    });
}

function createResponseRouteStubs() {
    return createResponsePhaseRoutes({
        handleComments() {},
        handleDirectMediaList() {},
        handleHistoryEpisodeList() {},
        handleList() {},
        handleMediaDetail() {},
        handlePeopleSearchList() {},
        handleMediaPeopleList() {},
        handleMonthlyReview() {},
        handlePeopleDetail() {},
        handlePersonMediaCreditsList() {},
        handleRecentCommentsList() {},
        handleSeasonEpisodesList() {},
        handleSentiments() {},
        handleSofaTimeCountries() {},
        handleSofaTimeStreamingAvailability() {},
        handleTmdbProviderCatalog() {},
        handleTranslations() {},
        handleUserSettings() {},
        handleWatchnow() {},
        handleWatchnowSources() {},
        handleWrapperMediaList() {},
        mediaTypes: {
            SHOW: "show",
            MOVIE: "movie",
            EPISODE: "episode"
        }
    });
}

function createDirectMovieBody() {
    return readFixture("recommendations-movies.json");
}

function createDirectShowBody() {
    return JSON.stringify([
        {
            title: "Original Show Title",
            overview: "Original Show Overview",
            first_aired: "2025-01-01T00:00:00.000Z",
            network: "HBO",
            tagline: "Original Show Tagline",
            ids: {
                trakt: 456
            }
        }
    ]);
}

function createMixedMovieBody(extra = {}) {
    return JSON.stringify([
        {
            type: "movie",
            movie: JSON.parse(readFixture("recommendations-movies.json"))[0],
            ...extra
        }
    ]);
}

function createUpNextBody() {
    return JSON.stringify([
        {
            show: {
                title: "Original Show Title",
                overview: "Original Show Overview",
                first_aired: "2025-01-01T00:00:00.000Z",
                network: "HBO",
                tagline: "Original Show Tagline",
                ids: {
                    trakt: 555
                }
            },
            progress: {
                next_episode: {
                    season: 1,
                    number: 2,
                    title: "Original Episode Title",
                    overview: "Original Episode Overview",
                    ids: {
                        trakt: 1001
                    }
                }
            }
        }
    ]);
}

function createListWrapperBody() {
    return JSON.stringify([
        {
            type: "list",
            list: JSON.parse(readFixture("list-descriptions.json"))[0]
        }
    ]);
}

function createProminentListBody() {
    return JSON.stringify([
        {
            like_count: 12,
            comment_count: 3,
            list: JSON.parse(readFixture("list-descriptions.json"))[0]
        }
    ]);
}

function createEpisodeCommentPersistentData() {
    return createUnifiedPersistentData({
        googleComments: JSON.parse(createCommentTranslationCache())
    });
}

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

test("handleList 按 direct list、wrapped list 与 prominent list 路由分组生效", async (t) => {
    const persistentData = createUnifiedPersistentData({
        googleList: JSON.parse(createListTranslationCache({
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
        }))
    });

    const cases = [
        {
            name: "media lists direct array",
            url: "https://api.trakt.tv/movies/123/lists/popular",
            body: readFixture("list-descriptions.json")
        },
        {
            name: "users likes lists wrapped array",
            url: "https://api.trakt.tv/users/me/likes/lists",
            body: createListWrapperBody()
        },
        {
            name: "users lists collaborations direct array",
            url: "https://api.trakt.tv/users/me/lists/collaborations",
            body: readFixture("list-descriptions.json")
        },
        {
            name: "search list wrapped array",
            url: "https://api.trakt.tv/search/list?query=test",
            body: createListWrapperBody()
        },
        {
            name: "lists popular prominent wrapper array",
            url: "https://api.trakt.tv/lists/popular",
            body: createProminentListBody()
        }
    ];

    for (const item of cases) {
        await t.test(item.name, async () => {
            const { result } = await runResponseCase({
                url: item.url,
                body: item.body,
                persistentData
            });

            const payload = JSON.parse(result.body);
            const target = payload[0].list ?? payload[0];
            assert.equal(target.name, "收藏夹");
            assert.equal(target.description, "一个不错的列表");
        });
    }
});

test("handleDirectMediaList 按 direct summary 路由分组生效", async (t) => {
    const cases = [
        {
            name: "typed recommendations direct movie summary",
            url: "https://api.trakt.tv/recommendations/movies",
            body: createDirectMovieBody(),
            persistentData: createMoviePersistentData(),
            assertPayload(payload) {
                assert.equal(payload[0].title, "中文电影");
            }
        },
        {
            name: "typed popular direct show summary",
            url: "https://api.trakt.tv/shows/popular",
            body: createDirectShowBody(),
            persistentData: createShowPersistentData(),
            assertPayload(payload) {
                assert.equal(payload[0].title, "中文剧名");
            }
        },
        {
            name: "mixed popular wrapper show summary",
            url: "https://api.trakt.tv/media/popular/next",
            body: JSON.stringify([
                {
                    show: {
                        title: "Original Show Title",
                        overview: "Original Show Overview",
                        first_aired: "2025-01-01T00:00:00.000Z",
                        network: "HBO",
                        tagline: "Original Show Tagline",
                        ids: {
                            trakt: 456
                        }
                    }
                }
            ]),
            persistentData: createShowPersistentData(),
            assertPayload(payload) {
                assert.equal(payload[0].show.title, "中文剧名");
            }
        },
        {
            name: "boxoffice direct movie summary",
            url: "https://api.trakt.tv/movies/boxoffice",
            body: createDirectMovieBody(),
            persistentData: createMoviePersistentData(),
            assertPayload(payload) {
                assert.equal(payload[0].title, "中文电影");
            }
        }
    ];

    for (const item of cases) {
        await t.test(item.name, async () => {
            const { result } = await runResponseCase({
                url: item.url,
                body: item.body,
                persistentData: item.persistentData
            });

            item.assertPayload(JSON.parse(result.body));
        });
    }
});

test("handleWrapperMediaList 按 wrapper 路由分组生效", async (t) => {
    const cases = [
        {
            name: "typed trending wrapper array",
            url: "https://api.trakt.tv/movies/trending",
            body: createWrappedMovieBody(),
            persistentData: createMoviePersistentData(),
            assertPayload(payload) {
                assert.equal(payload[0].movie.title, "中文电影");
            }
        },
        {
            name: "mixed trending wrapper array",
            url: "https://api.trakt.tv/media/trending",
            body: createMixedMovieBody({ watchers: 9 }),
            persistentData: createMoviePersistentData(),
            assertPayload(payload) {
                assert.equal(payload[0].movie.title, "中文电影");
                assert.equal(payload[0].watchers, 9);
            }
        },
        {
            name: "typed anticipated stats wrapper",
            url: "https://api.trakt.tv/movies/anticipated",
            body: createMixedMovieBody({ list_count: 99 }),
            persistentData: createMoviePersistentData(),
            assertPayload(payload) {
                assert.equal(payload[0].movie.title, "中文电影");
                assert.equal(payload[0].list_count, 99);
            }
        },
        {
            name: "mixed recommendations wrapper",
            url: "https://api.trakt.tv/media/recommendations",
            body: createMixedMovieBody(),
            persistentData: createMoviePersistentData(),
            assertPayload(payload) {
                assert.equal(payload[0].movie.title, "中文电影");
            }
        },
        {
            name: "watchlist mixed route",
            url: "https://api.trakt.tv/users/me/watchlist/movie,show/rank",
            body: createMixedMovieBody(),
            persistentData: createMoviePersistentData(),
            assertPayload(payload) {
                assert.equal(payload[0].movie.title, "中文电影");
            }
        },
        {
            name: "watchlist typed released route",
            url: "https://api.trakt.tv/users/me/watchlist/movies/released/desc",
            body: createWrappedMovieBody(),
            persistentData: createMoviePersistentData(),
            assertPayload(payload) {
                assert.equal(payload[0].movie.title, "中文电影");
            }
        },
        {
            name: "favorites mixed route",
            url: "https://api.trakt.tv/users/me/favorites/media/rank",
            body: createMixedMovieBody(),
            persistentData: createMoviePersistentData(),
            assertPayload(payload) {
                assert.equal(payload[0].movie.title, "中文电影");
            }
        },
        {
            name: "collection mixed route",
            url: "https://api.trakt.tv/users/me/collection/media",
            body: createMixedMovieBody(),
            persistentData: createMoviePersistentData(),
            assertPayload(payload) {
                assert.equal(payload[0].movie.title, "中文电影");
            }
        },
        {
            name: "sync history typed route",
            url: "https://api.trakt.tv/sync/history/movies",
            body: createWrappedMovieBody(),
            persistentData: createMoviePersistentData(),
            assertPayload(payload) {
                assert.equal(payload[0].movie.title, "中文电影");
            }
        },
        {
            name: "list items mixed route",
            url: "https://api.trakt.tv/lists/321/items/movie,show",
            body: createMixedMovieBody(),
            persistentData: createMoviePersistentData(),
            assertPayload(payload) {
                assert.equal(payload[0].movie.title, "中文电影");
            }
        },
        {
            name: "up-next wrapper route",
            url: "https://api.trakt.tv/sync/progress/up_next_nitro",
            body: createUpNextBody(),
            persistentData: createEpisodePersistentData(),
            assertPayload(payload) {
                assert.equal(payload[0].progress.next_episode.title, "第二集中文");
            }
        },
        {
            name: "playback wrapper route",
            url: "https://api.trakt.tv/sync/playback/movies",
            body: createWrappedMovieBody(),
            persistentData: createMoviePersistentData(),
            assertPayload(payload) {
                assert.equal(payload[0].movie.title, "中文电影");
            }
        }
    ];

    for (const item of cases) {
        await t.test(item.name, async () => {
            const { result } = await runResponseCase({
                url: item.url,
                body: item.body,
                persistentData: item.persistentData
            });

            item.assertPayload(JSON.parse(result.body));
        });
    }
});

test("handleHistoryEpisodeList 覆盖 users 与 sync episode history 路由", async (t) => {
    const cases = [
        "https://api.trakt.tv/users/me/history/episodes?page=1&limit=10",
        "https://api.trakt.tv/sync/history/episodes"
    ];

    for (const url of cases) {
        await t.test(url, async () => {
            const { result } = await runResponseCase({
                url,
                body: readFixture("history-episodes.json"),
                headers: {
                    "user-agent": "Infuse/8.0"
                },
                httpGetMocks: {
                    "https://api.trakt.tv/shows/555/translations/zh?extended=all": "[]",
                    "https://api.trakt.tv/shows/777/translations/zh?extended=all": "[]"
                },
                persistentData: createEpisodePersistentData()
            });

            const payload = JSON.parse(result.body);
            assert.equal(payload[0].episode.title, "第二集中文");
        });
    }
});

test("handleRecentCommentsList 覆盖 recent comments 媒体包装路由", async () => {
    const { result } = await runResponseCase({
        url: "https://api.trakt.tv/comments/recent/movies/weekly",
        body: readFixture("recent-comments.json"),
        persistentData: createUnifiedPersistentData({
            traktTranslation: JSON.parse(createMovieTranslationCache()),
            googleComments: JSON.parse(createCommentTranslationCache())
        })
    });

    const payload = JSON.parse(result.body);
    assert.equal(payload[0].movie.title, "中文电影");
    assert.equal(payload[0].comment.comment, "很棒的电影");
});

test("handleComments 覆盖 media comments、episode comments 与 replies 路由", async (t) => {
    const cases = [
        "https://api.trakt.tv/movies/123/comments/newest",
        "https://api.trakt.tv/shows/555/seasons/1/episodes/2/comments/newest",
        "https://api.trakt.tv/comments/123/replies"
    ];

    for (const url of cases) {
        await t.test(url, async () => {
            const { result } = await runResponseCase({
                url,
                body: readFixture("comments.json"),
                persistentData: createEpisodeCommentPersistentData()
            });

            const payload = JSON.parse(result.body);
            assert.equal(payload[0].comment, "很棒的电影");
        });
    }
});

test("handleMediaPeopleList 覆盖 movie、show 与 episode people 路由", async (t) => {
    const cases = [
        "https://api.trakt.tv/movies/123/people",
        "https://api.trakt.tv/shows/555/people",
        "https://api.trakt.tv/shows/555/seasons/1/episodes/2/people"
    ];

    for (const url of cases) {
        await t.test(url, async () => {
            const { result } = await runResponseCase({
                url,
                body: readFixture("media-people-list.json"),
                persistentData: createUnifiedPersistentData({
                    googlePeople: JSON.parse(createPeopleTranslationCache())
                })
            });

            const payload = JSON.parse(result.body);
            assert.match(payload.cast[0].person.name, /^汤姆·汉克斯/);
        });
    }
});

test("handlePeopleSearchList 覆盖 search person 与 people this_month 路由", async (t) => {
    const cases = [
        {
            url: "https://api.trakt.tv/search/person?extended=cloud9,full&limit=100&page=1&query=gong",
            body: JSON.stringify([
                {
                    type: "person",
                    score: 1,
                    person: {
                        name: "Tom Hanks",
                        biography: "An American actor and filmmaker.",
                        ids: {
                            trakt: 42
                        }
                    }
                }
            ])
        },
        {
            url: "https://api.trakt.tv/people/this_month?extended=cloud9,full",
            body: JSON.stringify([
                {
                    name: "Tom Hanks",
                    biography: "An American actor and filmmaker.",
                    ids: {
                        trakt: 42
                    }
                }
            ])
        }
    ];

    for (const item of cases) {
        await t.test(item.url, async () => {
            const { result } = await runResponseCase({
                url: item.url,
                body: item.body,
                persistentData: createUnifiedPersistentData({
                    googlePeople: JSON.parse(createPeopleTranslationCache())
                })
            });

            const payload = JSON.parse(result.body);
            const person = payload[0].person ?? payload[0];
            assert.match(person.name, /^汤姆·汉克斯/);
            assert.equal(person.biography, "一位美国演员和电影制作人。");
        });
    }
});

test("handlePersonMediaCreditsList 覆盖 people movie credits 与 show credits 路由", async (t) => {
    const cases = [
        {
            name: "movie credits",
            url: "https://api.trakt.tv/people/42/movies",
            body: readFixture("people-credits.json"),
            persistentData: createMoviePersistentData()
        },
        {
            name: "show credits",
            url: "https://api.trakt.tv/people/42/shows",
            body: JSON.stringify({
                cast: [
                    {
                        show: {
                            title: "Original Show Title",
                            overview: "Original Show Overview",
                            first_aired: "2025-01-01T00:00:00.000Z",
                            network: "HBO",
                            tagline: "Original Show Tagline",
                            ids: {
                                trakt: 456
                            }
                        }
                    }
                ],
                crew: {}
            }),
            persistentData: createShowPersistentData()
        }
    ];

    for (const item of cases) {
        await t.test(item.name, async () => {
            const { result } = await runResponseCase({
                url: item.url,
                body: item.body,
                headers: {
                    "user-agent": "Rippple/1.0"
                },
                persistentData: item.persistentData
            });

            const payload = JSON.parse(result.body);
            const target = payload.cast[0].movie ?? payload.cast[0].show;
            assert.match(target.title, /^中文/);
        });
    }
});

test("handleMir 会把缓存中的中文翻译应用到 first_watched 媒体", async () => {
    const { result } = await runResponseCase({
        url: "https://api.trakt.tv/users/me/mir",
        body: readFixture("mir.json"),
        persistentData: createMoviePersistentData()
    });

    const payload = JSON.parse(result.body);
    assert.equal(payload.first_watched.movie.title, "中文电影");
    assert.equal(payload.first_watched.movie.overview, "中文简介");
    assert.equal(payload.first_watched.movie.tagline, "中文标语");
});

test("handleMediaDetail 覆盖 movie、show 与 episode detail 路由", async (t) => {
    const cases = [
        {
            name: "movie detail",
            url: "https://api.trakt.tv/movies/123",
            body: readFixture("movie-detail.json"),
            persistentData: createUnifiedPersistentData({
                traktTranslation: JSON.parse(createMovieTranslationCache({
                    "movie:123": createMediaTranslationEntry({
                        translation: {
                            title: "中文电影",
                            overview: "中文简介",
                            tagline: "中文标语"
                        }
                    })
                }))
            }),
            assertPayload(payload) {
                assert.equal(payload.title, "中文电影");
            }
        },
        {
            name: "show detail",
            url: "https://api.trakt.tv/shows/456",
            body: JSON.stringify({
                title: "Original Show Title",
                overview: "Original Show Overview",
                first_aired: "2025-01-01T00:00:00.000Z",
                network: "HBO",
                tagline: "Original Show Tagline",
                ids: {
                    trakt: 456
                }
            }),
            persistentData: createShowPersistentData(),
            assertPayload(payload) {
                assert.equal(payload.title, "中文剧名");
            }
        },
        {
            name: "episode detail",
            url: "https://api.trakt.tv/shows/555/seasons/1/episodes/2",
            body: JSON.stringify({
                season: 1,
                number: 2,
                title: "Original Episode Title",
                overview: "Original Episode Overview",
                ids: {
                    trakt: 1001
                }
            }),
            persistentData: createEpisodePersistentData(),
            assertPayload(payload) {
                assert.equal(payload.title, "第二集中文");
            }
        }
    ];

    for (const item of cases) {
        await t.test(item.name, async () => {
            const { result } = await runResponseCase({
                url: item.url,
                body: item.body,
                persistentData: item.persistentData
            });

            item.assertPayload(JSON.parse(result.body));
        });
    }
});

test("handlePeopleDetail 覆盖 /people/:id 路由", async () => {
    const { result } = await runResponseCase({
        url: "https://api.trakt.tv/people/42",
        body: readFixture("people-detail.json"),
        persistentData: createUnifiedPersistentData({
            googlePeople: JSON.parse(createPeopleTranslationCache())
        })
    });

    const payload = JSON.parse(result.body);
    assert.match(payload.name, /^汤姆·汉克斯/);
    assert.equal(payload.biography, "一位美国演员和电影制作人。");
});

test("handleTranslations 覆盖 movie、show 与 episode /translations/zh 路由", async (t) => {
    const cases = [
        {
            name: "movie translations",
            url: "https://api.trakt.tv/movies/123/translations/zh?extended=all",
            body: readFixture("translations.json")
        },
        {
            name: "show translations",
            url: "https://api.trakt.tv/shows/456/translations/zh?extended=all",
            body: readFixture("translations.json")
        },
        {
            name: "episode translations",
            url: "https://api.trakt.tv/shows/555/seasons/1/episodes/2/translations/zh?extended=all",
            body: JSON.stringify([
                {
                    language: "zh",
                    country: "cn",
                    title: "剧集中文标题",
                    overview: "剧集中文简介"
                }
            ])
        }
    ];

    for (const item of cases) {
        await t.test(item.name, async () => {
            const { result } = await runResponseCase({
                url: item.url,
                body: item.body
            });

            const payload = JSON.parse(result.body);
            assert.equal(payload[0].country, "cn");
        });
    }
});

test("handleSentiments 覆盖原生 sentiments 与代理兼容路由", async (t) => {
    const googleSentiments = JSON.parse(createSentimentTranslationCache());
    googleSentiments["movie:853702"] = JSON.parse(JSON.stringify(googleSentiments["movie:123"]));

    const cases = [
        {
            name: "native movie sentiments",
            url: "https://api.trakt.tv/movies/123/sentiments",
            persistentData: createUnifiedPersistentData({
                googleSentiments: JSON.parse(createSentimentTranslationCache())
            })
        },
        {
            name: "proxy media info version route",
            url: "https://apiz.trakt.tv/v3/media/movie/853702/info/5/version/1",
            persistentData: createUnifiedPersistentData({
                googleSentiments
            })
        }
    ];

    for (const item of cases) {
        await t.test(item.name, async () => {
            const { result } = await runResponseCase({
                url: item.url,
                body: readFixture("sentiments.json"),
                persistentData: item.persistentData
            });

            const payload = JSON.parse(result.body);
            assert.equal(payload.aspect.pros[0].theme, "剧情");
        });
    }
});

test("handleSeasonEpisodesList 覆盖 /shows/:id/seasons 路由", async () => {
    const { result } = await runResponseCase({
        url: "https://api.trakt.tv/shows/555/seasons",
        body: readFixture("season-list.json"),
        persistentData: createUnifiedPersistentData({
            persistentCurrentSeason: { showId: "555", seasonNumber: 1 },
            traktTranslation: {
                "episode:555:1:1": createMediaTranslationEntry({
                    translation: {
                        title: "第一集中文",
                        overview: "第一集中文简介",
                        tagline: "第一集中文标语"
                    }
                }),
                "episode:555:1:2": createMediaTranslationEntry({
                    translation: {
                        title: "第二集中文",
                        overview: "第二集中文简介",
                        tagline: "第二集中文标语"
                    }
                })
            }
        })
    });

    const payload = JSON.parse(result.body);
    assert.equal(payload[0].episodes[0].title, "第一集中文");
    assert.equal(payload[0].episodes[1].title, "第二集中文");
});

test("response phase migrated conditions 逐条覆盖且互斥", () => {
    const routes = createResponseRouteStubs();
    const cases = [
        ["users.settings", "https://api.trakt.tv/users/settings"],
        ["tmdb.watchProviders", "https://api.themoviedb.org/3/watch/providers/movie"],
        ["tmdb.watchProviders", "https://api.themoviedb.org/3/watch/providers/tv"],
        ["streamingAvailability.showByImdb", "https://streaming-availability.p.rapidapi.com/shows/tt1234567"],
        ["streamingAvailability.countries", "https://streaming-availability.p.rapidapi.com/countries/us"],
        ["watchnow.sources", "https://api.trakt.tv/watchnow/sources"],
        ["media.people", "https://api.trakt.tv/movies/123/people"],
        ["media.people", "https://api.trakt.tv/shows/123/people"],
        ["shows.episode.people", "https://api.trakt.tv/shows/123/seasons/1/episodes/2/people"],
        ["media.comments", "https://api.trakt.tv/movies/123/comments/newest"],
        ["media.comments", "https://api.trakt.tv/shows/123/comments/newest"],
        ["shows.episode.comments", "https://api.trakt.tv/shows/123/seasons/1/episodes/2/comments/newest"],
        ["comments.replies", "https://api.trakt.tv/comments/123/replies"],
        ["media.translations.zh", "https://api.trakt.tv/movies/123/translations/zh?extended=all"],
        ["media.translations.zh", "https://api.trakt.tv/shows/123/translations/zh?extended=all"],
        ["shows.episode.translations.zh", "https://api.trakt.tv/shows/123/seasons/1/episodes/2/translations/zh?extended=all"],
        ["media.watchnow", "https://api.trakt.tv/movies/123/watchnow"],
        ["media.watchnow", "https://api.trakt.tv/shows/123/watchnow"],
        ["episodes.watchnow", "https://api.trakt.tv/episodes/123/watchnow"],
        ["shows.seasons", "https://api.trakt.tv/shows/123/seasons"],
        ["media.proxySentiments", "https://apiz.trakt.tv/v3/media/movie/123/info/5/version/1"],
        ["media.proxySentiments", "https://apiz.trakt.tv/v3/media/show/123/info/5/version/1"],
        ["media.sentiments", "https://api.trakt.tv/movies/123/sentiments"],
        ["media.sentiments", "https://api.trakt.tv/shows/123/sentiments"],
        ["movies.summary", "https://api.trakt.tv/movies/123"],
        ["shows.summary", "https://api.trakt.tv/shows/123"],
        ["shows.episode.summary", "https://api.trakt.tv/shows/123/seasons/1/episodes/2"],
        ["people.summary", "https://api.trakt.tv/people/42"]
    ];

    for (const [expectedId, url] of cases) {
        const context = createResponseRouteContext(url);
        const matchedRoutes = routes.filter((route) => Boolean(route.match(context)));
        assert.deepEqual(
            matchedRoutes.map((route) => route.id),
            [expectedId],
            `Expected exactly one route match for ${url}`
        );
    }
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
