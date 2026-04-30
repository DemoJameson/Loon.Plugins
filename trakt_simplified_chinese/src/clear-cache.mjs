import {
    createScriptContext,
    TRAKT_SCRIPT_TITLE
} from "./platform/script-context.mjs";

const scriptContext = createScriptContext();
const $ = scriptContext.env;

(function () {
    const cleared = $.setdata(null, "dj_trakt_unified_cache");

    if (cleared) {
        $.msg(TRAKT_SCRIPT_TITLE, "本地缓存已清除", "");
    } else {
        $.msg(TRAKT_SCRIPT_TITLE, "本地缓存清除失败", "");
    }

    $.done({});
})();
