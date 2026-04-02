/**
 * Emby TIDB Intro/Outro Chapters Injection
 * Intercepts Emby APIs and injects intro/credits markers from TheIntroDB
 * Compatible with Loon and Surge.
 */

const isLoon = typeof $loon !== "undefined";
const isSurge = typeof $httpClient !== "undefined" && !isLoon;

let args = {};
if (typeof $argument !== 'undefined') {
    let parts = $argument.split('&');
    if (parts.length === 1 && parts[0].includes(',')) parts = $argument.split(',');
    for (let kv of parts) {
        let [k, v] = kv.split('=');
        if (k && v) {
            args[k.trim()] = v.trim();
        }
    }
}

const TIDB_OVERRIDE_EXISTING = args.tidb_override_existing === 'true' || args.tidb_override_existing === '1';
const TIDB_MAX_EPISODES = parseInt(args.tidb_max_episodes) || 5;
const TIDB_API_KEY = args.tidb_api_key || '';
const TIDB_ENABLE_LOG = args.tidb_enable_log === 'true' || args.tidb_enable_log === '1';

function log(msg) {
    if (TIDB_ENABLE_LOG) {
        console.log("[TIDB-Emby] " + msg);
    }
}

let cacheApiBase = args.tidb_cache_api || 'https://loon-plugins.demojameson.de5.net';
if (cacheApiBase.endsWith('/')) cacheApiBase = cacheApiBase.slice(0, -1);
const TIDB_CACHE_API = cacheApiBase + '/api/tidb/media';

const ms1Month = 30 * 24 * 60 * 60 * 1000;
const ms30Min = 30 * 60 * 1000;

function httpRequest(options) {
    return new Promise((resolve, reject) => {
        const cb = (error, response, body) => {
            if (error) {
                reject(error);
            } else {
                resolve({
                    status: response.status || response.statusCode,
                    headers: response.headers,
                    body: body
                });
            }
        };
        if (options.method && options.method.toUpperCase() === 'POST') {
            $httpClient.post(options, cb);
        } else {
            $httpClient.get(options, cb);
        }
    });
}

const CACHE_STORE_KEY = "emby_tidb_chapters_cache_v1";
let _memCache = null;
let _cacheModified = false;

function loadCache() {
    if (_memCache !== null) return _memCache;
    let val = $persistentStore.read(CACHE_STORE_KEY);
    if (val) {
        try {
            _memCache = JSON.parse(val);
        } catch (e) {
            _memCache = {};
        }
    } else {
        _memCache = {};
    }

    let now = Date.now();
    let cleaned = false;
    for (let k in _memCache) {
        if (_memCache[k].expireAt && _memCache[k].expireAt < now) {
            delete _memCache[k];
            cleaned = true;
        }
    }
    if (cleaned) _cacheModified = true;

    return _memCache;
}

function saveCache() {
    if (_cacheModified && _memCache) {
        $persistentStore.write(JSON.stringify(_memCache), CACHE_STORE_KEY);
        _cacheModified = false;
    }
}

function getCache(key) {
    let store = loadCache();
    let val = store[key];
    if (val && val.expireAt > Date.now()) {
        return val.data;
    }
    return null;
}

function setCache(key, data, expireInMs) {
    let store = loadCache();
    store[key] = { data, expireAt: Date.now() + expireInMs };
    _cacheModified = true;
}

function getAuthHeaders() {
    let h = {};
    for (let [k, v] of Object.entries($request.headers)) {
        if (['x-emby-authorization', 'x-emby-token', 'authorization'].includes(k.toLowerCase())) {
            h[k] = v;
        }
    }
    return h;
}

function kvKey(tmdb, s, e) {
    return `tidb_ep_${tmdb}_${s}_${e}`;
}

async function fetchEmbyItem(itemId, userId, origin) {
    if (!userId) {
        log(`Warning: No userId provided for itemId=${itemId}.`);
    }
    let url = `${origin}/emby/Items/${itemId}?Fields=ProviderIds`;
    if (userId) {
        url = `${origin}/emby/Users/${userId}/Items/${itemId}?Fields=ProviderIds`;
    }
    try {
        let res = await httpRequest({
            url: url,
            headers: getAuthHeaders()
        });
        if (res.status === 200) {
            return JSON.parse(res.body);
        } else {
            log(`Emby Item Fetch Failed: HTTP ${res.status} for ${url}`);
        }
    } catch (e) {
        log(`Error fetching Emby item ${itemId}: ${e}`);
    }
    return null;
}

