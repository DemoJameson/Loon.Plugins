const CACHE_STORE_KEY = "emby_tidb_chapters_cache_v1";
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
        notify("Clear Cache Failed", "PersistentStore is unavailable in the current environment.");
        done({});
    } else {
        const previous = $persistentStore.read(CACHE_STORE_KEY);
        const removed = $persistentStore.write("", CACHE_STORE_KEY);
        if (removed) {
            const detail = previous ? "Local TiDB cache cleared." : "Local TiDB cache was already empty.";
            notify("Cache Cleared", detail);
        } else {
            notify("Clear Cache Failed", "PersistentStore.write returned false.");
        }
        done({});
    }
} catch (error) {
    notify("Clear Cache Failed", String(error));
    done({});
}
