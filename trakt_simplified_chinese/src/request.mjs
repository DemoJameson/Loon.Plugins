import * as historyEpisodesMergedByShowHandler from "./features/history-episodes-merged-by-show.mjs";
import * as mediaTranslationHandler from "./features/media-translation.mjs";
import * as playerInjectionTraktHandler from "./features/player-injection-trakt.mjs";
import * as routeUtils from "./shared/route.mjs";

const { createRoute, dispatchRoutes } = routeUtils;

function createRequestPhaseRoutes() {
    return [
        createRoute({
            id: "redirect.direct",
            host: /^proxy-modules\.demojameson\.de5\.net$/i,
            pattern: /^api\/redirect$/,
            handler: playerInjectionTraktHandler.handleDirectRedirectRequest,
        }),
        createRoute({
            id: "redirect.tmdbLogo",
            host: /^image\.tmdb\.org$/i,
            pattern: /^t\/p\/w342\/[a-z0-9_-]+_logo\.webp$/i,
            handler: playerInjectionTraktHandler.handleDirectRedirectRequest,
        }),
        createRoute({
            id: "media.currentSeason",
            pattern: /^shows\/[^/]+\/seasons\/\d+$/,
            handler: mediaTranslationHandler.handleCurrentSeasonRequest,
        }),
        createRoute({
            id: "history.episodes.mergeByShow.rewrite",
            pattern: /^(?:users\/[^/]+\/history\/episodes|sync\/history\/episodes)$/,
            handler: historyEpisodesMergedByShowHandler.handleMergedHistoryEpisodesRewriteRequest,
        }),
        createRoute({ id: "history.rippple.rewrite", pattern: /^users\/[^/]+\/history$/, handler: historyEpisodesMergedByShowHandler.handleMergedHistoryEpisodesRewriteRequest }),
    ];
}

function handleRequest() {
    return dispatchRoutes(createRequestPhaseRoutes);
}

export { createRequestPhaseRoutes, handleRequest };