function extractUserId(url) {
    let parsedUrl = new URL(url);
    let uid = parsedUrl.searchParams.get('UserId');
    if (uid) return uid;

    let m = url.match(/\/Users\/([^/]+?)\//i);
    if (m) return m[1];

    if (typeof $request !== 'undefined' && $request.body) {
        try {
            let reqBody = JSON.parse($request.body);
            if (reqBody.UserId) return reqBody.UserId;
        } catch (e) { }
    }

    return null;
}

async function getTmdbId(seriesId, userId, host, origin) {
    let key = `tmdb_id_${host}_${seriesId}`;
    let c = getCache(key);
    if (c) {
        log(`Hit local cache for tmdbId: ${c}`);
        return c;
    }

    log(`Fetching tmdbId for seriesId: ${seriesId} from ${origin} (UserId: ${userId})`);
    let data = await fetchEmbyItem(seriesId, userId, origin);
    if (data) {
        let tmdb = data.ProviderIds && data.ProviderIds.Tmdb;
        if (tmdb) {
            setCache(key, tmdb, ms1Month);
            log(`Got tmdbId: ${tmdb}`);
            return tmdb;
        }
    }
    return null;
}

async function fetchTidbDirectAndCache(tmdbId, s, e) {
    let url = `https://api.theintrodb.org/v2/media?tmdb_id=${tmdbId}&season=${s}&episode=${e}`;
    log(`Fetching intro data from TheIntroDB: ${url}`);
    let headers = {};
    if (TIDB_API_KEY) {
        headers['Authorization'] = `Bearer ${TIDB_API_KEY}`;
    }

    let key = kvKey(tmdbId, s, e);

    try {
        let res = await httpRequest({ method: 'GET', url, headers });
        let hasData = false;
        let finalData = null;

        if (res.status === 200) {
            finalData = JSON.parse(res.body);
            hasData = true;
        } else if (res.status !== 404) {
            return null; // API Error
        }

        let expire = hasData ? ms1Month : ms30Min;
        setCache(key, { has_data: hasData, data: finalData }, expire);

        return { data: finalData, has_data: hasData };

    } catch (err) {
        return null;
    }
}

async function postBatchToVercel(tmdbId, batchAccumulator) {
    if (!TIDB_CACHE_API || Object.keys(batchAccumulator).length === 0) return;
    log(`Posting up batch data to Vercel for tmdb_id=${tmdbId}, seasons=[${Object.keys(batchAccumulator).join(',')}]`);
    for (let [s, eps] of Object.entries(batchAccumulator)) {
        if (eps.length > 0) {
            await httpRequest({
                method: 'POST',
                url: TIDB_CACHE_API,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tmdb_id: tmdbId,
                    season: s,
                    episodes: eps
                })
            }).catch(() => { });
        }
    }
}

async function getTidbDataForEpisode(tmdbId, s, e, fetchIfMissing, batchAccumulator) {
    let key = kvKey(tmdbId, s, e);

    let c = getCache(key);
    if (c !== null) {
        return c.has_data ? c.data : null;
    }

    if (fetchIfMissing) {
        let fData = await fetchTidbDirectAndCache(tmdbId, s, e);
        if (fData) {
            if (batchAccumulator) {
                if (!batchAccumulator[s]) batchAccumulator[s] = [];
                batchAccumulator[s].push({ episode: e, data: fData.data, has_data: fData.has_data });
            }
            return fData.data;
        }
    }
    return null;
}

