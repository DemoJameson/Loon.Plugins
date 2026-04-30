import {
    getUrlHost,
    normalizeUrlPath
} from "../shared/url-routing.mjs";

function isTraktHost(host) {
    return /(^|\.)trakt\.tv$/i.test(String(host ?? ""));
}

function createRoute(definition) {
    const expectedHost = typeof definition.host === "string" ? definition.host.toLowerCase() : "";

    return {
        id: definition.id,
        pattern: definition.pattern,
        match(context) {
            if (expectedHost && context.host !== expectedHost) {
                return null;
            }

            if (!expectedHost && !definition.allowAnyHost && !isTraktHost(context.host)) {
                return null;
            }

            const matched = context.pathname.match(definition.pattern);
            return matched ? { matches: matched } : null;
        },
        handler: definition.handler,
        describe() {
            return definition.pattern ? String(definition.pattern) : definition.id;
        }
    };
}

function createCustomRoute(definition) {
    return {
        id: definition.id,
        match: definition.match,
        handler: definition.handler,
        describe() {
            return definition.id;
        }
    };
}

function createResponsePhaseRoutes(handlers) {
    const invoke = (handler) => {
        return () => handler();
    };
    const invokeWithMediaType = (mediaType) => {
        return () => handlers.handleMediaDetail(mediaType);
    };

    return [
        createRoute({ pattern: /^\/(movies|shows)\/[^/]+\/lists\/[^/]+(\/[^/]+)?$/i, id: "media.lists.typeSort", handler: invoke(handlers.handleList) }),
        createRoute({ pattern: /^\/users\/[^/]+\/likes\/lists$/i, id: "users.likes.lists", handler: invoke(handlers.handleList) }),
        createRoute({ pattern: /^\/users\/[^/]+\/lists\/collaborations$/i, id: "users.lists.collaborations", handler: invoke(handlers.handleList) }),
        createRoute({ pattern: /^\/users\/[^/]+\/lists$/i, id: "users.lists.index", handler: invoke(handlers.handleList) }),
        createRoute({ pattern: /^\/search\/list$/i, id: "search.list", handler: invoke(handlers.handleList) }),
        createRoute({ pattern: /^\/lists\/(trending|popular)$/i, id: "lists.trendingOrPopular", handler: invoke(handlers.handleList) }),

        createRoute({ pattern: /^\/recommendations\/(shows|movies)$/i, id: "recommendations.showsOrMovies", handler: invoke(handlers.handleDirectMediaList) }),
        createRoute({ pattern: /^\/(shows|movies|media)\/popular(\/next)?$/i, id: "directMedia.popular", handler: invoke(handlers.handleDirectMediaList) }),
        createRoute({ pattern: /^\/movies\/boxoffice$/i, id: "movies.boxoffice", handler: invoke(handlers.handleDirectMediaList) }),

        createRoute({ pattern: /^\/(shows|movies)\/watched\/monthly$/i, id: "media.watched.monthly", handler: invoke(handlers.handleWrapperMediaList) }),
        createRoute({ pattern: /^\/sync\/progress\/up_next_nitro$/i, id: "sync.progress.upNextNitro", handler: invoke(handlers.handleWrapperMediaList) }),
        createRoute({ pattern: /^\/sync\/playback\/movies$/i, id: "sync.playback.movies", handler: invoke(handlers.handleWrapperMediaList) }),
        createRoute({ pattern: /^\/users\/[^/]+\/watchlist\/(shows|movies)\/released(\/desc)?$/i, id: "users.watchlist.released", handler: invoke(handlers.handleWrapperMediaList) }),
        createRoute({ pattern: /^\/calendars\/(my\/(shows|movies)|all\/(movies|dvd|shows(\/(new|premieres|finales))?))\/\d{4}-\d{2}-\d{2}\/\d+$/i, id: "calendars.entries", handler: invoke(handlers.handleWrapperMediaList) }),
        createRoute({ pattern: /^\/users\/[^/]+\/history\/movies$/i, id: "users.history.movies", handler: invoke(handlers.handleWrapperMediaList) }),
        createRoute({ pattern: /^\/sync\/history\/(movies|shows)$/i, id: "sync.history.media", handler: invoke(handlers.handleWrapperMediaList) }),
        createRoute({ pattern: /^\/sync\/history$/i, id: "sync.history.all", handler: invoke(handlers.handleWrapperMediaList) }),
        createRoute({ pattern: /^\/sync\/watched\/(shows|movies)$/i, id: "sync.watched.media", handler: invoke(handlers.handleWrapperMediaList) }),
        createRoute({ pattern: /^\/users\/[^/]+\/watched\/(shows|movies)$/i, id: "users.watched.media", handler: invoke(handlers.handleWrapperMediaList) }),
        createRoute({ pattern: /^\/users\/[^/]+\/history$/i, id: "users.history.all", handler: invoke(handlers.handleWrapperMediaList) }),
        createRoute({ pattern: /^\/users\/[^/]+\/collection\/(shows|movies|episodes)$/i, id: "users.collection.mediaTyped", handler: invoke(handlers.handleWrapperMediaList) }),
        createRoute({ pattern: /^\/users\/[^/]+\/collection\/media$/i, id: "users.collection.media", handler: invoke(handlers.handleWrapperMediaList) }),
        createRoute({ pattern: /^\/people\/[^/]+\/known_for$/i, id: "people.knownFor", handler: invoke(handlers.handleWrapperMediaList) }),
        createRoute({ pattern: /^\/users\/[^/]+\/following\/activities$/i, id: "users.following.activities", handler: invoke(handlers.handleWrapperMediaList) }),
        createRoute({ pattern: /^\/users\/[^/]+\/lists\/\d+\/items$/i, id: "users.listItems.all", handler: invoke(handlers.handleWrapperMediaList) }),
        createRoute({ pattern: /^\/users\/[^/]+\/lists\/\d+\/items\/(movie|show|movie,show)$/i, id: "users.listItems.filtered", handler: invoke(handlers.handleWrapperMediaList) }),
        createRoute({ pattern: /^\/lists\/\d+\/items$/i, id: "lists.items.all", handler: invoke(handlers.handleWrapperMediaList) }),
        createRoute({ pattern: /^\/lists\/\d+\/items\/(movie|show|movie,show)$/i, id: "lists.items.filtered", handler: invoke(handlers.handleWrapperMediaList) }),
        createRoute({ pattern: /^\/users\/[^/]+\/ratings\/all$/i, id: "users.ratings.all", handler: invoke(handlers.handleWrapperMediaList) }),
        createRoute({ pattern: /^\/users\/[^/]+\/favorites\/media(\/[^/]+)?$/i, id: "users.favorites.media", handler: invoke(handlers.handleWrapperMediaList) }),
        createRoute({ pattern: /^\/users\/[^/]+\/favorites\/(shows|movies)(\/[^/]+)?$/i, id: "users.favorites.mediaTyped", handler: invoke(handlers.handleWrapperMediaList) }),
        createRoute({ pattern: /^\/users\/[^/]+\/favorites$/i, id: "users.favorites.all", handler: invoke(handlers.handleWrapperMediaList) }),
        createRoute({ pattern: /^\/(shows|movies|media)\/trending$/i, id: "media.trending", handler: invoke(handlers.handleWrapperMediaList) }),
        createRoute({ pattern: /^\/(shows|movies|media)\/recommendations$/i, id: "media.recommendations", handler: invoke(handlers.handleWrapperMediaList) }),
        createRoute({ pattern: /^\/(shows|movies|media)\/anticipated$/i, id: "media.anticipated", handler: invoke(handlers.handleWrapperMediaList) }),
        createRoute({ pattern: /^\/users\/[^/]+\/watchlist\/movie,show(\/[^/]+)?$/i, id: "users.watchlist.mixed", handler: invoke(handlers.handleWrapperMediaList) }),
        createRoute({ pattern: /^\/users\/[^/]+\/watchlist\/(shows|movies)(\/(?!released$)[^/]+)?$/i, id: "users.watchlist.showsOrMovies", handler: invoke(handlers.handleWrapperMediaList) }),
        createRoute({ pattern: /^\/users\/[^/]+\/watchlist$/i, id: "users.watchlist.all", handler: invoke(handlers.handleWrapperMediaList) }),

        createRoute({ pattern: /^\/(users\/[^/]+\/history\/episodes(\/\d+)?|sync\/history\/episodes)$/i, id: "history.episodes", handler: invoke(handlers.handleHistoryEpisodeList) }),

        createRoute({ pattern: /^\/people\/[^/]+\/(movies|shows)$/i, id: "people.mediaCredits", handler: invoke(handlers.handlePersonMediaCreditsList) }),

        createRoute({ pattern: /^\/users\/[^/]+\/mir$/i, id: "users.mir", handler: invoke(handlers.handleMonthlyReview) }),

        createRoute({ pattern: /^\/comments\/recent\/(all|shows|movies|episodes)\/(all|weekly|monthly|yearly)$/i, id: "comments.recent", handler: invoke(handlers.handleRecentCommentsList) }),

        createRoute({ pattern: /^\/users\/settings$/i, id: "users.settings", handler: invoke(handlers.handleUserSettings) }),

        createRoute({ pattern: /^\/3\/watch\/providers\/(movie|tv)$/i, id: "tmdb.watchProviders", host: "api.themoviedb.org", handler: invoke(handlers.handleTmdbProviderCatalog) }),

        createRoute({ pattern: /^\/shows\/tt\d+$/i, id: "streamingAvailability.showByImdb", host: "streaming-availability.p.rapidapi.com", handler: invoke(handlers.handleSofaTimeStreamingAvailability) }),
        createCustomRoute({
            id: "streamingAvailability.countries",
            match(context) {
                if (context.host !== "streaming-availability.p.rapidapi.com") {
                    return null;
                }

                return /^\/countries\/[a-z]{2}$/i.test(context.pathname) ? { matches: [context.pathname] } : null;
            },
            handler: invoke(handlers.handleSofaTimeCountries)
        }),

        createRoute({ pattern: /^\/watchnow\/sources$/i, id: "watchnow.sources", handler: invoke(handlers.handleWatchnowSources) }),

        createRoute({ pattern: /^\/(movies|shows)\/[^/]+\/people$/i, id: "media.people", handler: invoke(handlers.handleMediaPeopleList) }),
        createRoute({ pattern: /^\/shows\/[^/]+\/seasons\/\d+\/episodes\/\d+\/people$/i, id: "shows.episode.people", handler: invoke(handlers.handleMediaPeopleList) }),

        createRoute({ pattern: /^\/(movies|shows)\/[^/]+\/comments\/[^/]+$/i, id: "media.comments", handler: invoke(handlers.handleComments) }),
        createRoute({ pattern: /^\/shows\/[^/]+\/seasons\/\d+\/episodes\/\d+\/comments\/[^/]+$/i, id: "shows.episode.comments", handler: invoke(handlers.handleComments) }),
        createRoute({ pattern: /^\/comments\/\d+\/replies$/i, id: "comments.replies", handler: invoke(handlers.handleComments) }),

        createRoute({ pattern: /^\/(movies|shows)\/\d+\/translations\/zh$/i, id: "media.translations.zh", handler: invoke(handlers.handleTranslations) }),
        createRoute({ pattern: /^\/shows\/\d+\/seasons\/\d+\/episodes\/\d+\/translations\/zh$/i, id: "shows.episode.translations.zh", handler: invoke(handlers.handleTranslations) }),

        createRoute({ pattern: /^\/(movies|shows)\/\d+\/watchnow$/i, id: "media.watchnow", handler: invoke(handlers.handleWatchnow) }),
        createRoute({ pattern: /^\/episodes\/\d+\/watchnow$/i, id: "episodes.watchnow", handler: invoke(handlers.handleWatchnow) }),

        createRoute({ pattern: /^\/shows\/[^/]+\/seasons$/i, id: "shows.seasons", handler: invoke(handlers.handleSeasonEpisodesList) }),

        createRoute({ pattern: /^\/(v3\/)?media\/(movie|show)\/\d+\/info\/\d+\/version\/\d+$/i, id: "media.proxySentiments", handler: invoke(handlers.handleSentiments) }),
        createRoute({ pattern: /^\/(shows|movies)\/\d+\/sentiments$/i, id: "media.sentiments", handler: invoke(handlers.handleSentiments) }),

        createRoute({ pattern: /^\/shows\/(?!popular$|trending$|recommendations$|anticipated$|watched$)[^/]+$/i, id: "shows.summary", handler: invokeWithMediaType(handlers.mediaTypes.SHOW) }),

        createRoute({ pattern: /^\/movies\/(?!popular$|trending$|recommendations$|anticipated$|watched$|boxoffice$)[^/]+$/i, id: "movies.summary", handler: invokeWithMediaType(handlers.mediaTypes.MOVIE) }),

        createRoute({ pattern: /^\/shows\/[^/]+\/seasons\/\d+\/episodes\/\d+$/i, id: "shows.episode.summary", handler: invokeWithMediaType(handlers.mediaTypes.EPISODE) }),

        createRoute({ pattern: /^\/people\/[^/]+$/i, id: "people.summary", handler: invoke(handlers.handlePeopleDetail) })
    ];
}

function createResponseRouteContext(url) {
    return {
        requestUrl: String(url ?? ""),
        pathname: normalizeUrlPath(url),
        host: getUrlHost(url)
    };
}

export {
    createResponsePhaseRoutes,
    createResponseRouteContext
};
