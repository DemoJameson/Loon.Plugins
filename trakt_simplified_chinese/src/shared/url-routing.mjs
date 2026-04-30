import { URL } from "@nsnanocat/url";

function parseUrl(url) {
    try {
        return new URL(String(url ?? ""));
    } catch (e) {
        return null;
    }
}

function normalizeUrlPath(url) {
    const pathname = String(parseUrl(url)?.pathname ?? "");
    if (!pathname || pathname === "/") {
        return pathname || "/";
    }

    return pathname.replace(/\/+$/, "") || "/";
}

function isUrlFromHost(url, expectedHost) {
    return getUrlHost(url) === String(expectedHost ?? "").toLowerCase();
}

function getUrlHost(url) {
    return String(parseUrl(url)?.hostname ?? "").toLowerCase();
}

export {
    getUrlHost,
    isUrlFromHost,
    normalizeUrlPath,
    parseUrl
};
