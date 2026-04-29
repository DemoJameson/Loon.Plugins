import assert from "node:assert/strict";
import { before, test } from "node:test";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let core;

before(async () => {
    const basePath = path.resolve(__dirname, "..", "trakt_simplified_chinese", "src");
    const [config, constants, history, media, translations, watchnow] = await Promise.all([
        import(pathToFileURL(path.join(basePath, "core", "config.mjs")).href),
        import(pathToFileURL(path.join(basePath, "core", "constants.mjs")).href),
        import(pathToFileURL(path.join(basePath, "core", "history.mjs")).href),
        import(pathToFileURL(path.join(basePath, "core", "media.mjs")).href),
        import(pathToFileURL(path.join(basePath, "core", "translations.mjs")).href),
        import(pathToFileURL(path.join(basePath, "core", "watchnow.mjs")).href)
    ]);

    core = {
        ...config,
        ...constants,
        ...history,
        ...media,
        ...translations,
        ...watchnow
    };
});

test("参数配置支持对象覆盖", () => {
    const config = core.createDefaultArgumentConfig();
    core.applyArgumentObjectConfig(config, {
        latestHistoryEpisodeOnly: "false",
        eplayerxEnabled: 0,
        backendBaseUrl: " https://example.com/api/ "
    });

    assert.equal(config.latestHistoryEpisodeOnly, false);
    assert.equal(config.playerButtonEnabled.eplayerx, false);
    assert.equal(config.backendBaseUrl, "https://example.com/api/");
});

test("参数配置支持按顺序解析字符串覆盖", () => {
    const config = core.createDefaultArgumentConfig();
    core.applyArgumentStringConfig(config, "[false,true,false,true,false,true,https://demo.example]");

    assert.equal(config.latestHistoryEpisodeOnly, false);
    assert.equal(config.commentTranslationEnabled, true);
    assert.equal(config.playerButtonEnabled.eplayerx, false);
    assert.equal(config.playerButtonEnabled.forward, true);
    assert.equal(config.playerButtonEnabled.infuse, false);
    assert.equal(config.useShortcutsJumpEnabled, true);
    assert.equal(config.backendBaseUrl, "https://demo.example");
});

test("布尔和文本参数解析在异常输入下会回退到默认值", () => {
    assert.equal(core.parseBooleanArgument("maybe", true), true);
    assert.equal(core.parseBooleanArgument("off", true), false);
    assert.equal(core.parseBooleanArgument(0, true), false);
    assert.equal(core.readTextArgument("   ", "fallback"), "fallback");
    assert.equal(core.parseArgumentValue(undefined, "fallback"), "fallback");
});

test("历史记录请求 URL 仅在需要时提升 limit", () => {
    assert.equal(
        core.buildMinimumLimitRequestUrl("https://api.trakt.tv/users/me/history/episodes?page=1&limit=10", 500),
        "https://api.trakt.tv/users/me/history/episodes?page=1&limit=500"
    );
    assert.equal(
        core.buildHistoryEpisodesRequestUrl("https://api.trakt.tv/users/me/history/episodes?page=1&limit=800", true),
        "https://api.trakt.tv/users/me/history/episodes?page=1&limit=800"
    );
    assert.equal(
        core.buildMinimumLimitRequestUrl("not-a-url", 500),
        "not-a-url"
    );
    assert.equal(
        core.buildRipppleHistoryRequestUrl("https://api.trakt.tv/users/me/history?page=1&limit=20", true),
        "https://api.trakt.tv/users/me/history?page=1&limit=100"
    );
});

test("buildMinimumLimitRequestUrl 保留其他 query 参数并在缺失 limit 时补齐下限", () => {
    assert.equal(
        core.buildMinimumLimitRequestUrl("https://api.trakt.tv/users/me/history/episodes?page=2&type=shows", 500),
        "https://api.trakt.tv/users/me/history/episodes?page=2&type=shows&limit=500"
    );
    assert.equal(
        core.buildMinimumLimitRequestUrl("https://api.trakt.tv/users/me/history/episodes?page=2&type=shows&limit=800", 500),
        "https://api.trakt.tv/users/me/history/episodes?page=2&type=shows&limit=800"
    );
    assert.equal(
        core.buildMinimumLimitRequestUrl("https://api.trakt.tv/users/me/history/episodes?type=shows&sort=desc&limit=20&page=3", 500),
        "https://api.trakt.tv/users/me/history/episodes?type=shows&sort=desc&limit=500&page=3"
    );
});

test("watchnow favorites 只注入一次自定义播放器", () => {
    const favorites = core.injectWatchnowFavoriteSources(["sg-netflix", "sg-eplayerx"], "sg");
    assert.deepEqual(favorites.slice(0, 3), ["sg-eplayerx", "sg-forward", "sg-infuse"]);
    assert.equal(favorites.filter((item) => item === "sg-eplayerx").length, 1);
});

test("watchnow sources 注入自定义 provider 并保留现有条目", () => {
    const payload = [{ us: [{ source: "netflix", name: "Netflix" }, { source: "forward", name: "Old Forward" }] }];
    const injected = core.injectCustomSourcesIntoPayload(payload);
    const sources = injected[0].us.map((item) => item.source);

    assert.deepEqual(sources.slice(0, 3), ["infuse", "forward", "eplayerx"]);
    assert.ok(sources.includes("netflix"));
    assert.equal(sources.filter((item) => item === "forward").length, 1);
});