function injectChaptersFunc(chapters, tidbData) {
    let newChapters = [];
    let _chapters = Array.isArray(chapters) ? chapters : [];

    let tidbIntro = tidbData && tidbData.intro && tidbData.intro.length > 0 ? tidbData.intro[0] : null;
    let tidbCredits = tidbData && tidbData.credits && tidbData.credits.length > 0 ? tidbData.credits[0] : null;

    let embyHasIntro = false;
    let embyHasCredits = false;

    for (let ch of _chapters) {
        let name = (ch.Name || '').toLowerCase();
        let mType = ch.MarkerType || ch.Type || '';
        let isIntro = ['introstart', 'introend'].includes(mType.toLowerCase()) || name === 'intro' || name === 'op' || name.includes('intro');
        let isCredits = ['creditsstart'].includes(mType.toLowerCase()) || name === 'credits' || name === 'ed' || name.includes('credit');

        if (isIntro) embyHasIntro = true;
        if (isCredits) embyHasCredits = true;
    }

    let useTidbIntro = false;
    let useTidbCredits = false;

    if (TIDB_OVERRIDE_EXISTING) {
        if (tidbIntro && tidbIntro.end_ms > 0) useTidbIntro = true;
        if (tidbCredits && tidbCredits.start_ms !== null) useTidbCredits = true;
    } else {
        if (tidbIntro && tidbIntro.end_ms > 0 && !embyHasIntro) useTidbIntro = true;
        if (tidbCredits && tidbCredits.start_ms !== null && !embyHasCredits) useTidbCredits = true;
    }

    let finalIntroStart = useTidbIntro && tidbIntro.start_ms !== null ? tidbIntro.start_ms * 10000 : 0;
    let finalIntroEnd = useTidbIntro && tidbIntro.end_ms > 0 ? tidbIntro.end_ms * 10000 : -1;
    let finalCreditsStart = useTidbCredits && tidbCredits.start_ms !== null ? tidbCredits.start_ms * 10000 : -1;

    for (let ch of _chapters) {
        let name = (ch.Name || '').toLowerCase();
        let mType = ch.MarkerType || ch.Type || '';
        let isIntro = ['introstart', 'introend'].includes(mType.toLowerCase()) || name === 'intro' || name === 'op' || name.includes('intro');
        let isCredits = ['creditsstart'].includes(mType.toLowerCase()) || name === 'credits' || name === 'ed' || name.includes('credit');

        // If TIDB is actively supplying this segment, drop Emby's native markers
        if (useTidbIntro && isIntro) continue;
        if (useTidbCredits && isCredits) continue;

        let conflict = false;
        let pos = ch.StartPositionTicks || 0;

        // Uniformly delete any generic chapters that fall directly inside active TIDB zones
        if (finalIntroEnd !== -1 && pos > finalIntroStart && pos < finalIntroEnd) conflict = true;
        if (finalCreditsStart !== -1 && pos > finalCreditsStart) conflict = true;

        if (!conflict) {
            newChapters.push(ch);
        }
    }

    if (finalIntroEnd !== -1) {
        newChapters.push({ StartPositionTicks: finalIntroStart, Name: "IntroStart", Type: "IntroStart", MarkerType: "IntroStart" });
        newChapters.push({ StartPositionTicks: finalIntroEnd, Name: "IntroEnd", Type: "IntroEnd", MarkerType: "IntroEnd" });
    }

    if (finalCreditsStart !== -1) {
        newChapters.push({ StartPositionTicks: finalCreditsStart, Name: "CreditsStart", Type: "CreditsStart", MarkerType: "CreditsStart" });
    }

    newChapters.sort((a, b) => a.StartPositionTicks - b.StartPositionTicks);
    return newChapters;
}

