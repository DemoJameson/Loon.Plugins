import { isNotArray } from "../utils.mjs";
import {
    REQUIRED_TRANSLATION_FIELDS,
    TRANSLATION_FALLBACK_REGIONS,
    TRANSLATION_FIELDS
} from "./constants.mjs";

const CACHE_STATUS = {
    FOUND: 1,
    PARTIAL_FOUND: 2,
    NOT_FOUND: 3
};

function isEmptyTranslationValue(value) {
    return value === undefined || value === null || value === "";
}

function sortTranslations(arr, preferredLanguage) {
    const match = String(preferredLanguage ?? "").match(/([a-zA-Z]{2})(?:-([a-zA-Z]{2}))?/);
    const preference = {
        lang: match?.[1]?.toLowerCase() ?? null,
        region: match?.[2]?.toLowerCase() ?? null
    };

    if (!preference.lang) {
        return arr;
    }

    arr.sort((a, b) => {
        const getScore = (item) => {
            const itemLang = item?.language?.toLowerCase() ?? null;
            const itemRegion = item?.country?.toLowerCase() ?? null;

            if (itemLang !== preference.lang) {
                return 0;
            }
            if (preference.region && itemRegion === preference.region) {
                return 2;
            }
            return 1;
        };

        return getScore(b) - getScore(a);
    });

    return arr;
}

function hasUsefulTranslation(translation) {
    return !!(
        translation &&
        (!isEmptyTranslationValue(translation.title) ||
            !isEmptyTranslationValue(translation.overview) ||
            !isEmptyTranslationValue(translation.tagline))
    );
}

function normalizeTranslationPayload(translation) {
    if (!translation || typeof translation !== "object") {
        return null;
    }

    const normalized = {
        title: translation.title ?? null,
        overview: translation.overview ?? null,
        tagline: translation.tagline ?? null
    };

    return hasUsefulTranslation(normalized) ? normalized : null;
}

function findTranslationByRegion(items, region) {
    return items.find((item) => {
        return String(item?.language ?? "").toLowerCase() === "zh" &&
            String(item?.country ?? "").toLowerCase() === region;
    }) ?? null;
}

function isChineseTranslation(item) {
    return String(item?.language ?? "").toLowerCase() === "zh";
}

function normalizeTranslations(items) {
    if (isNotArray(items)) {
        items = [];
    }

    let cnTranslation = findTranslationByRegion(items, "cn");
    const originalCnFound = !!cnTranslation;
    const originalCnComplete = originalCnFound && REQUIRED_TRANSLATION_FIELDS.every((field) => {
        return !isEmptyTranslationValue(cnTranslation[field]);
    });
    const hasAnyChineseTitle = items.some((item) => {
        return isChineseTranslation(item) && !isEmptyTranslationValue(item.title);
    });

    if (!cnTranslation) {
        cnTranslation = {
            language: "zh",
            country: "cn"
        };
        items.unshift(cnTranslation);
    }

    TRANSLATION_FIELDS.forEach((field) => {
        if (!isEmptyTranslationValue(cnTranslation[field])) {
            return;
        }

        for (let i = 0; i < TRANSLATION_FALLBACK_REGIONS.length; i += 1) {
            const fallback = findTranslationByRegion(items, TRANSLATION_FALLBACK_REGIONS[i]);
            if (fallback && !isEmptyTranslationValue(fallback[field])) {
                cnTranslation[field] = fallback[field];
                break;
            }
        }
    });

    cnTranslation.status = originalCnComplete
        ? CACHE_STATUS.FOUND
        : hasAnyChineseTitle
            ? CACHE_STATUS.PARTIAL_FOUND
            : CACHE_STATUS.NOT_FOUND;

    return items;
}

function pickCnTranslation(items) {
    if (isNotArray(items) || items.length === 0) {
        return null;
    }

    return items.find((item) => {
        return String(item?.language ?? "").toLowerCase() === "zh" &&
            String(item?.country ?? "").toLowerCase() === "cn";
    }) ?? null;
}

function extractNormalizedTranslation(items) {
    const cnTranslation = pickCnTranslation(items);
    const translation = normalizeTranslationPayload(cnTranslation);

    return {
        status: cnTranslation?.status ?? CACHE_STATUS.NOT_FOUND,
        translation: translation
    };
}

function areTranslationsEqual(left, right) {
    const normalizedLeft = normalizeTranslationPayload(left);
    const normalizedRight = normalizeTranslationPayload(right);

    if (!normalizedLeft && !normalizedRight) {
        return true;
    }

    if (!normalizedLeft || !normalizedRight) {
        return false;
    }

    return normalizedLeft.title === normalizedRight.title &&
        normalizedLeft.overview === normalizedRight.overview &&
        normalizedLeft.tagline === normalizedRight.tagline;
}

export {
    CACHE_STATUS,
    areTranslationsEqual,
    extractNormalizedTranslation,
    normalizeTranslationPayload,
    normalizeTranslations,
    sortTranslations
};
