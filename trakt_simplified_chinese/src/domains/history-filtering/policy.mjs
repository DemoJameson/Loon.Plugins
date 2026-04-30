function createHistoryPolicyService(deps) {
    const {
        scriptContext,
        latestHistoryEpisodeOnly,
        getRequestHeaderValue,
        normalizeUrlPath,
        loadHistoryEpisodeCache,
        saveHistoryEpisodeCache,
        isHistoryEpisodesListUrl,
        keepLatestHistoryEpisodes,
        filterHistoryEpisodesAcrossPagesWithCache,
        buildHistoryEpisodesRequestUrlWithMinimumLimit,
        buildRipppleHistoryRequestUrlWithMinimumLimit
    } = deps;

    function isBrowserUserAgent() {
        const userAgent = String(getRequestHeaderValue("user-agent") ?? "").trim();
        return !!userAgent && /(mozilla\/5\.0|applewebkit\/|chrome\/|safari\/|firefox\/|edg\/)/i.test(userAgent);
    }

    function isRipppleUserAgent() {
        return /^Rippple/i.test(String(getRequestHeaderValue("user-agent") ?? "").trim());
    }

    function shouldApplyLatestHistoryEpisodeOnly(url) {
        return latestHistoryEpisodeOnly && !isBrowserUserAgent() && isHistoryEpisodesListUrl(url);
    }

    function isRipppleHistoryListUrl(url) {
        return /^\/users\/[^/]+\/history$/.test(normalizeUrlPath(url));
    }

    function shouldApplyRipppleHistoryLimit(url) {
        return isRipppleUserAgent() && isRipppleHistoryListUrl(url);
    }

    function buildHistoryEpisodesRequestUrl(url) {
        return buildHistoryEpisodesRequestUrlWithMinimumLimit(url, shouldApplyLatestHistoryEpisodeOnly(url));
    }

    function buildRipppleHistoryRequestUrl(url) {
        return buildRipppleHistoryRequestUrlWithMinimumLimit(url, shouldApplyRipppleHistoryLimit(url));
    }

    function filterHistoryEpisodesAcrossPagesWithPersistence(arr, url) {
        const result = filterHistoryEpisodesAcrossPagesWithCache(arr, url, loadHistoryEpisodeCache());
        if (result?.cache && result?.filtered) {
            saveHistoryEpisodeCache(result.cache);
            return result.filtered;
        }
        return arr;
    }

    function processHistoryEpisodeListBody(sourceBody, url) {
        if (!shouldApplyLatestHistoryEpisodeOnly(url)) {
            return sourceBody;
        }

        try {
            return JSON.stringify(filterHistoryEpisodesAcrossPagesWithPersistence(
                keepLatestHistoryEpisodes(JSON.parse(sourceBody)),
                url
            ));
        } catch (e) {
            scriptContext.log(`Trakt history episode local merge failed: ${e}`);
            return sourceBody;
        }
    }

    return {
        buildHistoryEpisodesRequestUrl,
        buildRipppleHistoryRequestUrl,
        processHistoryEpisodeListBody,
        shouldApplyLatestHistoryEpisodeOnly,
        shouldApplyRipppleHistoryLimit
    };
}

export {
    createHistoryPolicyService
};
