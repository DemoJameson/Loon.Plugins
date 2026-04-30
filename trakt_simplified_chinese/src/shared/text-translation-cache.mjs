import {
    computeStringHash,
    isNullish,
    isPlainObject
} from "./common.mjs";

function buildFieldTranslationCacheKey(id) {
    return isNullish(id) ? "" : String(id);
}

function getHashedFieldTranslation(cache, id, field, sourceText) {
    const cacheKey = buildFieldTranslationCacheKey(id);
    if (!cacheKey) {
        return "";
    }

    const entry = cache?.[cacheKey];
    const fieldEntry = isPlainObject(entry?.[field]) ? entry[field] : null;
    return fieldEntry && String(fieldEntry.sourceTextHash ?? "") === computeStringHash(sourceText)
        ? String(fieldEntry.translatedText ?? "").trim()
        : "";
}

function setHashedFieldTranslation(cache, id, field, sourceText, translatedText) {
    const cacheKey = buildFieldTranslationCacheKey(id);
    const normalizedTranslation = String(translatedText ?? "").trim();
    if (!cacheKey || !normalizedTranslation) {
        return false;
    }

    const currentEntry = isPlainObject(cache?.[cacheKey]) ? cache[cacheKey] : {};
    const nextFieldEntry = {
        sourceTextHash: computeStringHash(sourceText),
        translatedText: normalizedTranslation
    };
    const currentFieldEntry = isPlainObject(currentEntry[field]) ? currentEntry[field] : null;
    if (
        currentFieldEntry &&
        currentFieldEntry.sourceTextHash === nextFieldEntry.sourceTextHash &&
        currentFieldEntry.translatedText === nextFieldEntry.translatedText
    ) {
        return false;
    }

    cache[cacheKey] = {
        ...currentEntry,
        [field]: nextFieldEntry,
        updatedAt: Date.now()
    };
    return true;
}

export {
    buildFieldTranslationCacheKey,
    getHashedFieldTranslation,
    setHashedFieldTranslation
};
