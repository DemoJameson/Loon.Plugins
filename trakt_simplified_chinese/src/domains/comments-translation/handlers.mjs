import {
    computeStringHash,
    ensureArray,
    isNonNullish,
    isNotArray,
    isNullish,
    isPlainObject
} from "../../shared/common.mjs";

const GOOGLE_TRANSLATE_BATCH_SIZE = 128;

function createCommentsTranslationHandlers(deps) {
    const {
        scriptContext,
        body,
        googleTranslationEnabled,
        loadCommentTranslationCache,
        saveCommentTranslationCache,
        translateTextsWithGoogle,
        translateMediaItemsInPlace,
        isChineseLanguage
    } = deps;

    function getCommentTranslationCacheEntry(cache, commentId) {
        if (!cache || isNullish(commentId)) {
            return null;
        }

        const entry = cache[String(commentId)];
        return isPlainObject(entry) ? entry : null;
    }

    function setCommentTranslationCacheEntry(cache, commentId, sourceText, translatedText) {
        if (!cache || isNullish(commentId)) {
            return false;
        }

        const key = String(commentId);
        const nextEntry = {
            sourceTextHash: computeStringHash(sourceText),
            translatedText: String(translatedText ?? ""),
            updatedAt: Date.now()
        };
        const currentEntry = getCommentTranslationCacheEntry(cache, key);
        if (
            currentEntry &&
            currentEntry.sourceTextHash === nextEntry.sourceTextHash &&
            currentEntry.translatedText === nextEntry.translatedText
        ) {
            return false;
        }

        cache[key] = nextEntry;
        return true;
    }

    function getCachedCommentTranslation(cache, comment) {
        const entry = getCommentTranslationCacheEntry(cache, comment?.id);
        if (!entry) {
            return null;
        }

        return entry.sourceTextHash === computeStringHash(comment?.comment ?? "")
            ? String(entry.translatedText ?? "")
            : null;
    }

    function shouldTranslateComment(comment) {
        return !!(
            isPlainObject(comment) &&
            isNonNullish(comment.id) &&
            typeof comment.comment === "string" &&
            !isChineseLanguage(comment.language)
        );
    }

    function collectCommentTargets(payload) {
        if (isNotArray(payload) || payload.length === 0) {
            return [];
        }

        const commentTargets = [];
        payload.forEach((item) => {
            if (isPlainObject(item?.comment)) {
                commentTargets.push(item.comment);
            } else if (isPlainObject(item) && isNonNullish(item.id) && typeof item.comment === "string") {
                commentTargets.push(item);
            }
        });
        return commentTargets;
    }

    function collectCommentTranslationGroups(comments, cache) {
        const groups = {};
        ensureArray(comments).forEach((comment) => {
            if (!shouldTranslateComment(comment)) {
                return;
            }

            const cachedTranslation = getCachedCommentTranslation(cache, comment);
            if (cachedTranslation) {
                comment.comment = cachedTranslation;
                return;
            }

            const language = String(comment.language ?? "en").toLowerCase();
            if (!groups[language]) {
                groups[language] = [];
            }
            groups[language].push(comment);
        });
        return groups;
    }

    async function translateCommentGroup(comments, sourceLanguage, cache) {
        const sourceTexts = comments.map((item) => item.comment);
        const translatedTexts = await translateTextsWithGoogle(sourceTexts, sourceLanguage);
        comments.forEach((comment, index) => {
            const translatedText = String(translatedTexts[index] ?? "").trim();
            if (!translatedText) {
                return;
            }

            setCommentTranslationCacheEntry(cache, comment.id, sourceTexts[index], translatedText);
            comment.comment = translatedText;
        });
    }

    async function translateCommentsInPlace(payload) {
        const comments = collectCommentTargets(payload);
        if (comments.length === 0) {
            return payload;
        }

        const cache = loadCommentTranslationCache();
        const groups = collectCommentTranslationGroups(comments, cache);
        if (googleTranslationEnabled) {
            for (const language of Object.keys(groups)) {
                try {
                    await translateCommentGroup(groups[language], language, cache);
                } catch (e) {
                    scriptContext.log(`Trakt comment translation failed for language=${language}: ${e}`);
                }
            }
            saveCommentTranslationCache(cache);
        }

        return payload;
    }

    async function handleRecentCommentsList() {
        const data = JSON.parse(body);
        if (isNotArray(data) || data.length === 0) {
            scriptContext.done({});
            return;
        }

        await Promise.all([
            translateMediaItemsInPlace(data, "recent comments"),
            translateCommentsInPlace(data)
        ]);
        scriptContext.doneJson(data);
    }

    async function handleComments() {
        const comments = JSON.parse(body);
        if (isNotArray(comments) || comments.length === 0) {
            scriptContext.done({});
            return;
        }

        await translateCommentsInPlace(comments);
        scriptContext.doneJson(comments);
    }

    return {
        handleComments,
        handleRecentCommentsList
    };
}

export {
    createCommentsTranslationHandlers,
    GOOGLE_TRANSLATE_BATCH_SIZE
};
