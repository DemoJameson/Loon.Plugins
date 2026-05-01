import * as googleTranslateClient from "../outbound/google-translate-client.mjs";
import * as commonUtils from "../utils/common.mjs";

function normalizeTranslation(value) {
    return String(value ?? "").trim();
}

async function translateTextFieldTargets(targets, options = {}) {
    const normalizedTargets = commonUtils.ensureArray(targets);
    const googleTranslationEnabled = options.googleTranslationEnabled !== false;
    const translateTexts = options.translateTexts || googleTranslateClient.translateTextsWithGoogle;
    const pendingByLanguage = {};
    let changed = false;
    let cacheChanged = false;
    let cacheHitCount = 0;
    let translatedCount = 0;

    normalizedTargets.forEach((target) => {
        if (!commonUtils.isPlainObject(target)) {
            return;
        }

        const sourceText = normalizeTranslation(target.sourceText);
        if (!sourceText) {
            return;
        }

        const cachedTranslation = typeof target.getCachedTranslation === "function" ? normalizeTranslation(target.getCachedTranslation(sourceText, target)) : "";
        if (cachedTranslation) {
            cacheHitCount += 1;
            if (typeof target.applyTranslation === "function") {
                changed =
                    target.applyTranslation(cachedTranslation, {
                        source: "cache",
                        sourceText,
                        target,
                    }) !== false || changed;
            }
            return;
        }

        if (!googleTranslationEnabled) {
            return;
        }

        const sourceLanguage =
            String(target.sourceLanguage ?? "en")
                .trim()
                .toLowerCase() || "en";
        if (!pendingByLanguage[sourceLanguage]) {
            pendingByLanguage[sourceLanguage] = [];
        }
        pendingByLanguage[sourceLanguage].push({ ...target, sourceText });
    });

    for (const language of Object.keys(pendingByLanguage)) {
        const languageTargets = pendingByLanguage[language];
        try {
            const sourceTexts = languageTargets.map((target) => target.sourceText);
            const translatedTexts = await translateTexts(sourceTexts, language);
            languageTargets.forEach((target, index) => {
                const translatedText = normalizeTranslation(translatedTexts[index]);
                if (!translatedText) {
                    return;
                }

                if (typeof target.shouldAcceptTranslation === "function" && !target.shouldAcceptTranslation(translatedText, target)) {
                    return;
                }

                if (typeof target.setCachedTranslation === "function") {
                    const targetCacheChanged = target.setCachedTranslation(translatedText, target);
                    cacheChanged = targetCacheChanged || cacheChanged;
                    changed = targetCacheChanged || changed;
                }
                if (typeof target.applyTranslation === "function") {
                    changed =
                        target.applyTranslation(translatedText, {
                            source: "google",
                            sourceText: target.sourceText,
                            target,
                        }) !== false || changed;
                }
                translatedCount += 1;
            });
        } catch (error) {
            if (typeof options.logFailure === "function") {
                options.logFailure(language, error);
            }
            if (options.throwOnFailure) {
                throw error;
            }
        }
    }

    return {
        cacheHitCount,
        cacheChanged,
        changed,
        pendingCount: Object.values(pendingByLanguage).reduce((count, group) => count + group.length, 0),
        translatedCount,
    };
}

export { translateTextFieldTargets };