test("watchnow target 能正确解析 movie、show、episode 三类路径", () => {
    assert.deepEqual(core.resolveWatchnowTarget("https://api.trakt.tv/movies/123/watchnow"), {
        mediaType: core.MEDIA_TYPE.MOVIE,
        traktId: "123"
    });
    assert.deepEqual(core.resolveWatchnowTarget("https://api.trakt.tv/shows/456/watchnow?extended=full"), {
        mediaType: core.MEDIA_TYPE.SHOW,
        traktId: "456"
    });
    assert.deepEqual(core.resolveWatchnowTarget("https://api.trakt.tv/episodes/789/watchnow"), {
        mediaType: core.MEDIA_TYPE.EPISODE,
        traktId: "789"
    });
    assert.equal(core.resolveWatchnowTarget("https://api.trakt.tv/movies/123"), null);
});

test("watchnow custom entries 会注入到各区域并替换重复自定义 source", () => {
    const payload = {
        us: {
            free: [
                { source: "forward", link: "old-forward" },
                { source: "hulu", link: "hulu-link" }
            ]
        },
        hk: {
            free: [
                { source: "infuse", link: "old-infuse" }
            ]
        }
    };
    const customEntries = [
        { source: "eplayerx", link: "new-eplayerx" },
        { source: "forward", link: "new-forward" }
    ];

    const injected = core.injectCustomWatchnowEntriesIntoPayload(payload, customEntries, ["us", "hk"]);
    assert.deepEqual(injected.us.free.map((item) => item.source), ["eplayerx", "forward", "hulu"]);
    assert.deepEqual(injected.hk.free.map((item) => item.source), ["eplayerx", "forward"]);
});

test("历史剧集列表按剧集只保留最新一条记录", () => {
    const items = [
        { id: 1, show: { ids: { trakt: 100 } }, episode: { season: 1, number: 1 }, watched_at: "2024-01-01T00:00:00Z" },
        { id: 2, show: { ids: { trakt: 100 } }, episode: { season: 1, number: 3 }, watched_at: "2024-01-02T00:00:00Z" },
        { id: 3, show: { ids: { trakt: 200 } }, episode: { season: 2, number: 1 }, watched_at: "2024-01-03T00:00:00Z" }
    ];

    const filtered = core.keepLatestHistoryEpisodes(items);
    assert.deepEqual(filtered.map((item) => item.id), [2, 3]);
});

test("history episodes bucket key 和页码解析会忽略 page 与 limit", () => {
    const url = "https://api.trakt.tv/users/me/history/episodes?page=3&limit=20&type=shows&query=test";
    assert.equal(
        core.getHistoryEpisodesCacheBucketKey(url),
        "https://api.trakt.tv/users/me/history/episodes?query=test&type=shows"
    );
    assert.equal(core.getHistoryEpisodesPageNumber(url), 3);
    assert.equal(core.getHistoryEpisodesPageNumber("https://api.trakt.tv/users/me/history/episodes"), 1);
});

test("history episodes 跨页过滤会记录第一页并过滤后续页重复 show", () => {
    const page1 = [
        { id: 1, show: { ids: { trakt: 100 } }, episode: { season: 1, number: 1 } },
        { id: 2, show: { ids: { trakt: 200 } }, episode: { season: 1, number: 2 } }
    ];
    const page2 = [
        { id: 3, show: { ids: { trakt: 100 } }, episode: { season: 1, number: 3 } },
        { id: 4, show: { ids: { trakt: 300 } }, episode: { season: 2, number: 1 } }
    ];
    const url1 = "https://api.trakt.tv/users/me/history/episodes?page=1&limit=500";
    const url2 = "https://api.trakt.tv/users/me/history/episodes?page=2&limit=500";

    const first = core.filterHistoryEpisodesAcrossPages(page1, url1, {});
    const second = core.filterHistoryEpisodesAcrossPages(page2, url2, first.cache);

    assert.deepEqual(first.filtered.map((item) => item.id), [1, 2]);
    assert.deepEqual(second.filtered.map((item) => item.id), [4]);
});

test("翻译归一化会合并 fallback zh 区域并比较归一化结果", () => {
    const translations = core.sortTranslations([
        { language: "zh", country: "hk", title: "标题", overview: "简介", tagline: "标语" }
    ], "zh-CN");
    const normalized = core.normalizeTranslations(translations);
    const extracted = core.extractNormalizedTranslation(normalized);

    assert.equal(extracted.status, core.CACHE_STATUS.PARTIAL_FOUND);
    assert.deepEqual(extracted.translation, {
        title: "标题",
        overview: "简介",
        tagline: "标语"
    });
    assert.equal(core.areTranslationsEqual(extracted.translation, { title: "标题", overview: "简介", tagline: "标语" }), true);
});

test("翻译排序会优先把 zh-CN 放在其他语言和 zh 区域之前", () => {
    const items = [
        { language: "en", country: "us", title: "English" },
        { language: "zh", country: "hk", title: "HK" },
        { language: "zh", country: "cn", title: "CN" }
    ];

    const sorted = core.sortTranslations(items, "zh-CN");
    assert.equal(sorted[0].country, "cn");
    assert.equal(sorted[1].country, "hk");
    assert.equal(sorted[2].language, "en");
});

test("翻译归一化在没有任何中文标题时会标记为 NOT_FOUND", () => {
    const normalized = core.normalizeTranslations([
        { language: "en", country: "us", title: "English", overview: "Overview" }
    ]);
    const extracted = core.extractNormalizedTranslation(normalized);

    assert.equal(extracted.status, core.CACHE_STATUS.NOT_FOUND);
    assert.equal(extracted.translation, null);
});
