import {
    createDefaultArgumentConfig,
    applyArgumentObjectConfig,
    applyArgumentStringConfig,
    BOXJS_CONFIG_KEY
} from "./argument.mjs";
import {
    buildHistoryEpisodesRequestUrl as buildHistoryEpisodesRequestUrlWithMinimumLimit,
    buildRipppleHistoryRequestUrl as buildRipppleHistoryRequestUrlWithMinimumLimit,
    filterHistoryEpisodesAcrossPages as filterHistoryEpisodesAcrossPagesWithCache,
    isHistoryEpisodesListUrl,
    keepLatestHistoryEpisodes
} from "../domains/history-filtering/history-core.mjs";
import {
    MEDIA_CONFIG
} from "../domains/media-translation/media-config.mjs";
import { MEDIA_TYPE } from "../shared/media-types.mjs";
import {
    createCacheStore,
    UNIFIED_CACHE_KEY,
    UNIFIED_CACHE_MAX_BYTES,
    UNIFIED_CACHE_SCHEMA_VERSION
} from "../platform/cache-store.mjs";
import { URL } from "@nsnanocat/url";
import { URLSearchParams } from "@nsnanocat/url/URLSearchParams.mjs";
import {
    decodeBase64Value,
    ensureObject
} from "../shared/common.mjs";
import { createScriptContext } from "../platform/script-context.mjs";
import { createHttpClient } from "../platform/http-client.mjs";
import { createGoogleTranslateClient } from "../outbound/google-translate-client.mjs";
import { createHistoryPolicyService } from "../domains/history-filtering/policy.mjs";
import { createLinkIdsService } from "../domains/trakt-link-ids/service.mjs";
import {
    GOOGLE_TRANSLATE_BATCH_SIZE
} from "../domains/comments-translation/handlers.mjs";
import { createMediaTranslationRuntime } from "../domains/media-translation/runtime.mjs";
import { createTmdbClient } from "../outbound/tmdb-client.mjs";
import { createCommentsTranslationHandlers } from "../domains/comments-translation/handlers.mjs";
import { createMediaTranslationHandlers } from "../domains/media-translation/handlers.mjs";
import { createPeopleHandlers } from "../domains/people-translation/handlers.mjs";
import { createRequestPhaseRoutes } from "../routing/request-routes.mjs";
import {
    createResponsePhaseRoutes,
    createResponseRouteContext
} from "../routing/response-routes.mjs";
import {
    getUrlHost,
    isUrlFromHost,
    normalizeUrlPath
} from "../shared/url-routing.mjs";
import { createSentimentsHandler } from "../domains/sentiments-translation/handlers.mjs";
import { createListsTranslationHandlers } from "../domains/lists-translation/handlers.mjs";
import { createTraktApiClient } from "../outbound/trakt-api-client.mjs";
import {
    BACKEND_FETCH_MIN_REFS,
    BACKEND_WRITE_BATCH_SIZE,
    createVercelBackendClient,
    DEFAULT_BACKEND_BASE_URL
} from "../outbound/vercel-backend-client.mjs";
import { createSofaTimeClient } from "../outbound/sofatime-client.mjs";
import {
    PLAYER_DEFINITIONS,
    PLAYER_LOGO_ASSET_BASE_URL,
    PLAYER_TYPE,
    REGION_CODES
} from "../domains/player-injection/player-definitions.mjs";
import {
    SHORTCUTS_OPENLINK_URL,
    WATCHNOW_REDIRECT_URL
} from "../domains/player-injection/trakt/config.mjs";
import {
    createSofaTimeCountryService,
    createSofaTimeTemplate,
    TMDB_PROVIDER_LIST_ENTRIES
} from "../domains/player-injection/sofatime/service-definitions.mjs";
import {
    FILM_SHOW_RATINGS_API_BASE_URL,
    FILM_SHOW_RATINGS_RAPIDAPI_HOST
} from "../domains/player-injection/sofatime/config.mjs";
import { createTraktPlayerInjectionService } from "../domains/player-injection/trakt/service.mjs";
import { createSofaTimePlayerInjectionService } from "../domains/player-injection/sofatime/service.mjs";
import { createTraktPlayerInjectionHandlers } from "../domains/player-injection/trakt/handlers.mjs";
import { createSofaTimePlayerInjectionHandlers } from "../domains/player-injection/sofatime/handlers.mjs";

