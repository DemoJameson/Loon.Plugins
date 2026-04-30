import { MEDIA_TYPE } from "../../shared/media-types.mjs";
import { isNonNullish } from "../../shared/common.mjs";

const PLAYER_TYPE = {
    EPLAYERX: "eplayerx",
    FORWARD: "forward",
    INFUSE: "infuse"
};

const REGION_CODES = [
    "AD", "AE", "AG", "AL", "AO", "AR", "AT", "AU", "AZ", "BA", "BB", "BE", "BF", "BG", "BH", "BM",
    "BO", "BR", "BS", "BY", "BZ", "CA", "CD", "CH", "CI", "CL", "CM", "CO", "CR", "CU", "CV", "CY",
    "CZ", "DE", "DK", "DO", "DZ", "EC", "EE", "EG", "ES", "FI", "FJ", "FR", "GB", "GF", "GG", "GH",
    "GI", "GQ", "GR", "GT", "GY", "HK", "HN", "HR", "HU", "ID", "IE", "IL", "IN", "IQ", "IS", "IT",
    "JM", "JO", "JP", "KE", "KR", "KW", "LB", "LC", "LI", "LT", "LU", "LV", "LY", "MA", "MC", "MD",
    "ME", "MG", "MK", "ML", "MT", "MU", "MW", "MX", "MY", "MZ", "NE", "NG", "NI", "NL", "NO", "NZ",
    "OM", "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PS", "PT", "PY", "QA", "RO", "RS", "RU", "SA",
    "SC", "SE", "SG", "SI", "SK", "SM", "SN", "SV", "TC", "TD", "TH", "TN", "TR", "TT", "TW", "TZ",
    "UA", "UG", "US", "UY", "VA", "VE", "XK", "YE", "ZA", "ZM", "ZW"
];

const PLAYER_LOGO_ASSET_BASE_URL = "https://raw.githubusercontent.com/DemoJameson/Loon.Plugins/main/trakt_simplified_chinese/images";

const PLAYER_DEFINITIONS = {
    [PLAYER_TYPE.EPLAYERX]: {
        type: PLAYER_TYPE.EPLAYERX,
        name: "EplayerX",
        homePage: "https://apps.apple.com/cn/app/eplayerx/id6747369377",
        logo: "eplayerx_logo.webp",
        color: "#33c1c0"
    },
    [PLAYER_TYPE.FORWARD]: {
        type: PLAYER_TYPE.FORWARD,
        name: "Forward",
        homePage: "https://apps.apple.com/cn/app/forward/id6503940939",
        logo: "forward_logo.webp",
        color: "#000000"
    },
    [PLAYER_TYPE.INFUSE]: {
        type: PLAYER_TYPE.INFUSE,
        name: "Infuse",
        homePage: "https://firecore.com/infuse",
        logo: "infuse_logo.webp",
        color: "#ff8000"
    }
};

function buildInfuseDeeplink(target, context) {
    if (!target || !context) {
        return "";
    }

    if (target.mediaType === MEDIA_TYPE.MOVIE && isNonNullish(context.tmdbId)) {
        return `infuse://movie/${context.tmdbId}`;
    }

    if (target.mediaType === MEDIA_TYPE.SHOW && isNonNullish(context.tmdbId)) {
        return `infuse://series/${context.tmdbId}`;
    }

    if (
        target.mediaType === MEDIA_TYPE.EPISODE &&
        isNonNullish(context.showTmdbId) &&
        isNonNullish(context.seasonNumber) &&
        isNonNullish(context.episodeNumber)
    ) {
        return `infuse://series/${context.showTmdbId}-${context.seasonNumber}-${context.episodeNumber}`;
    }

    return "";
}

function buildForwardDeeplink(target, context) {
    if (!target || !context) {
        return "";
    }

    if (target.mediaType === MEDIA_TYPE.MOVIE && isNonNullish(context.tmdbId)) {
        return `forward://tmdb?id=${context.tmdbId}&type=movie`;
    }

    if ((target.mediaType === MEDIA_TYPE.SHOW || target.mediaType === MEDIA_TYPE.EPISODE) && isNonNullish(context.showTmdbId ?? context.tmdbId)) {
        return `forward://tmdb?id=${context.showTmdbId ?? context.tmdbId}&type=tv`;
    }

    return "";
}

function buildEplayerXDeeplink(target, context) {
    if (!target || !context) {
        return "";
    }

    if (target.mediaType === MEDIA_TYPE.MOVIE && isNonNullish(context.tmdbId)) {
        return `eplayerx://tmdb-info/detail?id=${context.tmdbId}&type=movie`;
    }

    if ((target.mediaType === MEDIA_TYPE.SHOW || target.mediaType === MEDIA_TYPE.EPISODE) && isNonNullish(context.showTmdbId ?? context.tmdbId)) {
        return `eplayerx://tmdb-info/detail?id=${context.showTmdbId ?? context.tmdbId}&type=tv`;
    }

    return "";
}

const PLAYER_LAUNCHERS = {
    [PLAYER_TYPE.EPLAYERX]: buildEplayerXDeeplink,
    [PLAYER_TYPE.FORWARD]: buildForwardDeeplink,
    [PLAYER_TYPE.INFUSE]: buildInfuseDeeplink
};

function buildPlayerDeeplink(source, target, context) {
    const builder = PLAYER_LAUNCHERS[source];
    return typeof builder === "function" ? builder(target, context) : "";
}

export {
    buildPlayerDeeplink,
    PLAYER_DEFINITIONS,
    PLAYER_LAUNCHERS,
    PLAYER_LOGO_ASSET_BASE_URL,
    PLAYER_TYPE,
    REGION_CODES
};
