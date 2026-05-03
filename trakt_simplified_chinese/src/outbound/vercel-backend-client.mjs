import * as httpUtils from "../utils/http.mjs";

const DEFAULT_BACKEND_BASE_URL = "https://loon-plugins.demojameson.de5.net";

function resolveBackendBaseUrl() {
    return String(globalThis.$ctx.argument?.backendBaseUrl || DEFAULT_BACKEND_BASE_URL).trim();
}

function fetchTranslations(query) {
    return httpUtils.fetchJson(`${resolveBackendBaseUrl()}/api/trakt/translations?${query}`, null, false);
}

function fetchTranslationOverrides() {
    return httpUtils.fetchJson(`${resolveBackendBaseUrl()}/api/trakt/translation-overrides`, null, false);
}

function postTranslations(payload) {
    return httpUtils.postJson(
        `${resolveBackendBaseUrl()}/api/trakt/translations`,
        payload,
        {
            "content-type": "application/json",
        },
        false,
    );
}

export { DEFAULT_BACKEND_BASE_URL, fetchTranslationOverrides, fetchTranslations, postTranslations, resolveBackendBaseUrl };
