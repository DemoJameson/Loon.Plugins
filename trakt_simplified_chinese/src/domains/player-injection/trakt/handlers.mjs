function createTraktPlayerInjectionHandlers(deps) {
    const {
        scriptContext,
        requestUrl,
        body,
        loadLinkIdsCache,
        traktPlayerInjection,
        useShortcutsJumpEnabled
    } = deps;

    function doneRedirect(location) {
        const targetLocation = String(location ?? "").trim();
        if (!targetLocation) {
            scriptContext.done({});
            return;
        }

        scriptContext.done({
            response: {
                status: 302,
                headers: {
                    Location: targetLocation
                }
            }
        });
    }

    function handleDirectRedirectRequest() {
        const location = traktPlayerInjection.resolveDirectRedirectLocation(requestUrl);
        if (
            location &&
            useShortcutsJumpEnabled &&
            /^https:\/\/loon-plugins\.demojameson\.de5\.net\/api\/redirect\?/i.test(String(requestUrl ?? ""))
        ) {
            doneRedirect(traktPlayerInjection.buildShortcutsJumpLink(location));
            return;
        }

        doneRedirect(location);
    }

    function handleWatchnowSources() {
        const payload = JSON.parse(body);
        scriptContext.done({ body: JSON.stringify(traktPlayerInjection.injectWatchnowSourcesPayload(payload)) });
    }

    async function handleWatchnow() {
        const payload = JSON.parse(body);
        const target = traktPlayerInjection.resolveWatchnowTarget(requestUrl);

        if (!target) {
            scriptContext.done({});
            return;
        }

        const linkCache = loadLinkIdsCache();
        const context = await traktPlayerInjection.resolveWatchnowContext(target, linkCache);
        scriptContext.done({
            body: JSON.stringify(traktPlayerInjection.injectWatchnowPayload(payload, target, context))
        });
    }

    function handleUserSettings() {
        const data = JSON.parse(body);
        const nextData = traktPlayerInjection.injectUserSettingsPayload(data);
        scriptContext.done(nextData && typeof nextData === "object"
            ? { body: JSON.stringify(nextData) }
            : {});
    }

    return {
        handleDirectRedirectRequest,
        handleUserSettings,
        handleWatchnow,
        handleWatchnowSources
    };
}

export {
    createTraktPlayerInjectionHandlers
};
