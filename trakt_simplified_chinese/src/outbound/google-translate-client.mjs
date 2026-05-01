import { decodeBase64Value, ensureArray, escapeQueryComponent } from "../utils/common.mjs";
import * as httpUtils from "../utils/http.mjs";

const GOOGLE_TRANSLATE_API_KEY = "QUl6YVN5QmNRak1SQTYyVGFYSm4xOXdiZExHNXJWUkJCaDJqbnVzQ2tzNzY=";
const GOOGLE_TRANSLATE_API_URL = "https://translation.googleapis.com/language/translate/v2";
const GOOGLE_TRANSLATE_TARGET_LANGUAGE = "zh-CN";
const GOOGLE_TRANSLATE_BATCH_SIZE = 128;

function getGoogleTranslateApiKey() {
    const decodedValue = decodeBase64Value(GOOGLE_TRANSLATE_API_KEY);
    return decodedValue.length > 5 ? decodedValue.slice(0, -5) : "";
}

function buildGoogleTranslateFormBody(apiKey, texts, sourceLanguage) {
    return [
        `key=${escapeQueryComponent(apiKey)}`,
        ...texts.map((text) => `q=${escapeQueryComponent(text)}`),
        `target=${escapeQueryComponent(GOOGLE_TRANSLATE_TARGET_LANGUAGE)}`,
        `source=${escapeQueryComponent(sourceLanguage)}`,
        "format=text",
        "model=base",
    ].join("&");
}

async function translateTextBatch(texts, sourceLanguage) {
    const response = await httpUtils.post({
        url: GOOGLE_TRANSLATE_API_URL,
        headers: {
            accept: "application/json",
            "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: buildGoogleTranslateFormBody(getGoogleTranslateApiKey(), texts, sourceLanguage),
    });
    const statusCode = httpUtils.getResponseStatusCode(response);
    if (statusCode < 200 || statusCode >= 300) {
        throw new Error(`HTTP ${statusCode} for ${GOOGLE_TRANSLATE_API_URL}`);
    }

    try {
        return JSON.parse(response.body);
    } catch (e) {
        throw new Error(`JSON parse failed for ${GOOGLE_TRANSLATE_API_URL}: ${e}`);
    }
}

function extractTranslatedTexts(payload, texts) {
    const translations = ensureArray(payload?.data?.translations);
    return texts.map((_, index) => String(translations[index]?.translatedText ?? ""));
}

async function translateTextsWithGoogle(texts, sourceLanguage) {
    const normalizedTexts = ensureArray(texts).map((item) => String(item ?? ""));
    if (normalizedTexts.length === 0) {
        return [];
    }

    const translatedTexts = [];
    for (let index = 0; index < normalizedTexts.length; index += GOOGLE_TRANSLATE_BATCH_SIZE) {
        const batch = normalizedTexts.slice(index, index + GOOGLE_TRANSLATE_BATCH_SIZE);
        const payload = await translateTextBatch(batch, sourceLanguage);
        translatedTexts.push(...extractTranslatedTexts(payload, batch));
    }

    return translatedTexts;
}

export { translateTextsWithGoogle };
