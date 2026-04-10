const TITLE = "优化Trakt简体中文体验";
const TRANSLATION_CACHE_KEYS = Array.from({ length: 9 }, (_, index) => "trakt_zh_cn_cache_v" + (index + 1));
const CURRENT_SEASON_CACHE_KEY = "trakt_current_season";
const HISTORY_EPISODE_CACHE_KEY = "trakt_history_episode_cache";
const LINK_IDS_CACHE_KEY = "trakt_watchnow_ids_cache";

function clearPersistentValue(key) {
    if (typeof $persistentStore === "undefined") {
        return false;
    }

    try {
        $persistentStore.write("", key);
        return true;
    } catch (e) {
        console.log("Trakt clear cache failed for key=" + key + ": " + e);
        return false;
    }
}

function postNotification(title, subtitle, message) {
    if (typeof $notification === "undefined" || typeof $notification.post !== "function") {
        return;
    }

    $notification.post(title, subtitle, message);
}

(function () {
    const cleared = [
        ...TRANSLATION_CACHE_KEYS.map((key) => clearPersistentValue(key)),
        clearPersistentValue(HISTORY_EPISODE_CACHE_KEY),
        clearPersistentValue(CURRENT_SEASON_CACHE_KEY),
        clearPersistentValue(LINK_IDS_CACHE_KEY)
    ].every(Boolean);

    if (cleared) {
        postNotification(
            TITLE,
            "本地缓存已清除",
            ""
        );
    } else {
        postNotification(
            TITLE,
            "本地缓存清除失败",
            ""
        );
    }

    $done({});
})();