void URL;
void URLSearchParams;

function readBoxJsConfig(scriptContext) {
    const config = createDefaultArgumentConfig();
    const boxJsConfig = ensureObject(scriptContext.env.getjson(BOXJS_CONFIG_KEY, {}));
    return applyArgumentObjectConfig(config, boxJsConfig);
}

function normalizeBackendBaseUrl(argument) {
    let value = argument.backendBaseUrl;
    if (typeof value !== "string") {
        return DEFAULT_BACKEND_BASE_URL;
    }
    value = value.trim();
    if (!/^https?:\/\//i.test(value)) {
        return DEFAULT_BACKEND_BASE_URL;
    }
    return value.replace(/\/+$/, "");
}

function normalizeArgument(argument) {
    return {
        ...argument,
        backendBaseUrl: normalizeBackendBaseUrl(argument),
        enabledPlayerTypes: Object.values(PLAYER_TYPE).filter((source) => argument.playerButtonEnabled[source])
    };
}

function parseArgument(scriptContext) {
    const argument = readBoxJsConfig(scriptContext);
    if (typeof scriptContext.argument === "object" && scriptContext.argument !== null) {
        return normalizeArgument(applyArgumentObjectConfig(argument, scriptContext.argument));
    }
    if (typeof scriptContext.argument === "string") {
        return normalizeArgument(applyArgumentStringConfig(argument, scriptContext.argument));
    }
    return normalizeArgument(argument);
}

function isChineseLanguage(language) {
    const normalized = String(language ?? "").trim().toLowerCase();
    return normalized === "zh" || normalized.startsWith("zh-");
}

function resolveTraktApiBaseUrl(url) {
    try {
        const parsedUrl = new URL(String(url ?? ""));
        return /^https:\/\/apiz?\.trakt\.tv$/i.test(String(parsedUrl.origin ?? ""))
            ? parsedUrl.origin
            : "";
    } catch (e) {
        return "";
    }
}

