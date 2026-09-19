const http = require('http');
const { Pool } = require('pg');
const PORT = process.env.PORT || 10000;
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 }) : null;
const monthKey = () => { const d=new Date(); return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`; };

async function init(){
  if(!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS leaderboard_users (
      discord_id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      avatar TEXT,
      month_key TEXT NOT NULL,
      minutes INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS leaderboard_month_idx ON leaderboard_users(month_key, minutes DESC);
    ALTER TABLE leaderboard_users ADD COLUMN IF NOT EXISTS banner TEXT;
    ALTER TABLE leaderboard_users ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1;
    ALTER TABLE leaderboard_users ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0;
    ALTER TABLE leaderboard_users ADD COLUMN IF NOT EXISTS top_champ TEXT;
    ALTER TABLE leaderboard_users ADD COLUMN IF NOT EXISTS top_score INTEGER DEFAULT 0;
    ALTER TABLE leaderboard_users ADD COLUMN IF NOT EXISTS custom_title TEXT;

    CREATE TABLE IF NOT EXISTS user_banners (
      discord_id TEXT PRIMARY KEY,
      content_type TEXT NOT NULL,
      data_base64 TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

function json(res,status,data){
  res.writeHead(status,{
    'Content-Type':'application/json; charset=utf-8',
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Headers':'Content-Type',
    'Access-Control-Allow-Methods':'GET,POST,OPTIONS'
  });
  res.end(JSON.stringify(data));
}

function body(req){
  return new Promise((resolve,reject)=>{
    let s='';
    // 10MB limit (Hareketli GIF ve büyük bannerlar için)
    req.on('data',c=>{
      s+=c;
      if(s.length > 10 * 1024 * 1024) req.destroy();
    });
    req.on('end',()=>{
      try{resolve(JSON.parse(s||'{}'));}
      catch(e){reject(e);}
    });
    req.on('error',reject);
  });
}

const server = http.createServer(async(req,res)=>{
  if(req.method==='OPTIONS') return json(res,204,{});
  try{
    if(req.url==='/health') return json(res,200,{ok:true,service:'skynix-leaderboard'});
    if(!pool) return json(res,503,{success:false,error:'DATABASE_URL yapılandırılmadı'});

    // Yüklenen özel bannerları (GIF/PNG) servis et
    if(req.method==='GET' && req.url.startsWith('/leaderboard/banner/')){
      const discordId = req.url.split('/')[3]?.split('?')[0];
      if(!discordId) return res.writeHead(400).end('discordId missing');
      const q = await pool.query('SELECT content_type, data_base64 FROM user_banners WHERE discord_id = $1', [String(discordId)]);
      if(q.rows.length === 0){
        res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
        return res.end('Banner not found');
      }
      const row = q.rows[0];
      const imgBuf = Buffer.from(row.data_base64, 'base64');
      res.writeHead(200, {
        'Content-Type': row.content_type || 'image/png',
        'Content-Length': imgBuf.length,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*'
      });
      return res.end(imgBuf);
    }

    if(req.method==='POST' && req.url==='/leaderboard/heartbeat'){
      const x = await body(req);
      if(!x.discordId || !x.username) return json(res,400,{success:false,error:'discordId ve username gerekli'});
      const minutes = Math.max(0, Math.min(5, Math.floor(Number(x.minutes)||0)));
      let banner = typeof x.banner === 'string' && x.banner.length > 5 ? x.banner : null;
      const level = Math.max(1, Math.min(9999, Math.floor(Number(x.level) || 1)));
      const xp = Math.max(0, Math.floor(Number(x.xp) || 0));
      const topChamp = typeof x.topChamp === 'string' && x.topChamp.trim().length > 0 ? x.topChamp.trim().slice(0, 80) : null;
      const topScore = Math.max(0, Math.floor(Number(x.topScore) || 0));
      const customTitle = typeof x.customTitle === 'string' && x.customTitle.trim().length > 0 ? x.customTitle.trim().slice(0, 100) : null;

      // Kullanıcı bilgisayarından base64 görsel veya GIF yüklediyse:
      if (banner && banner.startsWith('data:image/')) {
        try {
          const m = banner.match(/^data:([^;]+);base64,(.+)$/);
          if (m) {
            const contentType = m[1];
            const dataBase64 = m[2];
            await pool.query(`
              INSERT INTO user_banners(discord_id, content_type, data_base64, updated_at)
              VALUES($1, $2, $3, NOW())
              ON CONFLICT(discord_id) DO UPDATE SET
                content_type = EXCLUDED.content_type,
                data_base64 = EXCLUDED.data_base64,
                updated_at = NOW()
            `, [String(x.discordId), contentType, dataBase64]);
            banner = `https://skynix-leaderboard.onrender.com/leaderboard/banner/${x.discordId}`;
          }
        } catch(err) {
          console.error('Banner upload error:', err);
        }
      }

      await pool.query(`
        INSERT INTO leaderboard_users(
          discord_id, username, avatar, month_key, minutes, banner, level, xp, top_champ, top_score, custom_title
        ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT(discord_id) DO UPDATE SET
          username = EXCLUDED.username,
          avatar = EXCLUDED.avatar,
          month_key = EXCLUDED.month_key,
          minutes = CASE WHEN leaderboard_users.month_key = EXCLUDED.month_key THEN leaderboard_users.minutes + EXCLUDED.minutes ELSE EXCLUDED.minutes END,
          banner = COALESCE(EXCLUDED.banner, leaderboard_users.banner),
          level = GREATEST(COALESCE(leaderboard_users.level, 1), EXCLUDED.level),
          xp = GREATEST(COALESCE(leaderboard_users.xp, 0), EXCLUDED.xp),
          top_champ = COALESCE(EXCLUDED.top_champ, leaderboard_users.top_champ),
          top_score = GREATEST(COALESCE(leaderboard_users.top_score, 0), EXCLUDED.top_score),
          custom_title = COALESCE(EXCLUDED.custom_title, leaderboard_users.custom_title),
          updated_at = NOW()
      `, [
        String(x.discordId),
        String(x.username).slice(0,80),
        x.avatar || null,
        monthKey(),
        minutes,
        banner,
        level,
        xp,
        topChamp,
        topScore,
        customTitle
      ]);
      return json(res, 200, { success: true, bannerUrl: banner });
    }

    if(req.method==='GET' && req.url==='/leaderboard/monthly'){
      const q = await pool.query(`
        SELECT 
          discord_id AS "discordId",
          username,
          avatar,
          minutes,
          banner,
          level,
          xp,
          top_champ AS "topChamp",
          top_score AS "topScore",
          custom_title AS "customTitle"
        FROM leaderboard_users 
        WHERE month_key = $1 
        ORDER BY minutes DESC, updated_at ASC 
        LIMIT 100
      `, [monthKey()]);
      return json(res, 200, { success: true, month: monthKey(), users: q.rows });
    }

    return json(res, 404, { error: 'Not found' });
  }catch(e){
    console.error(e);
    return json(res, 500, { success: false, error: 'Sunucu hatası' });
  }
});

init().then(()=>server.listen(PORT,()=>console.log(`Skynix leaderboard listening on ${PORT}`))).catch(e=>{
  console.error(e);
  process.exit(1);
});
