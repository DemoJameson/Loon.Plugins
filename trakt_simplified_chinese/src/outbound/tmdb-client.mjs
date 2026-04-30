import { MEDIA_TYPE } from "../shared/media-types.mjs";
import { isNullish } from "../shared/common.mjs";

const TMDB_API_BASE_URL = "https://api.tmdb.org/3";
const TMDB_API_KEY = "a0a4d50000eeb10604c5f9342c8b3f62";

function createTmdbClient(deps) {
    const {
        fetchJson
    } = deps;

    function buildTmdbCreditsLookupUrl(mediaType, tmdbId) {
        if (isNullish(tmdbId)) {
            return "";
        }

        const normalizedMediaType = mediaType === MEDIA_TYPE.MOVIE ? "movie" : "tv";
        const appendField = mediaType === MEDIA_TYPE.MOVIE ? "credits" : "aggregate_credits";
        return `${TMDB_API_BASE_URL}/${normalizedMediaType}/${tmdbId}?language=zh-CN&append_to_response=${appendField}&api_key=${TMDB_API_KEY}`;
    }

    function buildTmdbPersonLookupUrl(tmdbPersonId) {
        if (isNullish(tmdbPersonId)) {
            return "";
        }

        return `${TMDB_API_BASE_URL}/person/${tmdbPersonId}?language=zh-CN&api_key=${TMDB_API_KEY}`;
    }

    function fetchTmdbCredits(mediaType, tmdbId) {
        const url = buildTmdbCreditsLookupUrl(mediaType, tmdbId);
        return url ? fetchJson(url, null, false) : Promise.resolve(null);
    }

    function fetchTmdbPerson(tmdbPersonId) {
        const url = buildTmdbPersonLookupUrl(tmdbPersonId);
        return url ? fetchJson(url, null, false) : Promise.resolve(null);
    }

    return {
        fetchTmdbCredits,
        fetchTmdbPerson
    };
}

export {
    createTmdbClient
};
