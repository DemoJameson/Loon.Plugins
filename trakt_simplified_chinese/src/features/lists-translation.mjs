import * as googleTranslationPipeline from "../shared/google-translation-pipeline.mjs";
import * as cacheUtils from "../utils/cache.mjs";
import * as commonUtils from "../utils/common.mjs";

async function handleList() {
    const context = globalThis.$ctx;
    const lists = JSON.parse(context.responseBody);
    if (commonUtils.isNotArray(lists) || lists.length === 0) {
        return { type: "passThrough" };
    }

    const cache = cacheUtils.loadListTranslationCache(context.env);
    const targets = [];
    lists.forEach((item) => {
        const target = commonUtils.isPlainObject(item?.list) ? item.list : commonUtils.isPlainObject(item) ? item : null;
        if (!target) {
            return;
        }

        const listId = target?.ids?.trakt ?? null;
        ["name", "description"].forEach((field) => {
            const sourceText = String(target?.[field] ?? "").trim();
            if (!sourceText || commonUtils.containsChineseCharacter(sourceText)) {
                return;
            }

            targets.push({
                sourceLanguage: "en",
                sourceText,
                getCachedTranslation() {
                    return cacheUtils.getHashedFieldTranslation(cache, listId, field, sourceText);
                },
                setCachedTranslation(translatedText) {
                    return cacheUtils.setHashedFieldTranslation(cache, listId, field, sourceText, translatedText);
                },
                applyTranslation(translatedText) {
                    target[field] = translatedText;
                    return true;
                },
            });
        });
    });

    const result = await googleTranslationPipeline.translateTextFieldTargets(targets, {
        googleTranslationEnabled: context.argument.googleTranslationEnabled,
        logFailure(language, error) {
            context.env.log(`Trakt list description translation failed for language=${language}: ${error}`);
        },
    });

    if (result.cacheChanged) {
        cacheUtils.saveListTranslationCache(context.env, cache);
    }
    return {
        type: "respond",
        body: JSON.stringify(lists),
    };
}

export { handleList };
