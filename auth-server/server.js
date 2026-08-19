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

function successPage(title, message, ok = true) {
  const color = ok ? '#56e39f' : '#ff6b81';
  const icon = ok ? '✓' : '!';
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Skynix Manager</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at 50% 0%,#202b5b 0,#0b1020 42%,#05070d 100%);font-family:Segoe UI,Arial,sans-serif;color:#f5f7ff}.card{width:min(440px,calc(100% - 32px));padding:34px 30px 28px;text-align:center;background:rgba(12,16,31,.94);border:1px solid #303d78;border-radius:22px;box-shadow:0 24px 70px #0009}.logo{width:76px;height:76px;margin:0 auto 18px;object-fit:contain}.mark{width:76px;height:76px;margin:0 auto 18px;display:grid;place-items:center;border-radius:24px;background:linear-gradient(135deg,#6c72ff,#8d50ef);font-size:42px;font-weight:800;color:white}.status{width:58px;height:58px;margin:0 auto 18px;border-radius:50%;display:grid;place-items:center;border:2px solid ${color};color:${color};font-size:31px;font-weight:700}h1{margin:0 0 10px;font-size:23px}p{margin:0;color:#9ca8c8;font-size:14px;line-height:1.6}.brand{margin-top:25px;color:#69759b;font-size:11px;letter-spacing:2px;font-weight:700}.close{display:inline-block;margin-top:24px;padding:10px 20px;border:1px solid #394777;border-radius:10px;color:#dce2ff;text-decoration:none;font-size:13px}.close:hover{background:#202b55}
</style>
</head>
<body><main class="card"><div class="mark">${icon}</div><h1>${title}</h1><p>${message}</p><a class="close" href="javascript:window.close()">Pencereyi kapat</a><div class="brand">SKYNIX MANAGER</div></main></body></html>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, PUBLIC_URL);

  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { ok: true, service: 'skynix-auth' });
  }

  if (req.method === 'GET' && url.pathname === '/oauth/start') {
    const state = url.searchParams.get('state') || crypto.randomBytes(24).toString('hex');
    sessions.set(state, { status: 'pending', createdAt: Date.now() });
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
    if (!session) return sendJson(res, 404, { success: false, error: 'Oturum bulunamadı.' });
    if (session.status === 'pending') return sendJson(res, 200, { success: false, pending: true });
    sessions.delete(state);
    return sendJson(res, 200, session.result);
  }

  if (req.method === 'GET' && url.pathname === '/callback') {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    const html = (status, title, message, ok = false) => {
      res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(successPage(title, message, ok));
    };

    if (!state || !sessions.has(state)) return html(400, 'Geçersiz giriş oturumu', 'Bu giriş bağlantısının süresi dolmuş olabilir. Uygulamadan tekrar deneyin.');
    if (error || !code) {
      sessions.set(state, { status: 'done', result: { success: false, error: 'Discord girişi iptal edildi.' } });
      return html(200, 'Giriş iptal edildi', 'Discord yetkilendirmesi tamamlanmadı. Uygulamaya dönüp tekrar deneyebilirsiniz.');
    }

    try {
      const tokenBody = new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }).toString();
      const tokenResponse = await discordRequest('/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: tokenBody });
      if (!tokenResponse.data.access_token) throw new Error('Discord token alınamadı.');
      const accessToken = tokenResponse.data.access_token;
      const userResponse = await discordRequest('/users/@me', { headers: { Authorization: `Bearer ${accessToken}` } });
      const memberResponse = await discordRequest(`/users/@me/guilds/${GUILD_ID}/member`, { headers: { Authorization: `Bearer ${accessToken}` } });

      if (memberResponse.status !== 200) {
        sessions.set(state, { status: 'done', result: { success: false, error: 'Kullanıcı Skynix Discord sunucusunda bulunamadı.' } });
        return html(200, 'Sunucu üyeliği bulunamadı', 'Önce Skynix Discord sunucusuna katılmalı ve kuralları kabul etmelisiniz.');
      }
      if (REQUIRED_ROLE_ID && !memberResponse.data.roles?.includes(REQUIRED_ROLE_ID)) {
        sessions.set(state, { status: 'done', result: { success: false, error: 'Gerekli Discord rolü bulunamadı.' } });
        return html(200, 'Üyelik rolü bulunamadı', 'Sunucuda kuralları kabul ettikten sonra tekrar giriş yapın.');
      }

      sessions.set(state, { status: 'done', result: { success: true, user: { id: userResponse.data.id, username: userResponse.data.username, avatar: userResponse.data.avatar || null } } });
      return html(200, 'Discord bağlantısı başarılı!', 'Kimliğin doğrulandı. Skynix Manager uygulamasına dönebilirsin.', true);
    } catch (err) {
      console.error(err);
      sessions.set(state, { status: 'done', result: { success: false, error: 'Discord token işlemi başarısız oldu.' } });
      return html(500, 'Giriş sırasında hata oluştu', 'Discord bağlantısı kurulamadı. Lütfen uygulamadan tekrar deneyin.');
    }
  }

  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => console.log(`Skynix Auth Server listening on port ${PORT}`));
setInterval(() => {
  const expireBefore = Date.now() - 10 * 60 * 1000;
  for (const [state, session] of sessions) if (session.createdAt < expireBefore) sessions.delete(state);
}, 60 * 1000);
