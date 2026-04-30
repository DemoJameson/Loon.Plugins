import { PLAYER_DEFINITIONS, PLAYER_TYPE, buildPlayerDeeplink } from "../player-definitions.mjs";
import { MEDIA_TYPE } from "../../../shared/media-types.mjs";
import {
    cloneObject,
    ensureArray,
    isNonNullish,
    isNullish,
    isPlainObject
} from "../../../shared/common.mjs";
import {
    createSofaTimeCountryService,
    createSofaTimeTemplate,
    TMDB_PROVIDER_LIST_ENTRIES
} from "./service-definitions.mjs";

function createSofaTimePlayerInjectionService(deps) {
    const {
        scriptContext,
        enabledPlayerTypes,
        playerDefinitions = PLAYER_DEFINITIONS,
        regionCodes,
        tmdbProviderListEntries = TMDB_PROVIDER_LIST_ENTRIES,
        sofaTimeClient,
        getRequestHeaderValue,
        normalizeUrlPath,
        isUrlFromHost,
        createSofaTimeTemplate: createTemplate = createSofaTimeTemplate,
        createSofaTimeCountryService: createCountryService = createSofaTimeCountryService
    } = deps;

    function isSofaTimeRequest() {
        return /^Sofa(?:\s|%20)Time/i.test(String(getRequestHeaderValue("user-agent") ?? "").trim());
    }

    function resolveStreamingAvailabilityImdbId(url) {
        if (!isUrlFromHost(url, "streaming-availability.p.rapidapi.com")) {
            return "";
        }

        const match = normalizeUrlPath(url).match(/^\/shows\/(tt\d+)$/i);
        return match?.[1] ?? "";
    }

    function isStreamingAvailabilityCountriesRequest(url) {
        return isUrlFromHost(url, "streaming-availability.p.rapidapi.com") &&
            /^\/countries\/[a-z]{2}$/i.test(normalizeUrlPath(url));
    }

    function resolveStreamingAvailabilityTmdbTarget(payload, fallbackTarget) {
        const tmdbValue = payload?.tmdbId ? String(payload.tmdbId).trim() : "";
        const match = tmdbValue.match(/^(movie|tv)\/(\d+)$/i);
        if (!match) {
            return fallbackTarget;
        }

        const tmdbType = match[1].toLowerCase();
        const tmdbId = Number(match[2]);
        return {
            mediaType: tmdbType === "movie" ? MEDIA_TYPE.MOVIE : MEDIA_TYPE.SHOW,
            imdbId: fallbackTarget?.imdbId ?? "",
            tmdbId,
            showTmdbId: tmdbType === "tv" ? tmdbId : null
        };
    }

    function resolveFilmShowRatingsMediaType(type) {
        const normalizedType = String(type ?? "").trim().toLowerCase();
        if (normalizedType === "show") {
            return MEDIA_TYPE.SHOW;
        }
        if (normalizedType === "film") {
            return MEDIA_TYPE.MOVIE;
        }
        return "";
    }

    async function resolveTmdbTargetByImdb(target) {
        const imdbId = String(target?.imdbId ?? "").trim();
        if (!imdbId) {
            return target;
        }

        try {
            const payload = await sofaTimeClient.fetchByImdbId(imdbId);
            const resolvedMediaType = resolveFilmShowRatingsMediaType(payload?.result?.type);
            const tmdbId = Number(payload?.result?.ids?.TMDB);
            if (!resolvedMediaType || !Number.isFinite(tmdbId) || tmdbId <= 0) {
                return target;
            }

            if (target?.mediaType === MEDIA_TYPE.EPISODE && resolvedMediaType === MEDIA_TYPE.SHOW) {
                return {
                    ...target,
                    mediaType: MEDIA_TYPE.EPISODE,
                    showTmdbId: tmdbId
                };
            }

            if (resolvedMediaType === MEDIA_TYPE.SHOW) {
                return {
                    ...target,
                    mediaType: MEDIA_TYPE.SHOW,
                    tmdbId,
                    showTmdbId: tmdbId
                };
            }

            if (resolvedMediaType === MEDIA_TYPE.MOVIE) {
                return {
                    ...target,
                    mediaType: MEDIA_TYPE.MOVIE,
                    tmdbId
                };
            }
        } catch (e) {
            scriptContext.log(`Film Show Ratings lookup failed for ${imdbId}: ${e}`);
        }

        return target;
    }

    function createSofaTimeStreamingOption(source, target) {
        const definition = playerDefinitions[source];
        if (!definition || !target || isNullish(target.tmdbId)) {
            return null;
        }

        const context = {
            tmdbId: target.tmdbId,
            showTmdbId: isNonNullish(target.showTmdbId) ? target.showTmdbId : null
        };
        const deeplink = buildPlayerDeeplink(source, target, context);
        if (!deeplink) {
            return null;
        }

        const option = createTemplate(definition);
        option.link = deeplink;
        option.videoLink = deeplink;
        return option;
    }

    function createSofaTimeStreamingOptionsByRegion(regionCode, target) {
        void regionCode;
        return enabledPlayerTypes.map((source) => createSofaTimeStreamingOption(source, target)).filter(Boolean);
    }

    function rewriteStreamingOptionsMap(target, streamingTarget) {
        if (!isPlainObject(target)) {
            return;
        }

        const streamingOptions = isPlainObject(target.streamingOptions) ? target.streamingOptions : {};
        const finalRegionCodes = Object.keys(streamingOptions).length > 0 ? Object.keys(streamingOptions) : regionCodes;
        finalRegionCodes.forEach((regionCode) => {
            const options = createSofaTimeStreamingOptionsByRegion(regionCode, streamingTarget);
            if (options.length > 0) {
                streamingOptions[String(regionCode ?? "").toLowerCase()] = options;
            }
        });
        target.streamingOptions = streamingOptions;
    }

    async function injectSofaTimeStreamingAvailabilityPayload(payload, requestUrl, statusCode) {
        const imdbId = resolveStreamingAvailabilityImdbId(requestUrl);
        if (!imdbId) {
            return {
                handled: false,
                payload
            };
        }

        const target = { imdbId };
        let streamingTarget;

        if (statusCode === 404) {
            streamingTarget = await resolveTmdbTargetByImdb(target);
        } else {
            streamingTarget = resolveStreamingAvailabilityTmdbTarget(payload, target);
        }

        if (isNonNullish(streamingTarget?.tmdbId) && streamingTarget?.mediaType === MEDIA_TYPE.SHOW) {
            payload.tmdbId = `tv/${streamingTarget.tmdbId}`;
        }
        if (isNonNullish(streamingTarget?.tmdbId) && streamingTarget?.mediaType === MEDIA_TYPE.MOVIE) {
            payload.tmdbId = `movie/${streamingTarget.tmdbId}`;
        }

        rewriteStreamingOptionsMap(payload, streamingTarget);
        ensureArray(payload.seasons).forEach((season) => {
            if (!isPlainObject(season)) {
                return;
            }

            rewriteStreamingOptionsMap(season, streamingTarget);
            ensureArray(season.episodes).forEach((episode) => {
                if (isPlainObject(episode)) {
                    rewriteStreamingOptionsMap(episode, streamingTarget);
                }
            });
        });

        return {
            handled: true,
            payload
        };
    }

    function injectSofaTimeCountryServices(payload) {
        if (!isPlainObject(payload)) {
            return payload;
        }

        const services = ensureArray(payload.services).slice();
        const filteredServices = services.filter((service) => {
            const id = service?.id ? String(service.id).toLowerCase() : "";
            return !Object.values(PLAYER_TYPE).includes(id);
        });

        Object.values(PLAYER_TYPE).slice().reverse().forEach((source) => {
            filteredServices.unshift(createCountryService(playerDefinitions[source]));
        });
        payload.services = filteredServices;
        return payload;
    }

    function injectTmdbProviderCatalog(payload) {
        if (!isPlainObject(payload)) {
            return payload;
        }

        const results = ensureArray(payload.results).slice();
        const filteredResults = results.filter((item) => {
            const providerId = item?.provider_id ? Number(item.provider_id) : NaN;
            const providerName = item?.provider_name ? String(item.provider_name).toLowerCase() : "";
            return !tmdbProviderListEntries.some((entry) => {
                return providerId === entry.provider_id || providerName === String(entry.provider_name).toLowerCase();
            });
        });

        tmdbProviderListEntries.slice().reverse().forEach((entry) => {
            filteredResults.unshift(cloneObject(entry));
        });
        payload.results = filteredResults;
        return payload;
    }

    return {
        injectSofaTimeCountryServices,
        injectSofaTimeStreamingAvailabilityPayload,
        injectTmdbProviderCatalog,
        isSofaTimeRequest,
        isStreamingAvailabilityCountriesRequest
    };
}

export {
    createSofaTimePlayerInjectionService
};
