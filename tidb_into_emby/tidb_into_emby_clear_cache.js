const CACHE_STORE_KEY = "emby_TIDB_chapters_cache_v1";
const TITLE = "TIDB into Emby";

function notify(subtitle, message) {
    if (typeof $notification !== "undefined") {
        $notification.post(TITLE, subtitle, message);
    }
}

function done(result) {
    if (typeof $done === "function") {
        $done(result || {});
    }
}

try {
    if (typeof $persistentStore === "undefined") {
        notify("清除失败", "当前环境不支持 PersistentStore。");
        done({});
    } else {
        const previous = $persistentStore.read(CACHE_STORE_KEY);
        const removed = $persistentStore.write("", CACHE_STORE_KEY);
        if (removed) {
            const detail = previous ? "本地 TIDB 缓存已清除。" : "本地 TIDB 缓存本来就是空的。";
            notify("清除完成", detail);
        } else {
            notify("清除失败", "PersistentStore.write 返回 false。");
        }
        done({});
    }
} catch (error) {
    notify("清除失败", String(error));
    done({});
}
