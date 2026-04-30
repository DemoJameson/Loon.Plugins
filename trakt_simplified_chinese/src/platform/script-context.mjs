import { Env } from "../../../scripts/vendor/Env.module.mjs";

const TRAKT_SCRIPT_TITLE = "Trakt增强";

function createScriptContext(name = TRAKT_SCRIPT_TITLE) {
    const env = new Env(name);

    function getRequestHeaderValue(headerName) {
        if (!env.request?.headers || !headerName) {
            return null;
        }

        const normalizedHeaderName = String(headerName).toLowerCase();
        return env.request.headers[normalizedHeaderName] ?? null;
    }

    return {
        env,
        get request() {
            return env.request;
        },
        get response() {
            return env.response;
        },
        get argument() {
            return typeof $argument === "undefined" ? undefined : $argument;
        },
        get requestUrl() {
            return env.request?.url ?? "";
        },
        get responseBody() {
            return typeof env.response !== "undefined" && typeof env.response.body === "string"
                ? env.response.body
                : "";
        },
        getRequestHeaderValue,
        getUserAgent() {
            return String(getRequestHeaderValue("user-agent") ?? "").trim();
        },
        done(payload = {}) {
            env.done(payload);
        },
        doneBody(body) {
            env.done({ body: body });
        },
        doneJson(value) {
            env.done({ body: JSON.stringify(value) });
        },
        log(message) {
            env.log(message);
        }
    };
}

export {
    createScriptContext,
    TRAKT_SCRIPT_TITLE
};
