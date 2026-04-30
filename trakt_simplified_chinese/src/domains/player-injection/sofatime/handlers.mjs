import {
    ensureObject,
    isNonNullish
} from "../../../shared/common.mjs";

function createSofaTimePlayerInjectionHandlers(deps) {
    const {
        scriptContext,
        requestUrl,
        body,
        sofaTimePlayerInjection,
        getResponseStatusCode
    } = deps;

    function doneJsonResponse(payload) {
        scriptContext.done({
            status: 200,
            body: JSON.stringify(payload)
        });
    }

    async function handleSofaTimeStreamingAvailability() {
        if (typeof scriptContext.response === "undefined" || !sofaTimePlayerInjection.isSofaTimeRequest()) {
            scriptContext.done({});
            return;
        }

        const statusCode = getResponseStatusCode(scriptContext.response);
        const payload = ensureObject(scriptContext.env.toObj(body));
        const result = await sofaTimePlayerInjection.injectSofaTimeStreamingAvailabilityPayload(payload, requestUrl, statusCode);
        if (!result.handled) {
            scriptContext.done({});
            return;
        }

        const nextPayload = result.payload;
        if (statusCode === 404 && isNonNullish(nextPayload.tmdbId)) {
            doneJsonResponse(nextPayload);
            return;
        }

        scriptContext.done({ body: JSON.stringify(nextPayload) });
    }

    function handleSofaTimeCountries() {
        if (typeof scriptContext.response === "undefined" || !sofaTimePlayerInjection.isSofaTimeRequest()) {
            scriptContext.done({});
            return;
        }

        if (!sofaTimePlayerInjection.isStreamingAvailabilityCountriesRequest(requestUrl)) {
            scriptContext.done({});
            return;
        }

        const payload = JSON.parse(body);
        scriptContext.done({ body: JSON.stringify(sofaTimePlayerInjection.injectSofaTimeCountryServices(payload)) });
    }

    function handleTmdbProviderCatalog() {
        if (typeof scriptContext.response === "undefined" || !sofaTimePlayerInjection.isSofaTimeRequest()) {
            scriptContext.done({});
            return;
        }

        const payload = JSON.parse(body);
        scriptContext.done({ body: JSON.stringify(sofaTimePlayerInjection.injectTmdbProviderCatalog(payload)) });
    }

    return {
        handleSofaTimeCountries,
        handleSofaTimeStreamingAvailability,
        handleTmdbProviderCatalog
    };
}

export {
    createSofaTimePlayerInjectionHandlers
};
