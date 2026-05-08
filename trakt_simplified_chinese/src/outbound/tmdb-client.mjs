import * as mediaTypes from "../shared/media-types.mjs";
import * as commonUtils from "../utils/common.mjs";
import * as httpUtils from "../utils/http.mjs";

const TMDB_API_BASE_URL = "https://api.tmdb.org/3";
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p";
const TMDB_API_KEY = "a0a4d50000eeb10604c5f9342c8b3f62";
const TMDB_CHINESE_IMAGE_LANGUAGE_QUERY = "language=zh";

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

function fetchImages(mediaType, tmdbId) {
    if (commonUtils.isNullish(tmdbId)) {
        return Promise.resolve(null);
    }

    const normalizedMediaType = mediaType === mediaTypes.MEDIA_TYPE.MOVIE ? "movie" : mediaType === mediaTypes.MEDIA_TYPE.SHOW ? "tv" : "";
    if (!normalizedMediaType) {
        return Promise.resolve(null);
    }

    return httpUtils.fetchJson(`${TMDB_API_BASE_URL}/${normalizedMediaType}/${tmdbId}/images?${TMDB_CHINESE_IMAGE_LANGUAGE_QUERY}&api_key=${TMDB_API_KEY}`, null, false);
}

function fetchSeasonImages(showTmdbId, seasonNumber) {
    if (commonUtils.isNullish(showTmdbId) || commonUtils.isNullish(seasonNumber)) {
        return Promise.resolve(null);
    }

    return httpUtils.fetchJson(`${TMDB_API_BASE_URL}/tv/${showTmdbId}/season/${seasonNumber}/images?${TMDB_CHINESE_IMAGE_LANGUAGE_QUERY}&api_key=${TMDB_API_KEY}`, null, false);
}

function buildImageUrl(filePath, size = "w780") {
    const normalizedPath = String(filePath ?? "").trim();
    if (!normalizedPath) {
        return "";
    }

    return `${TMDB_IMAGE_BASE_URL}/${size}${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}`;
}

function resizeImageUrl(url, size = "original") {
    const normalizedUrl = String(url ?? "").trim();
    if (!normalizedUrl) {
        return "";
    }

    return normalizedUrl.includes("/t/p/original/") ? normalizedUrl.replace("/t/p/original/", `/t/p/${size}/`) : "";
}

function buildPosterImageUrl(filePath, size = "w780") {
    return buildImageUrl(filePath, size);
}

export { buildImageUrl, buildPosterImageUrl, fetchCredits, fetchImages, fetchPerson, fetchSeasonImages, resizeImageUrl };