async function handleSingleItem(url, body) {
    log(`[Phase: SingleItem] Handling URL: ${url}`);
    let itemId = "";
    let isPlayback = false;

    let matchPlayback = url.match(/\/Items\/(.+)\/PlaybackInfo/);
    let matchUsers = url.match(/\/Users\/(.+)\/Items\/(.+)/);

    if (matchPlayback) {
        itemId = matchPlayback[1].split('?')[0];
        isPlayback = true;
    } else if (matchUsers) {
        itemId = matchUsers[2].split('?')[0];
    } else {
        let m = url.match(/\/Items\/(.+)/);
        if (m) itemId = m[1].split('?')[0];
    }

    if (!itemId) return;

    let seriesId, season, episode;
    let parsedUrl = new URL(url);
    let host = parsedUrl.host;
    let origin = parsedUrl.origin;
    let userId = extractUserId(url);

    if (isPlayback) {
        let meta = getCache(`emby_item_${host}_${itemId}`);
        if (meta) {
            if (meta.Type && meta.Type !== 'Episode') return;
            seriesId = meta.SeriesId;
            season = meta.ParentIndexNumber;
            episode = meta.IndexNumber;
        } else {
            let itemData = await fetchEmbyItem(itemId, userId, origin);
            if (itemData) {
                seriesId = itemData.SeriesId;
                season = itemData.ParentIndexNumber;
                episode = itemData.IndexNumber;

                setCache(`emby_item_${host}_${itemId}`, {
                    Type: itemData.Type,
                    SeriesId: seriesId,
                    ParentIndexNumber: season,
                    IndexNumber: episode
                }, ms1Month);

                if (itemData.Type && itemData.Type !== 'Episode') return;
            } else {
                return;
            }
        }
    } else {
        if (body.Type !== 'Episode') {
            setCache(`emby_item_${host}_${itemId}`, { Type: body.Type }, ms1Month);
            return;
        }
        seriesId = body.SeriesId;
        season = body.ParentIndexNumber;
        episode = body.IndexNumber;

        setCache(`emby_item_${host}_${itemId}`, {
            Type: body.Type,
            SeriesId: seriesId,
            ParentIndexNumber: season,
            IndexNumber: episode
        }, ms1Month);
    }

    if (!seriesId || season === undefined || episode === undefined) return;

    let tmdbId = await getTmdbId(seriesId, userId, host, origin);
    if (!tmdbId) return;

    let eKey = kvKey(tmdbId, season, episode);
    let c = getCache(eKey);
    let tidbData = null;

    if (c !== null) {
        tidbData = c.has_data ? c.data : null;
    } else {
        if (TIDB_CACHE_API) {
            try {
                let v_res = await httpRequest({
                    method: 'GET',
                    url: `${TIDB_CACHE_API}?tmdb_id=${tmdbId}&season=${season}`
                });
                if (v_res.status === 200) {
                    let seasonData = JSON.parse(v_res.body);
                    for (let [epStr, epData] of Object.entries(seasonData)) {
                        let k = kvKey(tmdbId, season, epStr);
                        let hasD = epData !== null && typeof epData === 'object';
                        setCache(k, { has_data: hasD, data: epData }, ms1Month);
                    }
                }
            } catch (e) { }
        }

        let batch = {};
        tidbData = await getTidbDataForEpisode(tmdbId, season, episode, true, batch);
        await postBatchToVercel(tmdbId, batch);
    }

    if (tidbData) {
        body.Chapters = injectChaptersFunc(body.Chapters || [], tidbData);
        if (isPlayback && Array.isArray(body.MediaSources)) {
            body.MediaSources.forEach(src => {
                src.Chapters = injectChaptersFunc(src.Chapters || [], tidbData);
            });
        }
    }
}

