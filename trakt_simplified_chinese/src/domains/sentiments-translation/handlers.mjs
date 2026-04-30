import { MEDIA_TYPE } from "../../shared/media-types.mjs";
import {
    computeStringHash,
    ensureArray,
    ensureObject,
    isPlainObject
} from "../../shared/common.mjs";

function createSentimentsHandler(deps) {
    const {
        scriptContext,
        requestUrl,
        body,
        googleTranslationEnabled,
        loadSentimentTranslationCache,
        saveSentimentTranslationCache,
        translateTextsWithGoogle,
        normalizeUrlPath
    } = deps;

    function buildSentimentCacheKey(mediaType, traktId) {
        if (!traktId || (mediaType !== MEDIA_TYPE.SHOW && mediaType !== MEDIA_TYPE.MOVIE)) {
            return "";
        }

        return `${mediaType}:${traktId}`;
    }

    function resolveSentimentRequestTarget(url) {
        const normalizedPath = normalizeUrlPath(url);
        let match = normalizedPath.match(/^\/(?:v3\/)?media\/(movie|show)\/(\d+)\/info\/(\d+)\/version\/(\d+)$/i);
        if (match) {
            return {
                mediaType: String(match[1]).toLowerCase() === "show" ? MEDIA_TYPE.SHOW : MEDIA_TYPE.MOVIE,
                traktId: match[2],
                infoId: match[3],
                version: match[4]
            };
        }

        match = normalizedPath.match(/^\/(shows|movies)\/(\d+)\/sentiments$/i);
        if (match) {
            return {
                mediaType: String(match[1]).toLowerCase() === "shows" ? MEDIA_TYPE.SHOW : MEDIA_TYPE.MOVIE,
                traktId: match[2],
                infoId: null,
                version: null
            };
        }

        return null;
    }

    function normalizeSentimentAspectItem(item) {
        const normalized = ensureObject(item);
        return {
            ...normalized,
            theme: String(normalized.theme ?? "")
        };
    }

    function normalizeSentimentGroupItem(item) {
        const normalized = ensureObject(item);
        return {
            ...normalized,
            sentiment: String(normalized.sentiment ?? ""),
            comment_ids: ensureArray(normalized.comment_ids)
        };
    }

    function normalizeSentimentInfoItem(item) {
        const normalized = ensureObject(item);
        return {
            ...normalized,
            text: String(normalized.text ?? "")
        };
    }

    function cloneSentimentsPayload(payload) {
        const normalized = ensureObject(payload);
        return {
            ...normalized,
            aspect: {
                ...ensureObject(normalized.aspect),
                pros: ensureArray(normalized.aspect?.pros).map(normalizeSentimentAspectItem),
                cons: ensureArray(normalized.aspect?.cons).map(normalizeSentimentAspectItem)
            },
            good: ensureArray(normalized.good).map(normalizeSentimentGroupItem),
            bad: ensureArray(normalized.bad).map(normalizeSentimentGroupItem),
            summary: ensureArray(normalized.summary).map((item) => String(item ?? "")),
            text: String(normalized.text ?? ""),
            analysis: String(normalized.analysis ?? ""),
            highlight: String(normalized.highlight ?? ""),
            items: ensureArray(normalized.items).map(normalizeSentimentInfoItem)
        };
    }

    function buildSentimentTranslationPayload(payload) {
        const aspect = ensureObject(payload?.aspect);
        return {
            aspect: {
                pros: ensureArray(aspect.pros).map((item) => ({
                    sourceTextHash: computeStringHash(item?.sourceTheme ?? item?.theme ?? ""),
                    translatedText: String(item?.translatedTheme ?? item?.theme ?? "")
                })),
                cons: ensureArray(aspect.cons).map((item) => ({
                    sourceTextHash: computeStringHash(item?.sourceTheme ?? item?.theme ?? ""),
                    translatedText: String(item?.translatedTheme ?? item?.theme ?? "")
                }))
            },
            good: ensureArray(payload?.good).map((item) => ({
                sourceTextHash: computeStringHash(item?.sourceSentiment ?? item?.sentiment ?? ""),
                translatedText: String(item?.translatedSentiment ?? item?.sentiment ?? "")
            })),
            bad: ensureArray(payload?.bad).map((item) => ({
                sourceTextHash: computeStringHash(item?.sourceSentiment ?? item?.sentiment ?? ""),
                translatedText: String(item?.translatedSentiment ?? item?.sentiment ?? "")
            })),
            summary: ensureArray(payload?.summary).map((item) => ({
                sourceTextHash: computeStringHash(item?.sourceText ?? item?.text ?? item ?? ""),
                translatedText: String(item?.translatedText ?? item?.text ?? item ?? "")
            })),
            analysis: {
                sourceTextHash: computeStringHash(payload?.sourceAnalysis ?? payload?.analysis ?? ""),
                translatedText: String(payload?.translatedAnalysis ?? payload?.analysis ?? "")
            },
            highlight: {
                sourceTextHash: computeStringHash(payload?.sourceHighlight ?? payload?.highlight ?? ""),
                translatedText: String(payload?.translatedHighlight ?? payload?.highlight ?? "")
            },
            items: ensureArray(payload?.items).map((item) => ({
                sourceTextHash: computeStringHash(item?.sourceText ?? item?.text ?? ""),
                translatedText: String(item?.translatedText ?? item?.text ?? "")
            })),
            text: {
                sourceTextHash: computeStringHash(payload?.sourceText ?? payload?.text ?? ""),
                translatedText: String(payload?.translatedText ?? payload?.text ?? "")
            }
        };
    }

    function applySentimentTranslationPayload(target, translation) {
        const payload = cloneSentimentsPayload(target);
        const translated = ensureObject(translation);
        const translatedAspect = ensureObject(translated.aspect);

        ensureArray(payload.aspect?.pros).forEach((item, index) => {
            const entry = ensureObject(ensureArray(translatedAspect.pros)[index]);
            const sourceTextHash = computeStringHash(item?.theme ?? "");
            const translatedText = String(entry.translatedText ?? "").trim();
            if (translatedText && String(entry.sourceTextHash ?? "") === sourceTextHash) {
                item.theme = translatedText;
            }
        });

        ensureArray(payload.aspect?.cons).forEach((item, index) => {
            const entry = ensureObject(ensureArray(translatedAspect.cons)[index]);
            const sourceTextHash = computeStringHash(item?.theme ?? "");
            const translatedText = String(entry.translatedText ?? "").trim();
            if (translatedText && String(entry.sourceTextHash ?? "") === sourceTextHash) {
                item.theme = translatedText;
            }
        });

        ensureArray(payload.summary).forEach((item, index) => {
            const entry = ensureObject(ensureArray(translated.summary)[index]);
            const sourceTextHash = computeStringHash(item ?? "");
            const translatedText = String(entry.translatedText ?? "").trim();
            if (translatedText && String(entry.sourceTextHash ?? "") === sourceTextHash) {
                payload.summary[index] = translatedText;
            }
        });

        const analysisTranslation = ensureObject(translated.analysis);
        const analysisSourceHash = computeStringHash(payload.analysis ?? "");
        const translatedAnalysis = String(analysisTranslation.translatedText ?? "").trim();
        if (translatedAnalysis && String(analysisTranslation.sourceTextHash ?? "") === analysisSourceHash) {
            payload.analysis = translatedAnalysis;
        }

        const highlightTranslation = ensureObject(translated.highlight);
        const highlightSourceHash = computeStringHash(payload.highlight ?? "");
        const translatedHighlight = String(highlightTranslation.translatedText ?? "").trim();
        if (translatedHighlight && String(highlightTranslation.sourceTextHash ?? "") === highlightSourceHash) {
            payload.highlight = translatedHighlight;
        }

        ensureArray(payload.items).forEach((item, index) => {
            const entry = ensureObject(ensureArray(translated.items)[index]);
            const sourceTextHash = computeStringHash(item?.text ?? "");
            const translatedText = String(entry.translatedText ?? "").trim();
            if (translatedText && String(entry.sourceTextHash ?? "") === sourceTextHash) {
                item.text = translatedText;
            }
        });

        const textTranslation = ensureObject(translated.text);
        const textSourceHash = computeStringHash(payload.text ?? "");
        const translatedText = String(textTranslation.translatedText ?? "").trim();
        if (translatedText && String(textTranslation.sourceTextHash ?? "") === textSourceHash) {
            payload.text = translatedText;
        }

        ensureArray(payload.good).forEach((item, index) => {
            const entry = ensureObject(ensureArray(translated.good)[index]);
            const sourceTextHash = computeStringHash(item?.sentiment ?? "");
            const translatedText = String(entry.translatedText ?? "").trim();
            if (translatedText && String(entry.sourceTextHash ?? "") === sourceTextHash) {
                item.sentiment = translatedText;
            }
        });

        ensureArray(payload.bad).forEach((item, index) => {
            const entry = ensureObject(ensureArray(translated.bad)[index]);
            const sourceTextHash = computeStringHash(item?.sentiment ?? "");
            const translatedText = String(entry.translatedText ?? "").trim();
            if (translatedText && String(entry.sourceTextHash ?? "") === sourceTextHash) {
                item.sentiment = translatedText;
            }
        });

        return payload;
    }

    function hasMatchingSentimentTranslationPayload(target, translation) {
        const payload = cloneSentimentsPayload(target);
        const translated = ensureObject(translation);
        const currentAspect = ensureObject(payload.aspect);
        const cachedAspect = ensureObject(translated.aspect);
        const aspectGroups = ["pros", "cons"];
        const aspectMatches = aspectGroups.every((group) => {
            const currentItems = ensureArray(currentAspect[group]);
            const cachedItems = ensureArray(cachedAspect[group]);
            if (currentItems.length !== cachedItems.length) {
                return false;
            }

            return currentItems.every((item, index) => {
                return computeStringHash(item?.theme ?? "") === String(cachedItems[index]?.sourceTextHash ?? "");
            });
        });
        if (!aspectMatches) {
            return false;
        }

        const goodItems = ensureArray(payload.good);
        const cachedGoodItems = ensureArray(translated.good);
        if (goodItems.length !== cachedGoodItems.length) {
            return false;
        }

        const goodMatches = goodItems.every((item, index) => {
            return computeStringHash(item?.sentiment ?? "") === String(cachedGoodItems[index]?.sourceTextHash ?? "");
        });
        if (!goodMatches) {
            return false;
        }

        const badItems = ensureArray(payload.bad);
        const cachedBadItems = ensureArray(translated.bad);
        if (badItems.length !== cachedBadItems.length) {
            return false;
        }

        const badMatches = badItems.every((item, index) => {
            return computeStringHash(item?.sentiment ?? "") === String(cachedBadItems[index]?.sourceTextHash ?? "");
        });
        if (!badMatches) {
            return false;
        }

        const currentSummary = ensureArray(payload.summary);
        const cachedSummary = ensureArray(translated.summary);
        if (currentSummary.length !== cachedSummary.length) {
            return false;
        }

        const summaryMatches = currentSummary.every((item, index) => {
            return computeStringHash(item ?? "") === String(cachedSummary[index]?.sourceTextHash ?? "");
        });
        if (!summaryMatches) {
            return false;
        }

        if (computeStringHash(payload.analysis ?? "") !== String(translated.analysis?.sourceTextHash ?? "")) {
            return false;
        }

        if (computeStringHash(payload.highlight ?? "") !== String(translated.highlight?.sourceTextHash ?? "")) {
            return false;
        }

        const currentItems = ensureArray(payload.items);
        const cachedItems = ensureArray(translated.items);
        if (currentItems.length !== cachedItems.length) {
            return false;
        }

        const itemsMatch = currentItems.every((item, index) => {
            return computeStringHash(item?.text ?? "") === String(cachedItems[index]?.sourceTextHash ?? "");
        });
        if (!itemsMatch) {
            return false;
        }

        return computeStringHash(payload.text ?? "") === String(translated.text?.sourceTextHash ?? "");
    }

    function getSentimentTranslationCacheEntry(cache, mediaType, traktId) {
        const cacheKey = buildSentimentCacheKey(mediaType, traktId);
        const entry = cacheKey ? cache[cacheKey] : null;
        return entry || null;
    }

    function storeSentimentTranslationCacheEntry(cache, mediaType, traktId, payload) {
        const cacheKey = buildSentimentCacheKey(mediaType, traktId);
        if (!cacheKey) {
            return;
        }

        cache[cacheKey] = {
            translation: buildSentimentTranslationPayload(payload),
            updatedAt: Date.now()
        };
    }

    async function translateSentimentItems(items) {
        const translationTargets = ensureArray(items).filter((item) => {
            return String(item?.text ?? "").trim();
        });
        if (translationTargets.length === 0) {
            return;
        }

        const translatedTexts = await translateTextsWithGoogle(
            translationTargets.map((item) => String(item.text).trim()),
            "en"
        );

        translationTargets.forEach((item, index) => {
            const translatedText = String(translatedTexts[index] ?? "").trim();
            if (translatedText) {
                item.sourceText = String(item.text).trim();
                item.translatedText = translatedText;
            }
        });
    }

    return async function handleSentiments() {
        const data = JSON.parse(body);
        if (!isPlainObject(data)) {
            scriptContext.done({});
            return;
        }

        const target = resolveSentimentRequestTarget(requestUrl);
        if (!target) {
            scriptContext.done({});
            return;
        }

        const cache = loadSentimentTranslationCache();
        const cachedEntry = getSentimentTranslationCacheEntry(cache, target.mediaType, target.traktId);
        if (cachedEntry?.translation && hasMatchingSentimentTranslationPayload(data, cachedEntry.translation)) {
            scriptContext.doneJson(applySentimentTranslationPayload(data, cachedEntry.translation));
            return;
        }

        if (!googleTranslationEnabled) {
            scriptContext.doneJson(data);
            return;
        }

        const translatedData = cloneSentimentsPayload(data);
        const translationTargets = [];

        ensureArray(translatedData.aspect?.pros).forEach((item) => {
            translationTargets.push({ target: item, field: "theme", text: String(item?.theme ?? "") });
        });
        ensureArray(translatedData.aspect?.cons).forEach((item) => {
            translationTargets.push({ target: item, field: "theme", text: String(item?.theme ?? "") });
        });
        ensureArray(translatedData.good).forEach((item) => {
            translationTargets.push({ target: item, field: "sentiment", text: String(item?.sentiment ?? "") });
        });
        ensureArray(translatedData.bad).forEach((item) => {
            translationTargets.push({ target: item, field: "sentiment", text: String(item?.sentiment ?? "") });
        });
        ensureArray(translatedData.summary).forEach((item, index) => {
            translationTargets.push({ target: translatedData.summary, field: index, text: String(item ?? "") });
        });
        translationTargets.push({ target: translatedData, field: "analysis", text: String(translatedData.analysis ?? "") });
        translationTargets.push({ target: translatedData, field: "highlight", text: String(translatedData.highlight ?? "") });
        ensureArray(translatedData.items).forEach((item) => {
            translationTargets.push({ target: item, field: "text", text: String(item?.text ?? "") });
        });
        translationTargets.push({ target: translatedData, field: "text", text: String(translatedData.text ?? "") });

        try {
            await translateSentimentItems(translationTargets);
            translationTargets.forEach((item) => {
                if (String(item?.translatedText ?? "").trim()) {
                    item.target[item.field] = String(item.translatedText);
                }
                delete item.sourceText;
                delete item.translatedText;
            });

            const cachePayload = cloneSentimentsPayload(data);
            const cacheTargets = [];

            ensureArray(cachePayload.aspect?.pros).forEach((item) => {
                cacheTargets.push({ target: item, field: "theme", text: String(item?.theme ?? "") });
            });
            ensureArray(cachePayload.aspect?.cons).forEach((item) => {
                cacheTargets.push({ target: item, field: "theme", text: String(item?.theme ?? "") });
            });
            ensureArray(cachePayload.good).forEach((item) => {
                cacheTargets.push({ target: item, field: "sentiment", text: String(item?.sentiment ?? "") });
            });
            ensureArray(cachePayload.bad).forEach((item) => {
                cacheTargets.push({ target: item, field: "sentiment", text: String(item?.sentiment ?? "") });
            });
            ensureArray(cachePayload.summary).forEach((item, index) => {
                cacheTargets.push({ target: cachePayload.summary, field: index, text: String(item ?? "") });
            });
            cacheTargets.push({ target: cachePayload, field: "analysis", text: String(cachePayload.analysis ?? "") });
            cacheTargets.push({ target: cachePayload, field: "highlight", text: String(cachePayload.highlight ?? "") });
            ensureArray(cachePayload.items).forEach((item) => {
                cacheTargets.push({ target: item, field: "text", text: String(item?.text ?? "") });
            });
            cacheTargets.push({ target: cachePayload, field: "text", text: String(cachePayload.text ?? "") });

            await translateSentimentItems(cacheTargets);
            cacheTargets.forEach((item) => {
                if (String(item?.translatedText ?? "").trim()) {
                    item.target[`source${String(item.field).charAt(0).toUpperCase()}${String(item.field).slice(1)}`] = item.text;
                    item.target[`translated${String(item.field).charAt(0).toUpperCase()}${String(item.field).slice(1)}`] =
                        String(item.translatedText);
                }
            });

            storeSentimentTranslationCacheEntry(cache, target.mediaType, target.traktId, cachePayload);
            saveSentimentTranslationCache(cache);
        } catch (e) {
            scriptContext.log(`Trakt sentiments translate failed: ${e}`);
        }

        scriptContext.doneJson(translatedData);
    };
}

export {
    createSentimentsHandler
};
