import { Env } from "../../scripts/vendor/Env.module.mjs";

const TITLE = "Trakt增强";
const $ = new Env(TITLE);

(function () {
    const cleared = $.setdata(null, "dj_trakt_unified_cache");

    if (cleared) {
        $.msg(TITLE, "本地缓存已清除", "");
    } else {
        $.msg(TITLE, "本地缓存清除失败", "");
    }

    $.done({});
})();