async function handleEpisodes(url, body) {
    log(`[Phase: Episodes] Handling URL: ${url}`);
    if (!body.Items || body.Items.length === 0) {
        log(`No items found in body, returning empty.`);
        return;
    }

    let seriesId = body.Items[0].SeriesId;
    if (!seriesId) {
        let m = url.match(/\/Shows\/(.+)\/Episodes/);
        if (m) seriesId = m[1].split('?')[0];
    }
    if (!seriesId) return;

    let parsedUrl = new URL(url);
    let host = parsedUrl.host;
    let origin = parsedUrl.origin;
    let userId = extractUserId(url);

    let tmdbId = await getTmdbId(seriesId, userId, host, origin);
    if (!tmdbId) return;

    let targetItems = body.Items.filter(i => i.Type === 'Episode');

    let missingItems = [];
    let batch = {};

    // Phase 1: Pure Local Cache Verification
    for (let item of targetItems) {
        if (item.Id && (item.SeriesId || seriesId) && item.IndexNumber !== undefined) {
            setCache(`emby_item_${host}_${item.Id}`, {
                Type: item.Type,
                SeriesId: item.SeriesId || seriesId,
                ParentIndexNumber: item.ParentIndexNumber,
                IndexNumber: item.IndexNumber
            }, ms1Month);
        }

        let eKey = kvKey(tmdbId, item.ParentIndexNumber, item.IndexNumber);
        let c = getCache(eKey);
        if (c !== null) {
            item._tidbData = c.has_data ? c.data : null;
        } else {
            missingItems.push(item);
        }
    }

    // Phase 1.5: If still missing locally, query Vercel for those specific seasons
    if (missingItems.length > 0 && TIDB_CACHE_API) {
        let s = missingItems[0].ParentIndexNumber;
        try {
            let v_res = await httpRequest({
                method: 'GET',
                url: `${TIDB_CACHE_API}?tmdb_id=${tmdbId}&season=${s}`
            });
            if (v_res.status === 200) {
                let seasonData = JSON.parse(v_res.body);
                for (let [epStr, epData] of Object.entries(seasonData)) {
                    let eKey = kvKey(tmdbId, s, epStr);
                    let hasD = epData !== null && typeof epData === 'object';
                    setCache(eKey, { has_data: hasD, data: epData }, ms1Month);
                }
            }
        } catch (e) { }
    }

    // Phase 1.6: Re-evaluate missing items now that Vercel might have fulfilled them
    missingItems = missingItems.filter(item => {
        let eKey = kvKey(tmdbId, item.ParentIndexNumber, item.IndexNumber);
        let c = getCache(eKey);
        if (c !== null) {
            item._tidbData = c.has_data ? c.data : null;
            return false;
        }
        return true;
    });

    let nextUpSeason = 1;
    let nextUpEp = 1;

    // Phase 2: Only Hit NextUp if Vercel failed to fill the gap
    if (missingItems.length > 0) {
        let nextUpUrl = `${origin}/emby/Shows/NextUp?SeriesId=${seriesId}&Limit=1&EnableTotalRecordCount=false`;
        if (userId) nextUpUrl += `&UserId=${userId}`;
        let nextUpRes = await httpRequest({
            url: nextUpUrl,
            headers: getAuthHeaders()
        });
        if (nextUpRes.status === 200) {
            let nData = JSON.parse(nextUpRes.body);
            if (nData.Items && nData.Items.length > 0) {
                nextUpSeason = nData.Items[0].ParentIndexNumber || 1;
                nextUpEp = nData.Items[0].IndexNumber || 1;
            }
        }
    }

    missingItems.sort((a, b) => (parseInt(a.ParentIndexNumber) || 0) - (parseInt(b.ParentIndexNumber) || 0) || (parseInt(a.IndexNumber) || 0) - (parseInt(b.IndexNumber) || 0));

    let nextUpIndex = missingItems.length > 0 ? missingItems.findIndex(i => i.ParentIndexNumber === nextUpSeason && i.IndexNumber === nextUpEp) : 0;
    if (nextUpIndex === -1) nextUpIndex = 0;

    let needFetchCount = 0;

    // Phase 3: Fill in the remaining missing items sequentially starting from NextUp
    for (let startIdx of [nextUpIndex, 0]) {
        for (let i = startIdx; i < missingItems.length; i++) {
            let item = missingItems[i];

            if (item._checked) continue;
            item._checked = true;

            // These are genuinely missing from all caches, attempt to fetch from target origin API
            if (needFetchCount < TIDB_MAX_EPISODES) {
                let f = await fetchTidbDirectAndCache(tmdbId, item.ParentIndexNumber, item.IndexNumber);
                if (f) {
                    item._tidbData = f.data;
                    if (!batch[item.ParentIndexNumber]) batch[item.ParentIndexNumber] = [];
                    batch[item.ParentIndexNumber].push({ episode: item.IndexNumber, data: f.data, has_data: f.has_data });
                }
                needFetchCount++;
            }
        }
        if (needFetchCount >= TIDB_MAX_EPISODES) break;
    }

    // Phase 4: Data Integration for all targets
    for (let item of targetItems) {
        if (item._tidbData) {
            item.Chapters = injectChaptersFunc(item.Chapters || [], item._tidbData);
        }
        delete item._tidbData;
        delete item._checked;
    }

    await postBatchToVercel(tmdbId, batch);
}

async function run() {
    let url = $request.url;
    log(`[Init] Script invoked for URL: ${url}`);
    let body;

    try {
        body = JSON.parse($response.body);
    } catch (e) {
        return $done({});
    }

    try {
        if (url.match(/\/Shows\/.+\/Episodes/)) {
            await handleEpisodes(url, body);
        } else if (url.match(/\/Users\/.+\/Items\/.+/) || url.match(/\/Items\/.+\/PlaybackInfo/)) {
            await handleSingleItem(url, body);
        }
    } catch (e) {
        console.log("Error processing TIDB Request: " + e);
        // Fail silently
    }

    // Write all accumulated cache data into the single PersistentStore key
    saveCache();

    $done({ body: JSON.stringify(body) });
}

// Start execution
run().catch(err => {
    console.log("Fatal Error: " + err);
    saveCache();
    $done({});
});
