import {
    ensureArray,
    escapeQueryComponent
} from "../shared/common.mjs";

const GOOGLE_TRANSLATE_API_KEY = "QUl6YVN5QmNRak1SQTYyVGFYSm4xOXdiZExHNXJWUkJCaDJqbnVzQ2tzNzY=";
const GOOGLE_TRANSLATE_API_URL = "https://translation.googleapis.com/language/translate/v2";
const GOOGLE_TRANSLATE_TARGET_LANGUAGE = "zh-CN";

function createGoogleTranslateClient(options) {
    const {
        post,
        getResponseStatusCode,
        decodeBase64Value,
        batchSize
    } = options;

    function getGoogleTranslateApiKey() {
        const decodedValue = decodeBase64Value(GOOGLE_TRANSLATE_API_KEY);
        return decodedValue.length > 5 ? decodedValue.slice(0, -5) : "";
    }

    function buildGoogleTranslateFormBody(texts, sourceLanguage) {
        const apiKey = getGoogleTranslateApiKey();
        return [
            `key=${escapeQueryComponent(apiKey)}`,
            ...texts.map((text) => `q=${escapeQueryComponent(text)}`),
            `target=${escapeQueryComponent(GOOGLE_TRANSLATE_TARGET_LANGUAGE)}`,
            `source=${escapeQueryComponent(sourceLanguage)}`,
            "format=text",
            "model=base"
        ].join("&");
    }

    async function translateTextBatchWithGoogle(texts, sourceLanguage) {
        const response = await post({
            url: GOOGLE_TRANSLATE_API_URL,
            headers: {
                accept: "application/json",
                "content-type": "application/x-www-form-urlencoded;charset=UTF-8"
            },
            body: buildGoogleTranslateFormBody(texts, sourceLanguage)
        });
        const statusCode = getResponseStatusCode(response);
        if (statusCode < 200 || statusCode >= 300) {
            throw new Error(`HTTP ${statusCode} for ${GOOGLE_TRANSLATE_API_URL}`);
        }

        let payload;
        try {
            payload = JSON.parse(response.body);
        } catch (e) {
            throw new Error(`JSON parse failed for ${GOOGLE_TRANSLATE_API_URL}: ${e}`);
        }

        const translations = ensureArray(payload?.data?.translations);
        return texts.map((_, index) => String(translations[index]?.translatedText ?? ""));
    }

    async function translateTextsWithGoogle(texts, sourceLanguage) {
        const normalizedTexts = ensureArray(texts).map((item) => String(item ?? ""));
        if (normalizedTexts.length === 0) {
            return [];
        }

        const batches = [];
        for (let index = 0; index < normalizedTexts.length; index += batchSize) {
            batches.push(normalizedTexts.slice(index, index + batchSize));
        }

        const translatedBatches = await Promise.all(
            batches.map((batch) => translateTextBatchWithGoogle(batch, sourceLanguage))
        );

        return translatedBatches.flat();
    }

    return {
        translateTextsWithGoogle
    };
}

export {
    createGoogleTranslateClient
};
