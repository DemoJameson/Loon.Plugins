import { isNonNullish } from "../../shared/common.mjs";
import { MEDIA_TYPE } from "../../shared/media-types.mjs";

const MEDIA_CONFIG = {
    [MEDIA_TYPE.SHOW]: {
        buildTranslationPath(ref) {
            return isNonNullish(ref?.traktId) ? `/shows/${ref.traktId}/translations/zh?extended=all` : "";
        }
    },
    [MEDIA_TYPE.MOVIE]: {
        buildTranslationPath(ref) {
            return isNonNullish(ref?.traktId) ? `/movies/${ref.traktId}/translations/zh?extended=all` : "";
        }
    },
    [MEDIA_TYPE.EPISODE]: {
        buildTranslationPath(ref) {
            return ref && isNonNullish(ref.showId) && isNonNullish(ref.seasonNumber) && isNonNullish(ref.episodeNumber)
                ? `/shows/${ref.showId}/seasons/${ref.seasonNumber}/episodes/${ref.episodeNumber}/translations/zh?extended=all`
                : "";
        }
    }
};

export {
    MEDIA_CONFIG
};
