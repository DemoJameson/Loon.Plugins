import {
    containsChineseCharacter,
    isNotArray,
    isPlainObject
} from "../../shared/common.mjs";
import {
    getHashedFieldTranslation,
    setHashedFieldTranslation
} from "../../shared/text-translation-cache.mjs";

function createListsTranslationHandlers(deps) {
    const {
        scriptContext,
        body,
        googleTranslationEnabled,
        loadListTranslationCache,
        saveListTranslationCache,
        translateTextsWithGoogle
    } = deps;

    function collectListTextTargets(data) {
        if (isNotArray(data)) {
            return [];
        }

        return data.reduce((targets, item) => {
            if (isPlainObject(item?.list)) {
                targets.push(item.list);
            } else if (isPlainObject(item)) {
                targets.push(item);
            }
            return targets;
        }, []);
    }

    function collectListTextTranslationGroups(lists, cache) {
        const groups = {};
        collectListTextTargets(lists).forEach((item) => {
            const listId = item?.ids?.trakt ?? null;
            const queueFieldTranslation = (field, sourceText) => {
                const normalizedSourceText = String(sourceText ?? "").trim();
                if (!normalizedSourceText || containsChineseCharacter(normalizedSourceText)) {
                    return;
                }

                const cachedTranslation = getHashedFieldTranslation(cache, listId, field, normalizedSourceText);
                if (cachedTranslation) {
                    item[field] = cachedTranslation;
                    return;
                }

                if (!groups.en) {
                    groups.en = [];
                }
                groups.en.push({
                    target: item,
                    listId,
                    field,
                    sourceText: normalizedSourceText
                });
            };

            queueFieldTranslation("name", item?.name);
            queueFieldTranslation("description", item?.description);
        });
        return groups;
    }

    async function translateListTextGroup(items, sourceLanguage, cache) {
        const sourceTexts = items.map((item) => item.sourceText);
        const translatedTexts = await translateTextsWithGoogle(sourceTexts, sourceLanguage);
        items.forEach((item, index) => {
            const translatedText = String(translatedTexts[index] ?? "").trim();
            if (!translatedText) {
                return;
            }
            setHashedFieldTranslation(cache, item.listId, item.field, sourceTexts[index], translatedText);
            item.target[item.field] = translatedText;
        });
    }

    async function handleList() {
        const lists = JSON.parse(body);
        if (isNotArray(lists) || lists.length === 0) {
            scriptContext.done({});
            return;
        }

        const cache = loadListTranslationCache();
        const groups = collectListTextTranslationGroups(lists, cache);
        if (googleTranslationEnabled) {
            for (const language of Object.keys(groups)) {
                try {
                    await translateListTextGroup(groups[language], language, cache);
                } catch (e) {
                    scriptContext.log(`Trakt list description translation failed for language=${language}: ${e}`);
                }
            }
        }

        saveListTranslationCache(cache);
        scriptContext.doneJson(lists);
    }

    return {
        handleList
    };
}

export {
    createListsTranslationHandlers
};
