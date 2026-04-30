import { CACHE_STATUS, extractNormalizedTranslation, normalizeTranslations } from "../domains/media-translation/translations.mjs";
import { MEDIA_TYPE } from "../shared/media-types.mjs";
import { isNonNullish, isNullish } from "../shared/common.mjs";

const SCRIPT_TRANSLATION_REQUEST_HEADER = "x-loon-trakt-translation-request";
const SCRIPT_TRANSLATION_REQUEST_VALUE = "script";

function createTraktApiClient(deps) {
    const {
        traktApiBaseUrl,
        buildRequestHeaders,
        getRequestHeaderValue,
        getResponseStatusCode,
        fetchJson,
        get
    } = deps;

    function isScriptInitiatedTranslationRequest() {
        return String(getRequestHeaderValue(SCRIPT_TRANSLATION_REQUEST_HEADER) ?? "").toLowerCase() ===
            SCRIPT_TRANSLATION_REQUEST_VALUE;
    }

    function buildTranslationUrl(mediaType, ref, mediaConfig) {
        const path = mediaConfig?.[mediaType]?.buildTranslationPath(ref);
        return path ? `${traktApiBaseUrl}${path}` : "";
    }

    async function fetchDirectTranslation(mediaType, ref, mediaConfig) {
        const traktId = isNonNullish(ref?.traktId) ? ref.traktId : null;
        const url = buildTranslationUrl(mediaType, ref, mediaConfig);
        if (!url) {
            throw new Error(`Missing translation lookup metadata for mediaType=${mediaType}, traktId=${traktId}`);
        }

        const payload = await get({
            url,
            headers: buildRequestHeaders({
                [SCRIPT_TRANSLATION_REQUEST_HEADER]: SCRIPT_TRANSLATION_REQUEST_VALUE
            })
        });
        const statusCode = getResponseStatusCode(payload);
        if (statusCode < 200 || statusCode >= 300) {
            throw new Error(`HTTP ${statusCode} for ${url}`);
        }

        const responseBody = isNullish(payload?.body) ? "" : String(payload.body);
        if (!responseBody.trim()) {
            return {
                status: CACHE_STATUS.NOT_FOUND,
                translation: null
            };
        }

        let responseJson;
        try {
            responseJson = JSON.parse(responseBody);
        } catch (e) {
            throw new Error(`JSON parse failed for ${url}: ${e}`);
        }

        return extractNormalizedTranslation(normalizeTranslations(responseJson));
    }

    function buildDetailLookupUrl(mediaType, traktId) {
        if (isNullish(traktId)) {
            return "";
        }

        if (mediaType === MEDIA_TYPE.MOVIE) {
            return `${traktApiBaseUrl}/movies/${traktId}?extended=cloud9,full,watchnow`;
        }
        if (mediaType === MEDIA_TYPE.SHOW) {
            return `${traktApiBaseUrl}/shows/${traktId}?extended=cloud9,full,watchnow`;
        }
        return "";
    }

    function fetchMediaDetail(mediaType, traktId) {
        const lookupUrl = buildDetailLookupUrl(mediaType, traktId);
        return lookupUrl ? fetchJson(lookupUrl) : Promise.resolve(null);
    }

    return {
        fetchDirectTranslation,
        fetchMediaDetail,
        isScriptInitiatedTranslationRequest
    };
}

export {
    createTraktApiClient
};
