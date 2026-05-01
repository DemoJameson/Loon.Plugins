import * as httpUtils from "../utils/http.mjs";

const FILM_SHOW_RATINGS_API_BASE_URL = "https://film-show-ratings.p.rapidapi.com";

function fetchByImdbId(imdbId, headers) {
    const normalizedImdbId = String(imdbId ?? "").trim();
    const url = /^tt\d+$/i.test(normalizedImdbId) ? `${FILM_SHOW_RATINGS_API_BASE_URL}/item/?id=${encodeURIComponent(normalizedImdbId)}` : "";
    return url ? httpUtils.fetchJson(url, headers, false) : Promise.resolve(null);
}

export { fetchByImdbId };
