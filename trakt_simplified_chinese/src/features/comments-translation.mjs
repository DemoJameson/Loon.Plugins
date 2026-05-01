import * as googleTranslationPipeline from "../shared/google-translation-pipeline.mjs";
import * as mediaTranslationHelper from "../shared/trakt-translation-helper.mjs";
import * as cacheUtils from "../utils/cache.mjs";
import * as commonUtils from "../utils/common.mjs";

function isChineseLanguage(language) {
    const normalized = String(language ?? "")
        .trim()
        .toLowerCase();
    return normalized === "zh" || normalized.startsWith("zh-");
}

function shouldTranslateComment(comment) {
    return !!(commonUtils.isPlainObject(comment) && commonUtils.isNonNullish(comment.id) && typeof comment.comment === "string" && !isChineseLanguage(comment.language));
}

function collectCommentTargets(payload) {
    if (commonUtils.isNotArray(payload) || payload.length === 0) {
        return [];
    }

    const commentTargets = [];
    payload.forEach((item) => {
        if (commonUtils.isPlainObject(item?.comment)) {
            commentTargets.push(item.comment);
        } else if (commonUtils.isPlainObject(item) && commonUtils.isNonNullish(item.id) && typeof item.comment === "string") {
            commentTargets.push(item);
        }
    });
    return commentTargets;
}

async function translateCommentsInPlace(payload) {
    const context = globalThis.$ctx;
    const comments = collectCommentTargets(payload);
    if (comments.length === 0) {
        return payload;
    }

    const cache = cacheUtils.loadCommentTranslationCache(context.env);
    const targets = commonUtils
        .ensureArray(comments)
        .filter(shouldTranslateComment)
        .map((comment) => {
            const sourceText = String(comment.comment ?? "").trim();
            return {
                sourceLanguage: String(comment.language ?? "en").toLowerCase(),
                sourceText,
                getCachedTranslation() {
                    return cacheUtils.getHashedFieldTranslation(cache, comment.id, "comment", sourceText);
                },
                setCachedTranslation(translatedText) {
                    return cacheUtils.setHashedFieldTranslation(cache, comment.id, "comment", sourceText, translatedText);
                },
                applyTranslation(translatedText) {
                    comment.comment = translatedText;
                    return true;
                },
            };
        });

    const result = await googleTranslationPipeline.translateTextFieldTargets(targets, {
        googleTranslationEnabled: context.argument.googleTranslationEnabled,
        logFailure(language, error) {
            context.env.log(`Trakt comment translation failed for language=${language}: ${error}`);
        },
    });

    if (context.argument.googleTranslationEnabled && result.cacheChanged) {
        cacheUtils.saveCommentTranslationCache(context.env, cache);
    }

    return payload;
}

async function handleComments() {
    const comments = JSON.parse(globalThis.$ctx.responseBody);
    if (commonUtils.isNotArray(comments) || comments.length === 0) {
        return { type: "passThrough" };
    }

    await translateCommentsInPlace(comments);
    return {
        type: "respond",
        body: JSON.stringify(comments),
    };
}

async function handleRecentCommentsList() {
    const data = JSON.parse(globalThis.$ctx.responseBody);
    if (commonUtils.isNotArray(data) || data.length === 0) {
        return { type: "passThrough" };
    }

    await Promise.all([mediaTranslationHelper.translateMediaItemsInPlace(data), translateCommentsInPlace(data)]);

    return {
        type: "respond",
        body: JSON.stringify(data),
    };
}

export { handleComments, handleRecentCommentsList };
