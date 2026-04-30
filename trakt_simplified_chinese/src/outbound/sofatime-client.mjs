import { escapeQueryComponent } from "../shared/common.mjs";

function createSofaTimeClient(deps) {
    const {
        filmShowRatingsApiBaseUrl,
        filmShowRatingsRapidApiHost,
        fetchJson,
        getRequestHeaderValue
    } = deps;

    function buildLookupUrl(imdbId) {
        const normalizedImdbId = String(imdbId ?? "").trim();
        return /^tt\d+$/i.test(normalizedImdbId)
            ? `${filmShowRatingsApiBaseUrl}/item/?id=${escapeQueryComponent(normalizedImdbId)}`
            : "";
    }

    function buildHeaders() {
        const headers = {
            accept: "application/json",
            "x-rapidapi-host": filmShowRatingsRapidApiHost
        };
        [
            "x-rapidapi-key",
            "x-rapidapi-ua",
            "user-agent",
            "accept-language",
            "accept-encoding"
        ].forEach((headerName) => {
            const value = getRequestHeaderValue(headerName);
            if (value) {
                headers[headerName] = value;
            }
        });
        return headers;
    }

    function fetchByImdbId(imdbId) {
        const url = buildLookupUrl(imdbId);
        return url ? fetchJson(url, buildHeaders(), false) : Promise.resolve(null);
    }

    return {
        fetchByImdbId
    };
}

export {
    createSofaTimeClient
};
