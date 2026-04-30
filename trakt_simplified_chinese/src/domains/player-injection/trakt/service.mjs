import { MEDIA_TYPE } from "../../../shared/media-types.mjs";
import {
    buildCustomWatchnowEntries,
    injectCustomSourcesIntoPayload,
    injectCustomWatchnowEntriesIntoPayload,
    injectWatchnowFavoriteSources,
    resolveWatchnowRegion,
    resolveWatchnowTarget
} from "./watchnow.mjs";
import {
    ensureObject,
    isNonNullish,
    isPlainObject
} from "../../../shared/common.mjs";

function createTraktPlayerInjectionService(deps) {
    const {
        enabledPlayerTypes,
        playerDefinitions,
        regionCodes,
        watchnowRedirectUrl,
        shortcutsOpenlinkUrl,
        playerLogoAssetBaseUrl,
        getLinkIdsCacheEntry,
        ensureMediaIdsCacheEntry,
        ensureEpisodeShowIds
    } = deps;

    function buildWatchnowRedirectLink(deeplink) {
        if (!deeplink) {
            return "";
        }

        return `${watchnowRedirectUrl}?deeplink=${encodeURIComponent(deeplink)}`;
    }

    function buildShortcutsJumpLink(deeplink) {
        if (!deeplink) {
            return "";
        }

        return `${shortcutsOpenlinkUrl}${encodeURIComponent(deeplink)}`;
    }

    function buildTraktPlayerLaunchLink(deeplink) {
        if (!deeplink) {
            return "";
        }

        return buildWatchnowRedirectLink(deeplink);
    }

    async function resolveWatchnowContext(target, linkCache) {
        if (!target || !linkCache) {
            return null;
        }

        if (target.mediaType === MEDIA_TYPE.MOVIE) {
            const movieEntry = await ensureMediaIdsCacheEntry(linkCache, MEDIA_TYPE.MOVIE, target.traktId);
            return movieEntry && movieEntry.ids && isNonNullish(movieEntry.ids.tmdb)
                ? { tmdbId: movieEntry.ids.tmdb }
                : null;
        }

        if (target.mediaType === MEDIA_TYPE.SHOW) {
            const showEntry = await ensureMediaIdsCacheEntry(linkCache, MEDIA_TYPE.SHOW, target.traktId);
            return showEntry && showEntry.ids && isNonNullish(showEntry.ids.tmdb)
                ? {
                    tmdbId: showEntry.ids.tmdb,
                    showTmdbId: showEntry.ids.tmdb
                }
                : null;
        }

        if (target.mediaType === MEDIA_TYPE.EPISODE) {
            const episodeEntry = getLinkIdsCacheEntry(linkCache, target.traktId);
            if (!episodeEntry) {
                return null;
            }

            const showIds = await ensureEpisodeShowIds(linkCache, target.traktId, episodeEntry);
            return isPlainObject(showIds) && isNonNullish(showIds.tmdb)
                ? {
                    tmdbId: episodeEntry.ids && episodeEntry.ids.tmdb,
                    showTmdbId: showIds.tmdb,
                    seasonNumber: episodeEntry.seasonNumber,
                    episodeNumber: episodeEntry.episodeNumber
                }
                : null;
        }

        return null;
    }

    function injectWatchnowPayload(payload, target, context) {
        const customEntries = buildCustomWatchnowEntries(
            target,
            context,
            enabledPlayerTypes,
            playerDefinitions,
            buildTraktPlayerLaunchLink
        );
        return injectCustomWatchnowEntriesIntoPayload(payload, customEntries, regionCodes);
    }

    function injectUserSettingsPayload(data) {
        if (!data || typeof data !== "object") {
            return data;
        }

        data.user = ensureObject(data.user);
        data.user.vip = true;

        data.account = ensureObject(data.account);
        data.account.display_ads = false;

        data.browsing = ensureObject(data.browsing);
        data.browsing.watchnow = ensureObject(data.browsing.watchnow);

        const watchnowRegion = resolveWatchnowRegion(data.browsing.watchnow);
        data.browsing.watchnow.favorites = injectWatchnowFavoriteSources(
            data.browsing.watchnow.favorites,
            watchnowRegion
        );

        return data;
    }

    function resolveDirectRedirectLocation(url) {
        try {
            const parsedUrl = new URL(String(url ?? ""));
            const redirectUrl = new URL(String(watchnowRedirectUrl ?? ""));
            if (
                String(parsedUrl.hostname).toLowerCase() === String(redirectUrl.hostname).toLowerCase() &&
                parsedUrl.pathname === redirectUrl.pathname
            ) {
                const deeplink = parsedUrl.searchParams.get("deeplink");
                if (deeplink) {
                    return decodeURIComponent(deeplink);
                }
            }

            if (
                String(parsedUrl.hostname).toLowerCase() === "image.tmdb.org" &&
                /^\/t\/p\/w342\/([a-z0-9_-]+)_logo\.webp$/i.test(parsedUrl.pathname)
            ) {
                const match = parsedUrl.pathname.match(/^\/t\/p\/w342\/([a-z0-9_-]+)_logo\.webp$/i);
                if (match?.[1]) {
                    return `${playerLogoAssetBaseUrl}/${match[1].toLowerCase()}_logo.webp`;
                }
            }
        } catch (e) {
            return "";
        }

        return "";
    }

    return {
        buildShortcutsJumpLink,
        injectUserSettingsPayload,
        injectWatchnowPayload,
        injectWatchnowSourcesPayload: injectCustomSourcesIntoPayload,
        resolveDirectRedirectLocation,
        resolveWatchnowContext,
        resolveWatchnowTarget
    };
}

export {
    createTraktPlayerInjectionService
};
