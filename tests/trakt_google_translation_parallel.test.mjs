import assert from "node:assert/strict";
import test from "node:test";

import { translateTextsWithGoogle } from "../trakt_simplified_chinese/src/outbound/google-translate-client.mjs";
import { translateTextFieldTargets } from "../trakt_simplified_chinese/src/shared/google-translation-pipeline.mjs";

function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((promiseResolve, promiseReject) => {
        resolve = promiseResolve;
        reject = promiseReject;
    });
    return { promise, resolve, reject };
}

function createGoogleTranslatePayload(texts) {
    return JSON.stringify({
        data: {
            translations: texts.map((text) => ({ translatedText: `译:${text}` })),
        },
    });
}

function countQueryValues(body, key) {
    return new URLSearchParams(body).getAll(key);
}

test("Google 翻译超过单批上限时并行发起所有分批请求", async () => {
    const originalContext = globalThis.$ctx;
    const deferredResponses = [createDeferred(), createDeferred()];
    const posts = [];

    globalThis.$ctx = {
        env: {
            http: {
                post(options) {
                    const deferred = deferredResponses[posts.length];
                    posts.push(options);
                    return deferred.promise;
                },
            },
        },
    };

    try {
        const texts = Array.from({ length: 129 }, (_, index) => `text-${index}`);
        const translationPromise = translateTextsWithGoogle(texts, "en");
        await Promise.resolve();

        assert.equal(posts.length, 2);

        const firstBatchTexts = countQueryValues(posts[0].body, "q");
        const secondBatchTexts = countQueryValues(posts[1].body, "q");
        assert.equal(firstBatchTexts.length, 128);
        assert.equal(secondBatchTexts.length, 1);

        deferredResponses[1].resolve({ status: 200, body: createGoogleTranslatePayload(secondBatchTexts) });
        deferredResponses[0].resolve({ status: 200, body: createGoogleTranslatePayload(firstBatchTexts) });

        const translatedTexts = await translationPromise;
        assert.equal(translatedTexts.length, 129);
        assert.equal(translatedTexts[0], "译:text-0");
        assert.equal(translatedTexts[128], "译:text-128");
    } finally {
        globalThis.$ctx = originalContext;
    }
});

test("Google 翻译 pipeline 对不同源语言分组并行请求", async () => {
    const deferredByLanguage = {
        en: createDeferred(),
        fr: createDeferred(),
    };
    const startedLanguages = [];
    const appliedTranslations = [];

    const targets = [
        {
            sourceLanguage: "en",
            sourceText: "hello",
            applyTranslation(translatedText) {
                appliedTranslations.push(translatedText);
            },
        },
        {
            sourceLanguage: "fr",
            sourceText: "bonjour",
            applyTranslation(translatedText) {
                appliedTranslations.push(translatedText);
            },
        },
    ];

    const resultPromise = translateTextFieldTargets(targets, {
        translateTexts(sourceTexts, language) {
            startedLanguages.push(language);
            return deferredByLanguage[language].promise.then(() => sourceTexts.map((text) => `${language}:${text}`));
        },
    });
    await Promise.resolve();

    assert.deepEqual(startedLanguages, ["en", "fr"]);

    deferredByLanguage.fr.resolve();
    deferredByLanguage.en.resolve();

    const result = await resultPromise;
    assert.deepEqual(appliedTranslations, ["en:hello", "fr:bonjour"]);
    assert.equal(result.translatedCount, 2);
});
