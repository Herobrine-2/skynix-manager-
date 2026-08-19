const http = require('http');
const https = require('https');
const crypto = require('crypto');

const PORT = process.env.PORT || 10000;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const REQUIRED_ROLE_ID = process.env.DISCORD_REQUIRED_ROLE_ID || '';
const PUBLIC_URL = process.env.PUBLIC_URL;

if (!CLIENT_ID || !CLIENT_SECRET || !GUILD_ID || !PUBLIC_URL) {
  console.error('Eksik ortam değişkeni var.');
  process.exit(1);
}

const REDIRECT_URI = `${PUBLIC_URL}/callback`;
const sessions = new Map();

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(data));
}

function discordRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const body = options.body || '';
    const req = https.request({
      hostname: 'discord.com',
      path: `/api${path}`,
      method: options.method || 'GET',
      headers: {
        ...(options.headers || {}),
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {})
      }
    }, response => {
      let raw = '';
      response.setEncoding('utf8');
      response.on('data', chunk => raw += chunk);
      response.on('end', () => {
        let data = {};
        try { data = JSON.parse(raw || '{}'); } catch {}
        resolve({ status: response.statusCode, data });
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function successPage(message) {
  return `
<!doctype html>
<html lang="tr">
<head><meta charset="utf-8"><title>Skynix Manager</title></head>
<body style="background:#080b14;color:white;font-family:Arial;text-align:center;padding-top:120px">
<h1>${message}</h1>
<p>Bu pencereyi kapatıp Skynix Manager'a dönebilirsin.</p>
</body>
</html>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, PUBLIC_URL);

  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { ok: true, service: 'skynix-auth' });
  }

  if (req.method === 'GET' && url.pathname === '/oauth/start') {
    const state = url.searchParams.get('state') || crypto.randomBytes(24).toString('hex');

    sessions.set(state, {
      status: 'pending',
      createdAt: Date.now()
    });

    const authUrl = new URL('https://discord.com/oauth2/authorize');
    authUrl.searchParams.set('client_id', CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'identify guilds.members.read');
    authUrl.searchParams.set('state', state);

    res.writeHead(302, { Location: authUrl.toString() });
    return res.end();
  }

  if (req.method === 'GET' && url.pathname === '/oauth/poll') {
    const state = url.searchParams.get('state');
    const session = state ? sessions.get(state) : null;

    if (!session) {
      return sendJson(res, 404, { success: false, error: 'Oturum bulunamadı.' });
    }

    if (session.status === 'pending') {
      return sendJson(res, 200, { success: false, pending: true });
    }

    sessions.delete(state);
    return sendJson(res, 200, session.result);
  }

  if (req.method === 'GET' && url.pathname === '/callback') {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (!state || !sessions.has(state)) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(successPage('Geçersiz giriş oturumu.'));
    }

    if (error || !code) {
      sessions.set(state, {
        status: 'done',
        result: { success: false, error: 'Discord girişi iptal edildi.' }
      });

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(successPage('Discord girişi iptal edildi.'));
    }

    try {
      const tokenBody = new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI
      }).toString();

      const tokenResponse = await discordRequest('/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenBody
      });

      if (!tokenResponse.data.access_token) {
        throw new Error('Discord token alınamadı.');
      }

      const accessToken = tokenResponse.data.access_token;

      const userResponse = await discordRequest('/users/@me', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      const memberResponse = await discordRequest(
        `/users/@me/guilds/${GUILD_ID}/member`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (memberResponse.status !== 200) {
        sessions.set(state, {
          status: 'done',
          result: {
            success: false,
            error: 'Kullanıcı Skynix Discord sunucusunda bulunamadı.'
          }
        });

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(successPage('Sunucu üyeliği bulunamadı.'));
      }

      if (REQUIRED_ROLE_ID && !memberResponse.data.roles?.includes(REQUIRED_ROLE_ID)) {
        sessions.set(state, {
          status: 'done',
          result: {
            success: false,
            error: 'Gerekli Discord rolü bulunamadı.'
          }
        });

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(successPage('Gerekli Member rolü bulunamadı.'));
      }

      sessions.set(state, {
        status: 'done',
        result: {
          success: true,
          user: {
            id: userResponse.data.id,
            username: userResponse.data.username,
            avatar: userResponse.data.avatar || null
          }
        }
      });

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(successPage('Discord girişi başarılı!'));
    } catch (err) {
      console.error(err);

      sessions.set(state, {
        status: 'done',
        result: {
          success: false,
          error: 'Discord token işlemi başarısız oldu.'
        }
      });

      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(successPage('Discord girişinde hata oluştu.'));
    }

    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`Skynix Auth Server listening on port ${PORT}`);
});

setInterval(() => {
  const expireBefore = Date.now() - 10 * 60 * 1000;

  for (const [state, session] of sessions) {
    if (session.createdAt < expireBefore) {
      sessions.delete(state);
    }
  }
}, 60 * 1000);
