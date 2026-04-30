import { MEDIA_TYPE } from "../../shared/media-types.mjs";
import {
    computeStringHash,
    containsChineseCharacter,
    ensureArray,
    ensureObject,
    isNonNullish,
    isNullish,
    isPlainObject
} from "../../shared/common.mjs";

const PEOPLE_NAME_SOURCE = {
    TMDB: "tmdb",
    GOOGLE: "google"
};
const PEOPLE_LIST_ORIGINAL_NAME_KEY = "__traktOriginalName";

function createPeopleHandlers(deps) {
    const {
        scriptContext,
        requestUrl,
        body,
        googleTranslationEnabled,
        loadPeopleTranslationCache,
        savePeopleTranslationCache,
        loadLinkIdsCache,
        translateTextsWithGoogle,
        translateMediaItemsInPlace,
        normalizeUrlPath,
        ensureMediaIdsCacheEntry,
        fetchTmdbCredits,
        fetchTmdbPerson
    } = deps;

    function isRipppleUserAgent() {
        return /^Rippple/i.test(scriptContext.getUserAgent());
    }

    function getPeopleTranslationCacheEntry(cache, personId) {
        if (!cache || isNullish(personId)) {
            return null;
        }

        const entry = cache[String(personId)];
        return isPlainObject(entry) ? entry : null;
    }

    function setPeopleTranslationCacheEntry(cache, personId, payload) {
        if (!cache || isNullish(personId) || !isPlainObject(payload)) {
            return false;
        }

        const key = String(personId);
        const currentEntry = getPeopleTranslationCacheEntry(cache, key);
        const nextEntry = isPlainObject(currentEntry) ? { ...currentEntry } : {};

        if (isPlainObject(payload.name)) {
            const nextNameEntry = buildPersonNameCacheEntry(payload.name);
            const currentNameEntry = getValidPersonNameCacheEntry(currentEntry);
            if (nextNameEntry && shouldUpdatePersonNameCache(currentNameEntry, nextNameEntry)) {
                nextEntry.name = nextNameEntry;
            }
        }

        if (isPlainObject(payload.biography)) {
            const nextBiographyEntry = {
                sourceTextHash: String(payload.biography.sourceTextHash ?? ""),
                translatedText: String(payload.biography.translatedText ?? "")
            };
            if (JSON.stringify(ensureObject(currentEntry?.biography)) !== JSON.stringify(nextBiographyEntry)) {
                nextEntry.biography = nextBiographyEntry;
            }
        }

        if (currentEntry && JSON.stringify(currentEntry) === JSON.stringify(nextEntry)) {
            return false;
        }

        nextEntry.updatedAt = Date.now();
        cache[key] = nextEntry;
        return true;
    }

    function getPersonTranslationCacheKeys(person) {
        const ids = ensureObject(person?.ids);
        const keys = [];

        if (isNonNullish(ids.trakt)) {
            keys.push(String(ids.trakt));
        }

        return keys;
    }

    function resolvePeopleDetailTarget(url, data) {
        const traktId = data?.ids?.trakt;
        if (isNonNullish(traktId)) {
            return String(traktId);
        }

        const match = normalizeUrlPath(url).match(/^\/people\/(\d+)$/i);
        return match?.[1] ? String(match[1]) : "";
    }

    function resolvePeopleListTarget(url) {
        const normalizedPath = normalizeUrlPath(url);
        let match = normalizedPath.match(/^\/movies\/(\d+)\/people$/);
        if (match) {
            return {
                mediaType: MEDIA_TYPE.MOVIE,
                traktId: match[1]
            };
        }

        match = normalizedPath.match(/^\/shows\/(\d+)\/people$/);
        if (match) {
            return {
                mediaType: MEDIA_TYPE.SHOW,
                traktId: match[1]
            };
        }

        match = normalizedPath.match(/^\/shows\/(\d+)\/seasons\/(\d+)\/episodes\/(\d+)\/people$/);
        if (match) {
            return {
                mediaType: MEDIA_TYPE.EPISODE,
                showTraktId: match[1],
                seasonNumber: Number(match[2]),
                episodeNumber: Number(match[3])
            };
        }

        return null;
    }

    function collectPeopleCollectionItems(data) {
        return ensureArray(data).reduce((items, entry) => {
            if (isPlainObject(entry?.person)) {
                items.push({
                    person: entry.person
                });
                return items;
            }

            if (isPlainObject(entry) && isPlainObject(entry.ids) && String(entry.name ?? "").trim()) {
                items.push({
                    person: entry
                });
            }

            return items;
        }, []);
    }

    function isSupportedPersonNameSource(source) {
        return source === PEOPLE_NAME_SOURCE.TMDB || source === PEOPLE_NAME_SOURCE.GOOGLE;
    }

    function buildPersonNameCacheEntry(payload) {
        const sourceTextHash = String(payload?.sourceTextHash ?? "").trim();
        const translatedText = String(payload?.translatedText ?? "").trim();
        const source = String(payload?.source ?? "").trim();
        if (!sourceTextHash || !translatedText || !isSupportedPersonNameSource(source)) {
            return null;
        }

        return {
            sourceTextHash,
            translatedText,
            source
        };
    }

    function getValidPersonNameCacheEntry(entry) {
        return buildPersonNameCacheEntry(entry?.name);
    }

    function shouldUpdatePersonNameCache(currentNameEntry, nextNameEntry) {
        if (!nextNameEntry) {
            return false;
        }

        if (!currentNameEntry) {
            return true;
        }

        if (
            currentNameEntry.source === PEOPLE_NAME_SOURCE.GOOGLE &&
            nextNameEntry.source === PEOPLE_NAME_SOURCE.TMDB
        ) {
            return true;
        }

        if (
            currentNameEntry.source === PEOPLE_NAME_SOURCE.TMDB &&
            nextNameEntry.source === PEOPLE_NAME_SOURCE.GOOGLE
        ) {
            return false;
        }

        return (
            currentNameEntry.sourceTextHash !== nextNameEntry.sourceTextHash ||
            currentNameEntry.translatedText !== nextNameEntry.translatedText ||
            currentNameEntry.source !== nextNameEntry.source
        );
    }

    function getCachedPersonNameTranslation(entry, sourceText) {
        const cachedName = getValidPersonNameCacheEntry(entry);
        if (!cachedName) {
            return "";
        }

        return String(cachedName.sourceTextHash ?? "") === computeStringHash(sourceText)
            ? String(cachedName.translatedText)
            : "";
    }

    function buildPersonNameDisplay(sourceText, translatedText) {
        const original = String(sourceText ?? "").trim();
        const translated = String(translatedText ?? "").trim();

        if (!original) {
            return translated;
        }

        if (!translated || translated === original) {
            return original;
        }

        return `${translated}\n${original}`;
    }

    function rememberPeopleListOriginalName(person, originalName) {
        if (!isPlainObject(person) || !originalName) {
            return;
        }

        Object.defineProperty(person, PEOPLE_LIST_ORIGINAL_NAME_KEY, {
            value: originalName,
            configurable: true,
            enumerable: false,
            writable: true
        });
    }

    function getPeopleListOriginalName(person) {
        const originalName = String(person?.[PEOPLE_LIST_ORIGINAL_NAME_KEY] ?? "").trim();
        return originalName || String(person?.name ?? "").trim();
    }

    function getCachedPersonBiographyTranslation(entry, sourceText) {
        const cachedBiography = ensureObject(entry?.biography);
        if (!cachedBiography.translatedText) {
            return "";
        }

        return String(cachedBiography.sourceTextHash ?? "") === computeStringHash(sourceText)
            ? String(cachedBiography.translatedText)
            : "";
    }

    function buildTmdbCastNameMap(tmdbPayload) {
        const nameMap = {};
        const cast = ensureArray(tmdbPayload?.credits?.cast).length > 0
            ? ensureArray(tmdbPayload?.credits?.cast)
            : ensureArray(tmdbPayload?.aggregate_credits?.cast);
        const crew = ensureArray(tmdbPayload?.credits?.crew).length > 0
            ? ensureArray(tmdbPayload?.credits?.crew)
            : ensureArray(tmdbPayload?.aggregate_credits?.crew);

        cast.concat(crew).forEach((item) => {
            const personId = item?.id;
            const name = String(item?.name ?? "").trim();
            if (isNullish(personId) || !name) {
                return;
            }

            nameMap[String(personId)] = name;
        });
        return nameMap;
    }

    function collectPeopleListPersonItems(data) {
        if (!isPlainObject(data)) {
            return [];
        }

        const crewItems = isPlainObject(data.crew)
            ? Object.keys(data.crew).reduce((items, key) => items.concat(ensureArray(data.crew[key])), [])
            : [];

        return ensureArray(data.cast).concat(crewItems);
    }

    function applyPeopleListCachedNameTranslations(data, cache) {
        if (!isPlainObject(data) || !isPlainObject(cache)) {
            return {
                changed: false,
                hasMissing: false
            };
        }

        let changed = false;
        let hasMissing = false;
        collectPeopleListPersonItems(data).forEach((item) => {
            const person = item?.person;
            if (!isPlainObject(person)) {
                return;
            }

            const originalName = String(person.name ?? "").trim();
            if (!originalName) {
                return;
            }

            rememberPeopleListOriginalName(person, originalName);

            const cacheEntries = getPersonTranslationCacheKeys(person)
                .map((personKey) => getPeopleTranslationCacheEntry(cache, personKey))
                .filter((entry) => !!entry);
            const cachedName = cacheEntries
                .map((entry) => getCachedPersonNameTranslation(entry, originalName))
                .find((value) => !!value);
            const hasUpgradeableGoogleCache = isNonNullish(person?.ids?.tmdb) && cacheEntries.some((entry) => {
                const cachedNameEntry = getValidPersonNameCacheEntry(entry);
                return cachedNameEntry?.source === PEOPLE_NAME_SOURCE.GOOGLE;
            });

            if (cachedName) {
                if (cachedName !== originalName) {
                    person.name = cachedName;
                    changed = true;
                }
                if (hasUpgradeableGoogleCache) {
                    hasMissing = true;
                }
                return;
            }

            if (isNonNullish(person?.ids?.tmdb)) {
                hasMissing = true;
            }
        });

        return {
            changed,
            hasMissing
        };
    }

    function applyPeopleListCastNameTranslations(data, tmdbCastNameMap, cache) {
        if (!isPlainObject(data) || !isPlainObject(tmdbCastNameMap)) {
            return false;
        }

        let changed = false;
        collectPeopleListPersonItems(data).forEach((item) => {
            const person = item?.person;
            const personTmdbId = person?.ids?.tmdb;
            if (!isPlainObject(person) || isNullish(personTmdbId)) {
                return;
            }

            const translatedName = String(tmdbCastNameMap[String(personTmdbId)] ?? "").trim();
            if (!translatedName || !containsChineseCharacter(translatedName)) {
                return;
            }

            const originalName = getPeopleListOriginalName(person);
            if (!originalName) {
                return;
            }

            if (String(person.name ?? "").trim() !== translatedName) {
                person.name = translatedName;
                changed = true;
            }

            if (cache) {
                getPersonTranslationCacheKeys(person).forEach((personKey) => {
                    changed = setPeopleTranslationCacheEntry(cache, personKey, {
                        name: {
                            sourceTextHash: computeStringHash(originalName),
                            translatedText: translatedName,
                            source: PEOPLE_NAME_SOURCE.TMDB
                        }
                    }) || changed;
                });
            }
        });

        return changed;
    }

    function collectPeopleListGoogleNameTranslationTargets(data, cache) {
        if (!isPlainObject(data) || !isPlainObject(cache)) {
            return [];
        }

        return collectPeopleListPersonItems(data).reduce((targets, item) => {
            const person = item?.person;
            if (!isPlainObject(person)) {
                return targets;
            }

            const originalName = String(person.name ?? "").trim();
            if (!originalName) {
                return targets;
            }

            const cachedName = getPersonTranslationCacheKeys(person)
                .map((personKey) => getCachedPersonNameTranslation(getPeopleTranslationCacheEntry(cache, personKey), originalName))
                .find((value) => !!value);

            if (!cachedName) {
                targets.push({
                    person,
                    originalName
                });
            }

            return targets;
        }, []);
    }

    function applyPeopleListGoogleNameTranslations(translationTargets, translatedTexts, cache) {
        let changed = false;
        const normalizedTranslatedTexts = ensureArray(translatedTexts);
        ensureArray(translationTargets).forEach((target, index) => {
            const person = target?.person;
            const originalName = String(target?.originalName ?? getPeopleListOriginalName(person)).trim();
            const translatedName = String(normalizedTranslatedTexts[index] ?? "").trim();
            if (
                !isPlainObject(person) ||
                !originalName ||
                !translatedName ||
                translatedName === originalName ||
                !containsChineseCharacter(translatedName)
            ) {
                return;
            }

            if (String(person.name ?? "").trim() !== originalName) {
                return;
            }

            person.name = translatedName;
            changed = true;

            if (cache) {
                getPersonTranslationCacheKeys(person).forEach((personKey) => {
                    setPeopleTranslationCacheEntry(cache, personKey, {
                        name: {
                            sourceTextHash: computeStringHash(originalName),
                            translatedText: translatedName,
                            source: PEOPLE_NAME_SOURCE.GOOGLE
                        }
                    });
                });
            }
        });

        return changed;
    }

    function applyPeopleCollectionCachedTranslations(data, cache) {
        if (!isPlainObject(cache)) {
            return {
                changed: false,
                nameTargets: [],
                biographyTargets: []
            };
        }

        let changed = false;
        const nameTargets = [];
        const biographyTargets = [];

        collectPeopleCollectionItems(data).forEach((item) => {
            const person = item?.person;
            if (!isPlainObject(person)) {
                return;
            }

            const personKeys = getPersonTranslationCacheKeys(person);
            const cacheEntries = personKeys
                .map((personKey) => getPeopleTranslationCacheEntry(cache, personKey))
                .filter((entry) => !!entry);
            const originalName = String(person.name ?? "").trim();
            const originalBiography = String(person.biography ?? "").trim();

            if (originalName) {
                const cachedName = cacheEntries
                    .map((entry) => getCachedPersonNameTranslation(entry, originalName))
                    .find((value) => !!value);
                if (cachedName) {
                    if (person.name !== cachedName) {
                        person.name = cachedName;
                        changed = true;
                    }
                } else if (!containsChineseCharacter(originalName) && personKeys.length > 0) {
                    nameTargets.push({
                        person,
                        originalName,
                        personKeys
                    });
                }
            }

            if (originalBiography) {
                const cachedBiography = cacheEntries
                    .map((entry) => getCachedPersonBiographyTranslation(entry, originalBiography))
                    .find((value) => !!value);
                if (cachedBiography) {
                    if (person.biography !== cachedBiography) {
                        person.biography = cachedBiography;
                        changed = true;
                    }
                } else if (!containsChineseCharacter(originalBiography) && personKeys.length > 0) {
                    biographyTargets.push({
                        person,
                        originalBiography,
                        personKeys
                    });
                }
            }
        });

        return {
            changed,
            nameTargets,
            biographyTargets
        };
    }

    function applyPeopleCollectionGoogleNameTranslations(translationTargets, translatedTexts, cache) {
        let changed = false;
        const normalizedTranslatedTexts = ensureArray(translatedTexts);
        ensureArray(translationTargets).forEach((target, index) => {
            const person = target?.person;
            const originalName = String(target?.originalName ?? "").trim();
            const translatedName = String(normalizedTranslatedTexts[index] ?? "").trim();
            if (
                !isPlainObject(person) ||
                !originalName ||
                !translatedName ||
                translatedName === originalName ||
                !containsChineseCharacter(translatedName)
            ) {
                return;
            }

            if (person.name !== translatedName) {
                person.name = translatedName;
                changed = true;
            }

            ensureArray(target?.personKeys).forEach((personKey) => {
                changed = setPeopleTranslationCacheEntry(cache, personKey, {
                    name: {
                        sourceTextHash: computeStringHash(originalName),
                        translatedText: translatedName,
                        source: PEOPLE_NAME_SOURCE.GOOGLE
                    }
                }) || changed;
            });
        });

        return changed;
    }

    function applyPeopleCollectionGoogleBiographyTranslations(translationTargets, translatedTexts, cache) {
        let changed = false;
        const normalizedTranslatedTexts = ensureArray(translatedTexts);
        ensureArray(translationTargets).forEach((target, index) => {
            const person = target?.person;
            const originalBiography = String(target?.originalBiography ?? "").trim();
            const translatedBiography = String(normalizedTranslatedTexts[index] ?? "").trim();
            if (!isPlainObject(person) || !originalBiography || !translatedBiography) {
                return;
            }

            if (person.biography !== translatedBiography) {
                person.biography = translatedBiography;
                changed = true;
            }

            ensureArray(target?.personKeys).forEach((personKey) => {
                changed = setPeopleTranslationCacheEntry(cache, personKey, {
                    biography: {
                        sourceTextHash: computeStringHash(originalBiography),
                        translatedText: translatedBiography
                    }
                }) || changed;
            });
        });

        return changed;
    }

    async function resolvePeopleListTmdbId(target, linkCache) {
        if (!target || !linkCache) {
            return null;
        }

        if (target.mediaType === MEDIA_TYPE.MOVIE || target.mediaType === MEDIA_TYPE.SHOW) {
            const entry = await ensureMediaIdsCacheEntry(linkCache, target.mediaType, target.traktId);
            return isNonNullish(entry?.ids?.tmdb) ? entry.ids.tmdb : null;
        }

        if (target.mediaType === MEDIA_TYPE.EPISODE) {
            const showEntry = await ensureMediaIdsCacheEntry(linkCache, MEDIA_TYPE.SHOW, target.showTraktId);
            return isNonNullish(showEntry?.ids?.tmdb) ? showEntry.ids.tmdb : null;
        }

        return null;
    }

    function buildPeopleListTmdbMediaType(target) {
        if (!target) {
            return null;
        }

        return target.mediaType === MEDIA_TYPE.MOVIE ? MEDIA_TYPE.MOVIE : MEDIA_TYPE.SHOW;
    }

    async function handleMediaPeopleList() {
        const data = JSON.parse(body);
        if (!isPlainObject(data)) {
            scriptContext.done({});
            return;
        }

        const target = resolvePeopleListTarget(requestUrl);
        if (!target) {
            scriptContext.done({});
            return;
        }

        const cache = loadPeopleTranslationCache();
        const cachedResult = applyPeopleListCachedNameTranslations(data, cache);

        try {
            if (!cachedResult.hasMissing) {
                scriptContext.doneJson(data);
                return;
            }

            const googleTargets = googleTranslationEnabled
                ? collectPeopleListGoogleNameTranslationTargets(data, cache)
                : [];
            const googlePromise = googleTargets.length > 0
                ? translateTextsWithGoogle(googleTargets.map((item) => item.originalName), "en")
                : Promise.resolve([]);
            const tmdbPromise = (async () => {
                const linkCache = loadLinkIdsCache();
                const tmdbId = await resolvePeopleListTmdbId(target, linkCache);
                const tmdbMediaType = buildPeopleListTmdbMediaType(target);
                if (isNullish(tmdbId) || !tmdbMediaType) {
                    return null;
                }

                return fetchTmdbCredits(tmdbMediaType, tmdbId);
            })();

            const [tmdbResult, googleResult] = await Promise.allSettled([tmdbPromise, googlePromise]);
            let changed = false;

            if (tmdbResult.status === "fulfilled" && tmdbResult.value) {
                const tmdbCastNameMap = buildTmdbCastNameMap(tmdbResult.value);
                changed = applyPeopleListCastNameTranslations(data, tmdbCastNameMap, cache) || changed;
            } else if (tmdbResult.status === "rejected") {
                scriptContext.log(`Trakt media people TMDb translation failed: ${tmdbResult.reason}`);
            }

            if (googleResult.status === "fulfilled") {
                changed = applyPeopleListGoogleNameTranslations(googleTargets, googleResult.value, cache) || changed;
            } else {
                scriptContext.log(`Trakt media people Google translation failed: ${googleResult.reason}`);
            }

            if (changed) {
                savePeopleTranslationCache(cache);
            }
            scriptContext.doneJson(data);
        } catch (e) {
            scriptContext.log(`Trakt media people translation failed: ${e}`);
            scriptContext.doneJson(data);
        }
    }

    async function handlePersonMediaCreditsList(logLabel) {
        const data = JSON.parse(body);
        if (!isPlainObject(data)) {
            scriptContext.done({});
            return;
        }

        const crewItems = isPlainObject(data.crew)
            ? Object.keys(data.crew).reduce((items, key) => items.concat(ensureArray(data.crew[key])), [])
            : [];
        const items = ensureArray(data.cast).concat(crewItems);

        if (items.length === 0) {
            scriptContext.done({});
            return;
        }

        if (!isRipppleUserAgent()) {
            scriptContext.doneJson(data);
            return;
        }

        await translateMediaItemsInPlace(items, logLabel);
        scriptContext.doneJson(data);
    }

    async function handlePeopleSearchList() {
        const data = JSON.parse(body);
        if (!Array.isArray(data)) {
            scriptContext.done({});
            return;
        }

        const cache = loadPeopleTranslationCache();
        const cachedResult = applyPeopleCollectionCachedTranslations(data, cache);
        let changed = cachedResult.changed;

        try {
            const nameTargets = googleTranslationEnabled ? cachedResult.nameTargets : [];
            const biographyTargets = googleTranslationEnabled ? cachedResult.biographyTargets : [];
            if (nameTargets.length === 0 && biographyTargets.length === 0) {
                scriptContext.doneJson(data);
                return;
            }

            const [nameResult, biographyResult] = await Promise.allSettled([
                nameTargets.length > 0
                    ? translateTextsWithGoogle(nameTargets.map((item) => item.originalName), "en")
                    : Promise.resolve([]),
                biographyTargets.length > 0
                    ? translateTextsWithGoogle(biographyTargets.map((item) => item.originalBiography), "en")
                    : Promise.resolve([])
            ]);

            if (nameResult.status === "fulfilled") {
                changed = applyPeopleCollectionGoogleNameTranslations(nameTargets, nameResult.value, cache) || changed;
            } else {
                scriptContext.log(`Trakt people collection Google name translation failed: ${nameResult.reason}`);
            }

            if (biographyResult.status === "fulfilled") {
                changed = applyPeopleCollectionGoogleBiographyTranslations(biographyTargets, biographyResult.value, cache) || changed;
            } else {
                scriptContext.log(`Trakt people collection Google biography translation failed: ${biographyResult.reason}`);
            }

            if (changed) {
                savePeopleTranslationCache(cache);
            }
            scriptContext.doneJson(data);
        } catch (e) {
            scriptContext.log(`Trakt people collection translation failed: ${e}`);
            scriptContext.doneJson(data);
        }
    }

    async function handlePeopleDetail() {
        const data = JSON.parse(body);
        if (!isPlainObject(data)) {
            scriptContext.done({});
            return;
        }

        const personId = resolvePeopleDetailTarget(requestUrl, data);
        if (!personId) {
            scriptContext.done({});
            return;
        }

        const cache = loadPeopleTranslationCache();
        const cacheEntry = getPeopleTranslationCacheEntry(cache, personId);
        const nextCacheEntry = {};
        const originalName = String(data.name ?? "").trim();
        const originalBiography = String(data.biography ?? "").trim();
        const cachedName = originalName ? getCachedPersonNameTranslation(cacheEntry, originalName) : "";
        const cachedNameEntry = getValidPersonNameCacheEntry(cacheEntry);
        const cachedBiography = originalBiography ? getCachedPersonBiographyTranslation(cacheEntry, originalBiography) : "";

        if (cachedName) {
            data.name = buildPersonNameDisplay(originalName, cachedName);
            nextCacheEntry.name = {
                sourceTextHash: computeStringHash(originalName),
                translatedText: cachedName,
                source: cachedNameEntry?.source
            };
        }

        if (cachedBiography) {
            data.biography = cachedBiography;
            nextCacheEntry.biography = {
                sourceTextHash: computeStringHash(originalBiography),
                translatedText: cachedBiography
            };
        }

        const shouldFetchTmdbName = originalName &&
            isNonNullish(data?.ids?.tmdb) &&
            cachedNameEntry?.source !== PEOPLE_NAME_SOURCE.TMDB;
        const namePromise = shouldFetchTmdbName
            ? fetchTmdbPerson(data.ids.tmdb)
            : null;
        const googlePromise = googleTranslationEnabled && (originalName || originalBiography)
            ? translateTextsWithGoogle([originalName, originalBiography], "en")
            : null;

        const [nameResult, googleResult] = await Promise.allSettled([
            namePromise ?? Promise.resolve(null),
            googlePromise ?? Promise.resolve(null)
        ]);

        let hasTranslatedName = !!cachedName;
        if (namePromise) {
            if (nameResult.status === "fulfilled") {
                const translatedName = String(nameResult.value?.name ?? "").trim();
                if (translatedName && containsChineseCharacter(translatedName)) {
                    data.name = buildPersonNameDisplay(originalName, translatedName);
                    nextCacheEntry.name = {
                        sourceTextHash: computeStringHash(originalName),
                        translatedText: translatedName,
                        source: PEOPLE_NAME_SOURCE.TMDB
                    };
                    hasTranslatedName = true;
                }
            } else {
                scriptContext.log(`Trakt people name translation failed for ${personId}: ${nameResult.reason}`);
            }
        }

        if (googlePromise) {
            if (googleResult.status === "fulfilled") {
                const googleTranslations = ensureArray(googleResult.value);
                const translatedName = String(googleTranslations[0] ?? "").trim();
                if (!cachedName && !hasTranslatedName && translatedName && containsChineseCharacter(translatedName)) {
                    data.name = buildPersonNameDisplay(originalName, translatedName);
                    nextCacheEntry.name = {
                        sourceTextHash: computeStringHash(originalName),
                        translatedText: translatedName,
                        source: PEOPLE_NAME_SOURCE.GOOGLE
                    };
                    hasTranslatedName = true;
                }

                const translatedBiography = String(googleTranslations[1] ?? "").trim();
                if (!cachedBiography && translatedBiography) {
                    data.biography = translatedBiography;
                    nextCacheEntry.biography = {
                        sourceTextHash: computeStringHash(originalBiography),
                        translatedText: translatedBiography
                    };
                }
            } else {
                scriptContext.log(`Trakt people Google translation failed for ${personId}: ${googleResult.reason}`);
            }
        }

        if (Object.keys(nextCacheEntry).length > 0 && setPeopleTranslationCacheEntry(cache, personId, nextCacheEntry)) {
            savePeopleTranslationCache(cache);
        }

        scriptContext.doneJson(data);
    }

    return {
        handlePeopleSearchList,
        handleMediaPeopleList,
        handlePeopleDetail,
        handlePersonMediaCreditsList
    };
}

export {
    createPeopleHandlers
};
