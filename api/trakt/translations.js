const CACHE_STATUS = {
  FOUND: 1,
  NOT_FOUND: 2,
};

const CACHE_CONTROL = "public, max-age=0, s-maxage=300, stale-while-revalidate=86400";
const FOUND_TTL_SECONDS = 90 * 24 * 60 * 60;
const NOT_FOUND_TTL_SECONDS = 7 * 24 * 60 * 60;

function parseIds(value) {
  if (!value) {
    return [];
  }

  const parts = Array.isArray(value) ? value.join(",").split(",") : String(value).split(",");
  const unique = new Set();

  for (const part of parts) {
    const normalized = String(part).trim();
    if (!/^\d+$/.test(normalized)) {
      continue;
    }
    unique.add(normalized);
  }

  return Array.from(unique);
}

function parseEpisodeKeys(value) {
  if (!value) {
    return [];
  }

  const parts = Array.isArray(value) ? value.join(",").split(",") : String(value).split(",");
  const unique = new Set();

  for (const part of parts) {
    const normalized = String(part).trim();
    if (!/^\d+:\d+:\d+$/.test(normalized)) {
      continue;
    }
    unique.add(normalized);
  }

  return Array.from(unique);
}

function isEmptyTranslationValue(value) {
  return value === undefined || value === null || value === "";
}

function hasUsefulTranslation(translation) {
  return !!(
    translation &&
    (!isEmptyTranslationValue(translation.title) ||
      !isEmptyTranslationValue(translation.overview) ||
      !isEmptyTranslationValue(translation.tagline))
  );
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return {
      status: CACHE_STATUS.NOT_FOUND,
      translation: null,
    };
  }

  const translation = hasUsefulTranslation(entry.translation)
    ? {
        title: entry.translation.title || null,
        overview: entry.translation.overview || null,
        tagline: entry.translation.tagline || null,
      }
    : null;

  return {
    status: entry.status === CACHE_STATUS.FOUND ? CACHE_STATUS.FOUND : CACHE_STATUS.NOT_FOUND,
    translation,
  };
}

function getKvConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

  if (!url || !token) {
    return null;
  }

  return {
    url: url.replace(/\/+$/, ""),
    token,
  };
}

function sendKvNotConfigured(res) {
  res.status(500).json({
    error: "KV is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN, or UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
  });
}

async function kvRequest(config, path, init) {
  const response = await fetch(`${config.url}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
      ...(init && init.headers ? init.headers : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`KV HTTP ${response.status}`);
  }

  return response.json();
}

function buildCacheKey(mediaType, lookupKey) {
  return `trakt:translation:${mediaType}:${lookupKey}`;
}

function parseCachedEntry(value) {
  if (!value) {
    return null;
  }

  try {
    return normalizeEntry(JSON.parse(value));
  } catch {
    return null;
  }
}

async function readManyFromKv(config, mediaType, ids) {
  if (!config || ids.length === 0) {
    return {};
  }

  const keys = ids.map((id) => buildCacheKey(mediaType, id));
  const payload = await kvRequest(
    config,
    `/mget/${keys.map((key) => encodeURIComponent(key)).join("/")}`
  );
  const results = Array.isArray(payload.result) ? payload.result : [];
  const entries = {};

  ids.forEach((id, index) => {
    const entry = parseCachedEntry(results[index]);
    if (entry) {
      entries[id] = entry;
    }
  });

  return entries;
}

async function writeManyToKv(config, mediaType, entriesById) {
  if (!config) {
    return;
  }

  const commands = Object.entries(entriesById).map(([id, rawEntry]) => {
    const entry = normalizeEntry(rawEntry);
    const ttl = entry.status === CACHE_STATUS.FOUND ? FOUND_TTL_SECONDS : NOT_FOUND_TTL_SECONDS;

    return [
      "SETEX",
      buildCacheKey(mediaType, id),
      ttl,
      JSON.stringify(entry),
    ];
  });

  if (commands.length === 0) {
    return;
  }

  await kvRequest(config, "/pipeline", {
    method: "POST",
    body: JSON.stringify(commands),
  });
}

async function handleGet(req, res, kvConfig) {
  if (!kvConfig) {
    sendKvNotConfigured(res);
    return;
  }

  const showIds = parseIds(req.query.shows);
  const movieIds = parseIds(req.query.movies);
  const episodeKeys = parseEpisodeKeys(req.query.episodes);

  if (showIds.length === 0 && movieIds.length === 0 && episodeKeys.length === 0) {
    res.status(400).json({ error: "Missing shows, movies, or episodes query" });
    return;
  }

  const [shows, movies, episodes] = await Promise.all([
    readManyFromKv(kvConfig, "shows", showIds),
    readManyFromKv(kvConfig, "movies", movieIds),
    readManyFromKv(kvConfig, "episodes", episodeKeys),
  ]);

  res.setHeader("Cache-Control", CACHE_CONTROL);
  res.status(200).json({
    shows,
    movies,
    episodes,
  });
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function handlePost(req, res, kvConfig) {
  if (!kvConfig) {
    sendKvNotConfigured(res);
    return;
  }

  const payload = await readJsonBody(req);
  const shows = payload && payload.shows && typeof payload.shows === "object" ? payload.shows : {};
  const movies = payload && payload.movies && typeof payload.movies === "object" ? payload.movies : {};
  const episodes = payload && payload.episodes && typeof payload.episodes === "object" ? payload.episodes : {};

  await Promise.all([
    writeManyToKv(kvConfig, "shows", shows),
    writeManyToKv(kvConfig, "movies", movies),
    writeManyToKv(kvConfig, "episodes", episodes),
  ]);

  res.status(200).json({
    counts: {
      shows: Object.keys(shows).length,
      movies: Object.keys(movies).length,
      episodes: Object.keys(episodes).length,
    },
  });
}

module.exports = async (req, res) => {
  const kvConfig = getKvConfig();

  try {
    if (req.method === "GET") {
      await handleGet(req, res, kvConfig);
      return;
    }

    if (req.method === "POST") {
      await handlePost(req, res, kvConfig);
      return;
    }

    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
