import { Env } from "../../../scripts/vendor/Env.module.mjs";

function createScriptContext(name) {
    const env = new Env(name);

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
    createScriptContext
};
