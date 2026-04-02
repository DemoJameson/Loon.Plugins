function hasValidTidbData(data) {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const intro = Array.isArray(data.intro) ? data.intro[0] : null;
  if (intro && intro.end_ms > 0) {
    return true;
  }

  const credits = Array.isArray(data.credits) ? data.credits[0] : null;
  if (credits && credits.start_ms !== null && credits.start_ms !== undefined) {
    return true;
  }

  return false;
}

async function handleGet(req, res, kvRestApiUrl, kvRestApiToken) {
  const { tmdb_id, season } = req.query;
  if (!tmdb_id || !season) {
    return res.status(400).json({ error: 'Missing tmdb_id or season' });
  }

  const key = `tidb:show:${tmdb_id}:${season}`;
  const url = `${kvRestApiUrl}/hgetall/${key}`;
  try {
    const kvReq = await fetch(url, {
      headers: { Authorization: `Bearer ${kvRestApiToken}` }
    });
    const kvRes = await kvReq.json();

    if (kvRes.error) {
      return res.status(500).json({ error: kvRes.error });
    }

    const result = kvRes.result || [];
    let episodes = {};
    const now = Date.now();
    for (let i = 0; i < result.length; i += 2) {
      const ep = result[i];
      try {
        const val = JSON.parse(result[i + 1]);
        if (val.expireAt && val.expireAt > now) {
          episodes[ep] = val.data;
        }
      } catch (e) {
        // ignore invalid json format
      }
    }

    return res.status(200).json(episodes);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function handlePost(req, res, kvRestApiUrl, kvRestApiToken) {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { tmdb_id, season, episodes } = body;

    if (!tmdb_id || season === undefined || !Array.isArray(episodes)) {
      return res.status(400).json({ error: 'Missing parameters or episodes array' });
    }

    const key = `tidb:show:${tmdb_id}:${season}`;
    let commands = [];
    const now = Date.now();

    for (let epObj of episodes) {
      if (!hasValidTidbData(epObj.data)) {
        continue;
      }

      const expireAt = now + (30 * 24 * 60 * 60 * 1000);
      const val = JSON.stringify({ data: epObj.data, expireAt });
      commands.push(['HSET', key, String(epObj.episode), val]);
    }

    if (commands.length > 0) {
      commands.push(['EXPIRE', key, '2592000']);

      const pipelineUrl = `${kvRestApiUrl}/pipeline`;
      const pReq = await fetch(pipelineUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${kvRestApiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(commands)
      });

      const pRes = await pReq.json();
      if (Array.isArray(pRes) && pRes[0] && pRes[0].error) {
        return res.status(500).json({ error: pRes[0].error });
      }
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = async function (req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const KV_REST_API_URL = process.env.KV_REST_API_URL;
  const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;

  if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
    return res.status(500).json({ error: 'Missing KV credentials' });
  }

  if (req.method === 'GET') {
    return handleGet(req, res, KV_REST_API_URL, KV_REST_API_TOKEN);
  }

  if (req.method === 'POST') {
    return handlePost(req, res, KV_REST_API_URL, KV_REST_API_TOKEN);
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
