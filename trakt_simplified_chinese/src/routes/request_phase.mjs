function createRequestPhaseRoutes(deps) {
    const {
        handleCurrentSeasonRequest,
        handleDirectRedirectRequest,
        requestHost,
        requestPath,
        shouldApplyLatestHistoryEpisodeOnly,
        shouldApplyRipppleHistoryLimit,
        buildHistoryEpisodesRequestUrl,
        buildRipppleHistoryRequestUrl,
        scriptContext
    } = deps;

    return [
        {
            condition: () => requestHost === "loon-plugins.demojameson.de5.net" && requestPath === "/api/redirect",
            handler: () => handleDirectRedirectRequest()
        },
        {
            condition: () => requestHost === "image.tmdb.org" && /^\/t\/p\/w342\/[a-z0-9_-]+_logo\.webp$/i.test(requestPath),
            handler: () => handleDirectRedirectRequest()
        },
        {
            condition: () => /^\/shows\/[^/]+\/seasons\/\d+$/.test(requestPath),
            handler: () => handleCurrentSeasonRequest()
        },
        {
            condition: () => shouldApplyLatestHistoryEpisodeOnly(),
            handler: () => scriptContext.done({
                url: buildHistoryEpisodesRequestUrl()
            })
        },
        {
            condition: () => shouldApplyRipppleHistoryLimit(),
            handler: () => scriptContext.done({
                url: buildRipppleHistoryRequestUrl()
            })
        }
    ];
}

export {
    createRequestPhaseRoutes
};