async function runTraktScript() {
    const scriptContext = createScriptContext();
    const $ = scriptContext.env;
    const argument = parseArgument(scriptContext);
    const body = scriptContext.responseBody;
    const requestUrl = scriptContext.requestUrl;
    const traktApiBaseUrl = resolveTraktApiBaseUrl(requestUrl);

    const httpClient = createHttpClient(scriptContext);
    const {
        buildRequestHeaders,
        fetchJson,
        get,
        getRequestHeaderValue,
        getResponseStatusCode,
        post,
        postJson
    } = httpClient;

    const traktApiClient = createTraktApiClient({
        traktApiBaseUrl,
        buildRequestHeaders,
        getRequestHeaderValue,
        getResponseStatusCode,
        fetchJson,
        get
    });
    const vercelBackendClient = createVercelBackendClient({
        backendBaseUrl: argument.backendBaseUrl,
        backendFetchMinRefs: BACKEND_FETCH_MIN_REFS,
        backendWriteBatchSize: BACKEND_WRITE_BATCH_SIZE,
        mediaConfig: MEDIA_CONFIG,
        fetchJson,
        postJson
    });
    const { translateTextsWithGoogle } = createGoogleTranslateClient({
        post,
        getResponseStatusCode,
        decodeBase64Value,
        batchSize: GOOGLE_TRANSLATE_BATCH_SIZE
    });

    const cacheStore = createCacheStore({
        scriptContext,
        unifiedCacheKey: UNIFIED_CACHE_KEY,
        unifiedCacheSchemaVersion: UNIFIED_CACHE_SCHEMA_VERSION,
        unifiedCacheMaxBytes: UNIFIED_CACHE_MAX_BYTES
    });
    const {
        clearCurrentSeason,
        getCurrentSeason,
        loadCache,
        loadCommentTranslationCache,
        loadHistoryEpisodeCache,
        loadLinkIdsCache,
        loadListTranslationCache,
        loadPeopleTranslationCache,
        loadSentimentTranslationCache,
        saveCache,
        saveCommentTranslationCache,
        saveHistoryEpisodeCache,
        saveLinkIdsCache,
        saveListTranslationCache,
        savePeopleTranslationCache,
        saveSentimentTranslationCache,
        setCurrentSeason
    } = cacheStore;

    const {
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
    } = createMediaTranslationRuntime({
        mediaConfig: MEDIA_CONFIG,
        scriptContext,
        saveCache,
        traktApiClient,
        vercelBackendClient
    });

    const {
        cacheEpisodeIdsFromSeasonList,
        cacheMediaIdsFromDetailResponse,
        ensureEpisodeShowIds,
        ensureMediaIdsCacheEntry,
        getLinkIdsCacheEntry
    } = createLinkIdsService({
        traktApiClient,
        loadLinkIdsCache,
        saveLinkIdsCache
    });

    const {
        fetchTmdbCredits,
        fetchTmdbPerson
    } = createTmdbClient({
        fetchJson
    });

    const traktPlayerInjection = createTraktPlayerInjectionService({
        enabledPlayerTypes: argument.enabledPlayerTypes,
        playerDefinitions: PLAYER_DEFINITIONS,
        regionCodes: REGION_CODES,
        watchnowRedirectUrl: WATCHNOW_REDIRECT_URL,
        shortcutsOpenlinkUrl: SHORTCUTS_OPENLINK_URL,
        playerLogoAssetBaseUrl: PLAYER_LOGO_ASSET_BASE_URL,
        getLinkIdsCacheEntry,
        ensureMediaIdsCacheEntry,
        ensureEpisodeShowIds
    });
    const sofaTimePlayerInjection = createSofaTimePlayerInjectionService({
        scriptContext,
        enabledPlayerTypes: argument.enabledPlayerTypes,
        playerDefinitions: PLAYER_DEFINITIONS,
        regionCodes: REGION_CODES,
        tmdbProviderListEntries: TMDB_PROVIDER_LIST_ENTRIES,
        sofaTimeClient: createSofaTimeClient({
            filmShowRatingsApiBaseUrl: FILM_SHOW_RATINGS_API_BASE_URL,
            filmShowRatingsRapidApiHost: FILM_SHOW_RATINGS_RAPIDAPI_HOST,
            fetchJson,
            getRequestHeaderValue
        }),
        getRequestHeaderValue,
        normalizeUrlPath,
        isUrlFromHost,
        createSofaTimeTemplate,
        createSofaTimeCountryService
    });
    const historyPolicy = createHistoryPolicyService({
        scriptContext,
        latestHistoryEpisodeOnly: argument.latestHistoryEpisodeOnly,
        getRequestHeaderValue,
        normalizeUrlPath,
        loadHistoryEpisodeCache,
        saveHistoryEpisodeCache,
        isHistoryEpisodesListUrl,
        keepLatestHistoryEpisodes,
        filterHistoryEpisodesAcrossPagesWithCache,
        buildHistoryEpisodesRequestUrlWithMinimumLimit,
        buildRipppleHistoryRequestUrlWithMinimumLimit
    });
    const handleSentiments = createSentimentsHandler({
        scriptContext,
        requestUrl,
        body,
        googleTranslationEnabled: argument.googleTranslationEnabled,
        loadSentimentTranslationCache,
        saveSentimentTranslationCache,
        translateTextsWithGoogle,
        normalizeUrlPath
    });
    const {
        handleDirectRedirectRequest,
        handleSofaTimeCountries,
        handleSofaTimeStreamingAvailability,
        handleTmdbProviderCatalog,
        handleUserSettings,
        handleWatchnow,
        handleWatchnowSources
    } = {
        ...createTraktPlayerInjectionHandlers({
            scriptContext,
            requestUrl,
            body,
            loadLinkIdsCache,
            traktPlayerInjection,
            useShortcutsJumpEnabled: argument.useShortcutsJumpEnabled
        }),
        ...createSofaTimePlayerInjectionHandlers({
            scriptContext,
            requestUrl,
            body,
            sofaTimePlayerInjection,
            getResponseStatusCode
        })
    };
    const {
        handleCurrentSeasonRequest,
        handleDirectMediaList,
        handleMediaDetail,
        handleMonthlyReview,
        handleSeasonEpisodesList,
        handleTranslations,
        handleWrapperMediaList,
        translateMediaItemsInPlace
    } = createMediaTranslationHandlers({
        scriptContext,
        body,
        requestUrl,
        mediaConfig: MEDIA_CONFIG,
        normalizeUrlPath,
        loadCache,
        saveCache,
        loadLinkIdsCache,
        saveLinkIdsCache,
        getCurrentSeason,
        clearCurrentSeason,
        setCurrentSeason,
        buildEpisodeCompositeKey,
        buildMediaCacheLookupKey,
        getCachedTranslation,
        getMissingRefs,
        applyTranslation,
        cacheMediaIdsFromDetailResponse,
        cacheEpisodeIdsFromSeasonList,
        fetchTranslationsFromBackend,
        fetchDirectTranslation,
        storeTranslationEntry,
        queueBackendWrite,
        flushBackendWrites,
        isScriptInitiatedTranslationRequest
    });
    const {
        handleComments,
        handleRecentCommentsList
    } = createCommentsTranslationHandlers({
        scriptContext,
        body,
        googleTranslationEnabled: argument.googleTranslationEnabled,
        loadCommentTranslationCache,
        saveCommentTranslationCache,
        translateTextsWithGoogle,
        translateMediaItemsInPlace,
        isChineseLanguage
    });
    const { handleList } = createListsTranslationHandlers({
        scriptContext,
        body,
        googleTranslationEnabled: argument.googleTranslationEnabled,
        loadListTranslationCache,
        saveListTranslationCache,
        translateTextsWithGoogle
    });
    const {
        handleMediaPeopleList,
        handlePeopleDetail,
        handlePersonMediaCreditsList
    } = createPeopleHandlers({
        scriptContext,
        requestUrl,
        body,
        googleTranslationEnabled: argument.googleTranslationEnabled,
        loadPeopleTranslationCache,
        savePeopleTranslationCache,
        loadLinkIdsCache,
        translateTextsWithGoogle,
        translateMediaItemsInPlace,
        normalizeUrlPath,
        ensureMediaIdsCacheEntry,
        fetchTmdbCredits,
        fetchTmdbPerson
    });

    async function handleHistoryEpisodeList() {
        const historyBody = historyPolicy.processHistoryEpisodeListBody(body, requestUrl);
        await handleWrapperMediaList("history episode", historyBody);
    }

    function isRequest() {
        return typeof $.response === "undefined";
    }

    function isResponse() {
        return !isRequest();
    }

    function handleRequestRoute(url) {
        if (isResponse()) {
            return false;
        }

        let requestPath = "";
        try {
            requestPath = new URL(url).pathname;
        } catch (e) {
            requestPath = "";
        }

        const routes = createRequestPhaseRoutes({
            handleCurrentSeasonRequest,
            handleDirectRedirectRequest,
            requestHost: getUrlHost(url),
            requestPath,
            shouldApplyLatestHistoryEpisodeOnly: () => historyPolicy.shouldApplyLatestHistoryEpisodeOnly(url),
            shouldApplyRipppleHistoryLimit: () => historyPolicy.shouldApplyRipppleHistoryLimit(url),
            buildHistoryEpisodesRequestUrl: () => historyPolicy.buildHistoryEpisodesRequestUrl(url),
            buildRipppleHistoryRequestUrl: () => historyPolicy.buildRipppleHistoryRequestUrl(url),
            scriptContext
        });

        for (const route of routes) {
            if (route.condition()) {
                route.handler();
                return true;
            }
        }

        return false;
    }

    async function handleResponseRoute(url) {
        if (isRequest()) {
            return false;
        }

        const routes = createResponsePhaseRoutes({
            handleDirectMediaList,
            handleHistoryEpisodeList,
            handleList,
            handleComments,
            handleMediaDetail,
            handleMediaPeopleList,
            handleMonthlyReview,
            handlePeopleDetail,
            handlePersonMediaCreditsList,
            handleRecentCommentsList,
            handleSeasonEpisodesList,
            handleSentiments,
            handleSofaTimeCountries,
            handleSofaTimeStreamingAvailability,
            handleTmdbProviderCatalog,
            handleTranslations,
            handleUserSettings,
            handleWatchnow,
            handleWatchnowSources,
            handleWrapperMediaList,
            mediaTypes: MEDIA_TYPE
        });

        const routeContext = createResponseRouteContext(url);
        for (const route of routes) {
            const matched = route.match(routeContext);
            if (matched) {
                await route.handler(matched, routeContext);
                return true;
            }
        }

        return false;
    }

    try {
        if (handleRequestRoute(requestUrl)) {
            return;
        }
        if (await handleResponseRoute(requestUrl)) {
            return;
        }
        $.done({});
    } catch (e) {
        $.log(`Trakt script error: ${e}`);
        $.done({});
    }
}

export {
    runTraktScript
};
