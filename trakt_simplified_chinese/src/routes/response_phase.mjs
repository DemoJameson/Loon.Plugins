function createResponsePhaseRoutes(handlers) {
    return [
        { pattern: /^\/(movies|shows)\/[^/]+\/lists\/[^/]+(?:\/[^/]+)?$/i, handler: () => handlers.handleListDescriptions() },
        { pattern: /^\/users\/[^/]+\/likes\/lists$/i, handler: () => handlers.handleListDescriptions() },
        { pattern: /^\/users\/[^/]+\/lists$/i, handler: () => handlers.handleListDescriptions() },
        { pattern: /^\/search\/list$/i, handler: () => handlers.handleListDescriptions() },
        { pattern: /^\/recommendations\/(shows|movies)$/i, handler: () => handlers.handleMediaList("typed recommendations") },
        { pattern: /^\/(shows|movies)\/watched\/monthly$/i, handler: () => handlers.handleMediaList("typed watched monthly") },
        { pattern: /^\/sync\/progress\/up_next_nitro$/, handler: () => handlers.handleMediaList("up_next") },
        { pattern: /^\/sync\/playback\/movies$/, handler: () => handlers.handleMediaList("playback") },
        { pattern: /^\/users\/[^/]+\/watchlist\/(shows|movies)\/released(?:\/desc)?$/, handler: () => handlers.handleMediaList("watchlist released") },
        { pattern: /^\/calendars\/(my\/(shows|movies)|all\/(movies|dvd|shows(?:\/(new|premieres|finales))?))\/\d{4}-\d{2}-\d{2}\/\d+$/i, handler: () => handlers.handleMediaList("calendar") },
        { pattern: /^\/users\/[^/]+\/history\/episodes(?:\/\d+)?$/, handler: () => handlers.handleHistoryEpisodeList() },
        { pattern: /^\/users\/[^/]+\/history\/movies$/, handler: () => handlers.handleMediaList("history movie") },
        { pattern: /^\/sync\/history\/episodes$/, handler: () => handlers.handleHistoryEpisodeList() },
        { pattern: /^\/sync\/history(?:\/(movies|shows|episodes))?$/, handler: () => handlers.handleMediaList("sync history") },
        { pattern: /^\/sync\/watched\/(shows|movies)$/i, handler: () => handlers.handleMediaList("sync watched") },
        { pattern: /^\/users\/[^/]+\/watched\/(shows|movies)$/i, handler: () => handlers.handleMediaList("user watched") },
        { pattern: /^\/users\/[^/]+\/history$/, handler: () => handlers.handleMediaList("history") },
        { pattern: /^\/users\/[^/]+\/collection\/(shows|movies|episodes|media)$/i, handler: () => handlers.handleMediaList("collection typed") },
        { pattern: /^\/people\/[^/]+\/known_for$/i, handler: () => handlers.handleMediaList("people known for") },
        { pattern: /^\/people\/[^/]+\/(shows|movies)$/i, handler: () => handlers.handlePersonMediaCreditsList("people media credits") },
        { pattern: /^\/users\/[^/]+\/mir$/, handler: () => handlers.handleMir() },
        { pattern: /^\/users\/[^/]+\/following\/activities$/, handler: () => handlers.handleMediaList("following activities") },
        { pattern: /^\/users\/[^/]+\/lists\/\d+\/items(?:\/[^/]+)?$/, handler: () => handlers.handleMediaList("list items") },
        { pattern: /^\/lists\/\d+\/items(?:\/[^/]+)?$/, handler: () => handlers.handleMediaList("public list items") },
        { pattern: /^\/users\/[^/]+\/ratings\/all$/i, handler: () => handlers.handleMediaList("ratings all") },
        { pattern: /^\/users\/[^/]+\/favorites(?:\/(shows|movies))?$/, handler: () => handlers.handleMediaList("favorites") },
        { pattern: /^\/comments\/recent\/(all|shows|movies|episodes)\/(all|weekly|monthly|yearly)$/i, handler: () => handlers.handleRecentCommentsList() },
        { pattern: /^\/(shows|movies|media)\/trending$/, handler: () => handlers.handleMediaList("media trending") },
        { pattern: /^\/(shows|movies|media)\/recommendations$/, handler: () => handlers.handleMediaList("media recommendations") },
        { pattern: /^\/movies\/boxoffice$/, handler: () => handlers.handleMediaList("movies boxoffice") },
        { pattern: /^\/(shows|movies|media)\/anticipated$/, handler: () => handlers.handleMediaList("media anticipated") },
        { pattern: /^\/(shows|movies|media)\/popular(?:\/next)?$/, handler: () => handlers.handleMediaList("media popular next") },
        { pattern: /^\/users\/[^/]+\/watchlist$/, handler: () => handlers.handleMediaList("watchlist") },
        { pattern: /^\/users\/[^/]+\/watchlist\/(shows|movies)$/, handler: () => handlers.handleMediaList("watchlist typed") }
    ];
}

export {
    createResponsePhaseRoutes
};
