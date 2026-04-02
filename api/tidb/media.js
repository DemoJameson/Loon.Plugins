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
    const { tmdb_id, season } = req.query;
    if (!tmdb_id || !season) {
      return res.status(400).json({ error: 'Missing tmdb_id or season' });
    }

    const key = `tidb:show:${tmdb_id}:${season}`;
    const url = `${KV_REST_API_URL}/hgetall/${key}`;
    try {
      const kvReq = await fetch(url, {
        headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
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
          // Check expiration
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

  if (req.method === 'POST') {
    try {
      // Assuming body is JSON
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      const { tmdb_id, season, episodes } = body;
      
      if (!tmdb_id || season === undefined || !Array.isArray(episodes)) {
        return res.status(400).json({ error: 'Missing parameters or episodes array' });
      }

      const key = `tidb:show:${tmdb_id}:${season}`;
      let commands = [];
      const now = Date.now();
      
      for (let epObj of episodes) {
          // Cache 1 month if has_data is true, otherwise 30 mins
          const expireInMs = epObj.has_data ? (30 * 24 * 60 * 60 * 1000) : (30 * 60 * 1000); 
          const expireAt = now + expireInMs;
          const val = JSON.stringify({ data: epObj.data, expireAt });
          commands.push(["HSET", key, String(epObj.episode), val]);
      }

      if (commands.length > 0) {
          commands.push(["EXPIRE", key, "2592000"]); // Reset hash expiration to 1 month every time it's updated
          
          // Upstash Pipeline: multiple HSETs and EXPIRE
          const pipelineUrl = `${KV_REST_API_URL}/pipeline`;
          const pReq = await fetch(pipelineUrl, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${KV_REST_API_TOKEN}`,
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

  return res.status(405).json({ error: 'Method not allowed' });
};
