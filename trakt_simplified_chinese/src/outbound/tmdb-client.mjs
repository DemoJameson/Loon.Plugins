import * as mediaTypes from "../shared/media-types.mjs";
import * as commonUtils from "../utils/common.mjs";
import * as httpUtils from "../utils/http.mjs";

const TMDB_API_BASE_URL = "https://api.tmdb.org/3";
const TMDB_API_KEY = "a0a4d50000eeb10604c5f9342c8b3f62";

function fetchCredits(mediaType, tmdbId) {
    if (commonUtils.isNullish(tmdbId)) {
        return Promise.resolve(null);
    }

    const normalizedMediaType = mediaType === mediaTypes.MEDIA_TYPE.MOVIE ? "movie" : "tv";
    const appendField = mediaType === mediaTypes.MEDIA_TYPE.MOVIE ? "credits" : "aggregate_credits";
    return httpUtils.fetchJson(`${TMDB_API_BASE_URL}/${normalizedMediaType}/${tmdbId}?language=zh-CN&append_to_response=${appendField}&api_key=${TMDB_API_KEY}`, null, false);
}

function fetchPerson(tmdbPersonId) {
    if (commonUtils.isNullish(tmdbPersonId)) {
        return Promise.resolve(null);
    }

    return httpUtils.fetchJson(`${TMDB_API_BASE_URL}/person/${tmdbPersonId}?language=zh-CN&api_key=${TMDB_API_KEY}`, null, false);
}

export { fetchCredits, fetchPerson };
