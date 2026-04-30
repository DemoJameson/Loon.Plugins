import { isNonNullish, isPlainObject } from "../shared/common.mjs";

function createHttpClient(scriptContext) {
    function get(request) {
        return scriptContext.env.http.get(request);
    }

    function post(request) {
        return scriptContext.env.http.post(request);
    }

    function buildRequestHeaders(extraHeaders, useSourceHeaders) {
        const headers = {};
        const sourceHeaders = scriptContext.request?.headers ?? {};

        if (useSourceHeaders !== false) {
            Object.keys(sourceHeaders).forEach((key) => {
                if (key === "host" || key === "content-length" || key === ":authority") {
                    return;
                }
                headers[key] = sourceHeaders[key];
            });
        }

        headers.accept = "application/json";

        if (isPlainObject(extraHeaders)) {
            Object.keys(extraHeaders).forEach((key) => {
                if (isNonNullish(extraHeaders[key]) && extraHeaders[key] !== "") {
                    headers[key] = extraHeaders[key];
                }
            });
        }

        return headers;
    }

    function getResponseStatusCode(response) {
        return Number(response?.status || 0);
    }

    function fetchJson(url, extraHeaders, useSourceHeaders) {
        return get({
            url: url,
            headers: buildRequestHeaders(extraHeaders, useSourceHeaders)
        }).then((response) => {
            const statusCode = getResponseStatusCode(response);
            if (statusCode < 200 || statusCode >= 300) {
                throw new Error(`HTTP ${statusCode} for ${url}`);
            }

            try {
                return JSON.parse(response.body);
            } catch (e) {
                throw new Error(`JSON parse failed for ${url}: ${e}`);
            }
        });
    }

    function getRequestHeaderValue(headerName) {
        if (!scriptContext.request?.headers || !headerName) {
            return null;
        }

        const headers = scriptContext.request.headers;
        return headers[String(headerName).toLowerCase()] ?? null;
    }

    function postJson(url, payload, extraHeaders, useSourceHeaders) {
        return post({
            url: url,
            headers: buildRequestHeaders(extraHeaders, useSourceHeaders),
            body: JSON.stringify(payload)
        }).then((response) => {
            const statusCode = getResponseStatusCode(response);
            if (statusCode < 200 || statusCode >= 300) {
                throw new Error(`HTTP ${statusCode} for ${url}`);
            }

            if (!response.body) {
                return {};
            }

            try {
                return JSON.parse(response.body);
            } catch (e) {
                throw new Error(`JSON parse failed for ${url}: ${e}`);
            }
        });
    }

    return {
        buildRequestHeaders,
        fetchJson,
        get,
        getRequestHeaderValue,
        getResponseStatusCode,
        post,
        postJson
    };
}

export {
    createHttpClient
};
