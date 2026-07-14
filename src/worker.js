import { createRemoteJWKSet, jwtVerify } from 'jose';

const FIREBASE_JWKS = createRemoteJWKSet(new URL(
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
));

const TABLES = {
  users: ['uid','nama','email','role','id_karyawan','jabatan','created_at','updated_at'],
  karyawan: ['id','uid','id_karyawan','nama','jabatan','created_at','updated_at'],
  absensi: ['id','user_uid','id_karyawan','nama','jabatan','tanggal','clock_in','clock_out','total_menit','created_at','updated_at'],
  cuti: ['id','user_uid','id_karyawan','nama','jabatan','jenis_izin','tanggal_mulai','tanggal_selesai','alasan','status','catatan','tgl_pengajuan','tgl_review','created_at','updated_at'],
  inventaris_stok: ['id','lokasi','nama_barang','jumlah','updated_at'],
  inventaris_logs: ['id','waktu','user_uid','nama_user','tipe','nama_barang','jumlah','lokasi'],
  inv_items: ['id','nama_barang','lokasi','created_at','updated_at'],
  penjualan: ['id','user_uid','id_karyawan','nama','tanggal','items','total_nominal','created_at','updated_at','updated_by'],
  laporan_masak: ['id','user_uid','id_karyawan','nama','tanggal','items','created_at','updated_at','updated_by']
};
const JSON_FIELDS = { inv_items:['lokasi'], penjualan:['items'], laporan_masak:['items'] };
const ADMIN_WRITE = new Set(['users','karyawan','inv_items']);
const ADMIN_DELETE = new Set(['users','karyawan','absensi','cuti','inventaris_logs','inv_items','penjualan','laporan_masak']);
const WEBHOOK_SECRETS = {
  absensi:'DISCORD_WEBHOOK_ABSENSI', kulkas:'DISCORD_WEBHOOK_KULKAS',
  brangkas:'DISCORD_WEBHOOK_BRANGKAS', penjualan:'DISCORD_WEBHOOK_PENJUALAN',
  laporan_masak:'DISCORD_WEBHOOK_LAPORAN_MASAK', cuti:'DISCORD_WEBHOOK_CUTI'
};
const MENU_PRICES = Object.freeze({
  'Paket Kenyang':175000,'Paket Biasa':65000,'HP Android':60000,'HP Iphone':550000,
  'Radio':35000,'Rokok':10000,'Korek':2000,'Boombox':350000
});
const MENU_ALIASES = Object.freeze({
  'android':'HP Android','hp android':'HP Android',
  'iphone':'HP Iphone','hp iphone':'HP Iphone'
});
const normalizeMenuName = value => {
  const name=String(value||'').trim();
  return MENU_ALIASES[name.toLowerCase()]||Object.keys(MENU_PRICES).find(item=>item.toLowerCase()===name.toLowerCase())||name;
};

function cors(request, env) {
  const origin=request.headers.get('Origin')||'';
  const allowed=(env.ALLOWED_ORIGINS||'http://localhost:3000,http://127.0.0.1:8787').split(',').map(x=>x.trim());
  const ok=!origin||allowed.includes(origin)||allowed.includes('*');
  return {
    'Access-Control-Allow-Origin': ok?(origin||allowed[0]):'null',
    'Access-Control-Allow-Headers':'Authorization, Content-Type',
    'Access-Control-Allow-Methods':'GET, POST, PUT, DELETE, OPTIONS',
    'Vary':'Origin','Cache-Control':'no-store'
  };
}
const reply=(request,env,data,status=200)=>Response.json(data,{status,headers:cors(request,env)});

async function authenticate(request, env) {
  const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
  if(!token) throw Object.assign(new Error('Token autentikasi tidak ada.'),{status:401});
  const {payload}=await jwtVerify(token,FIREBASE_JWKS,{
    issuer:`https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
    audience:env.FIREBASE_PROJECT_ID
  });
  const profile=await env.DB.prepare('SELECT * FROM users WHERE uid=?').bind(payload.sub).first();
  if(!profile) throw Object.assign(new Error('Profil pengguna belum terdaftar.'),{status:403});
  return {uid:payload.sub,email:payload.email||'',profile};
}

function encode(table,data){
  const out={};
  for(const key of TABLES[table]) if(data[key]!==undefined) out[key]=(JSON_FIELDS[table]||[]).includes(key)?JSON.stringify(data[key]):data[key];
  return out;
}
function decode(table,row){
  if(!row)return row;
  for(const key of JSON_FIELDS[table]||[]) if(typeof row[key]==='string'){try{row[key]=JSON.parse(row[key])}catch{row[key]=[]}}
  return row;
}
function primary(table){return table==='users'?'uid':'id'}
function assertTable(table){if(!TABLES[table])throw Object.assign(new Error('Koleksi tidak valid.'),{status:400})}
function assertWrite(user,table,method,row){
  if(ADMIN_WRITE.has(table)&&user.profile.role!=='admin') throw Object.assign(new Error('Akses admin diperlukan.'),{status:403});
  if(method==='DELETE'&&ADMIN_DELETE.has(table)&&user.profile.role!=='admin'){
    if(!['penjualan','laporan_masak'].includes(table)||row?.user_uid!==user.uid) throw Object.assign(new Error('Akses admin diperlukan.'),{status:403});
  }
}

async function listRows(request,env,user,table,url){
  const filters=JSON.parse(url.searchParams.get('filters')||'[]');
  const order=JSON.parse(url.searchParams.get('order')||'null');
  const max=Math.min(Number(url.searchParams.get('limit')||500),1000);
  let sql=`SELECT * FROM ${table}`,args=[],where=[];
  for(const f of filters){
    if(!TABLES[table].includes(f.field)||!['==','>=','<='].includes(f.op))continue;
    where.push(`${f.field} ${f.op==='=='?'=':f.op} ?`);args.push(f.value);
  }
  if(user.profile.role!=='admin'&&['penjualan','laporan_masak'].includes(table)){where.push('user_uid=?');args.push(user.uid)}
  if(user.profile.role!=='admin'&&['absensi','cuti'].includes(table)){where.push('id_karyawan=?');args.push(user.profile.id_karyawan)}
  if(where.length)sql+=' WHERE '+where.join(' AND ');
  if(order&&TABLES[table].includes(order.field))sql+=` ORDER BY ${order.field} ${order.dir==='desc'?'DESC':'ASC'}`;
  sql+=' LIMIT ?';args.push(max);
  const result=await env.DB.prepare(sql).bind(...args).all();
  return result.results.map(row=>decode(table,row));
}

async function salesRanking(request,env,url){
  const from=url.searchParams.get('from'),to=url.searchParams.get('to');
  let sql=`SELECT COALESCE(NULLIF(p.id_karyawan,''),NULLIF(p.user_uid,''),p.nama) AS seller_key,
    COALESCE(MAX(NULLIF(employee.nama,'')),MAX(NULLIF(account.nama,'')),MAX(NULLIF(p.nama,'')),'-') AS nama,
    COUNT(*) AS transaksi, COALESCE(SUM(p.total_nominal),0) AS total
    FROM penjualan p
    LEFT JOIN users employee ON employee.id_karyawan=NULLIF(p.id_karyawan,'')
    LEFT JOIN users account ON account.uid=p.user_uid`,args=[],where=[];
  if(from){where.push('p.tanggal >= ?');args.push(from)}
  if(to){where.push('p.tanggal <= ?');args.push(to)}
  if(where.length)sql+=' WHERE '+where.join(' AND ');
  sql+=` GROUP BY seller_key ORDER BY total DESC, nama ASC`;
  const result=await env.DB.prepare(sql).bind(...args).all();
  return reply(request,env,{rows:result.results.map(row=>({
    nama:row.nama,transaksi:Number(row.transaksi||0),total:Number(row.total||0)
  }))});
}

async function salesTransaction(request,env,user){
  const {tanggal,items}=await request.json();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(tanggal||''))||!Array.isArray(items)||!items.length)
    return reply(request,env,{error:'Data penjualan tidak valid.'},400);
  const merged=new Map();
  for(const raw of items){
    const menu=normalizeMenuName(raw.menu),qty=Number(raw.qty);
    if(!MENU_PRICES[menu]||!Number.isInteger(qty)||qty<1)return reply(request,env,{error:'Item penjualan tidak valid.'},400);
    merged.set(menu,(merged.get(menu)||0)+qty);
  }
  const normalized=[...merged].map(([menu,qty])=>({menu,qty,harga_satuan:MENU_PRICES[menu],subtotal:MENU_PRICES[menu]*qty}));
  const stocks=[];
  for(const item of normalized){
    const row=await env.DB.prepare('SELECT id,nama_barang,jumlah FROM inventaris_stok WHERE lokasi=? AND LOWER(TRIM(nama_barang))=LOWER(?) LIMIT 1').bind('Kulkas',item.menu).first();
    const current=Number(row?.jumlah||0),next=current-item.qty;
    if(next<0)return reply(request,env,{error:`Stok ${item.menu} tidak mencukupi. Saat ini: ${current}`},409);
    stocks.push({barang:row.nama_barang,menu:item.menu,jumlah:next,id:row.id});
  }
  const id=crypto.randomUUID(),now=new Date().toISOString();
  const total=normalized.reduce((sum,item)=>sum+item.subtotal,0);
  const statements=[env.DB.prepare('INSERT INTO penjualan (id,user_uid,id_karyawan,nama,tanggal,items,total_nominal,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .bind(id,user.uid,user.profile.id_karyawan||'',user.profile.nama||user.email,tanggal,JSON.stringify(normalized),total,now)];
  for(const stock of stocks){
    const sold=normalized.find(item=>item.menu===stock.menu).qty;
    statements.push(env.DB.prepare('UPDATE inventaris_stok SET jumlah=?,updated_at=? WHERE id=?').bind(stock.jumlah,now,stock.id));
    statements.push(env.DB.prepare('INSERT INTO inventaris_logs (id,waktu,user_uid,nama_user,tipe,nama_barang,jumlah,lokasi) VALUES (?,?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(),now,user.uid,user.profile.nama||user.email,'Penjualan',stock.barang,sold,'Kulkas'));
  }
  await env.DB.batch(statements);
  return reply(request,env,{ok:true,id,total_nominal:total,stocks});
}

async function upsert(env,table,id,data,merge){
  const pk=primary(table),encoded=encode(table,{...data,[pk]:id});
  const keys=Object.keys(encoded); if(!keys.length)throw Object.assign(new Error('Data kosong.'),{status:400});
  const updates=keys.filter(k=>k!==pk);
  const exists=await env.DB.prepare(`SELECT 1 FROM ${table} WHERE ${pk}=?`).bind(id).first();
  if(merge&&exists){
    if(updates.length)await env.DB.prepare(`UPDATE ${table} SET ${updates.map(k=>`${k}=?`).join(', ')} WHERE ${pk}=?`).bind(...updates.map(k=>encoded[k]),id).run();
  }else{
    await env.DB.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')}) ON CONFLICT(${pk}) DO UPDATE SET ${updates.map(k=>`${k}=excluded.${k}`).join(',')}`)
      .bind(...keys.map(k=>encoded[k])).run();
  }
}

async function inventoryTransaction(request,env,user){
  const {lokasi,tipe,items}=await request.json();
  if(!['Kulkas','Brangkas'].includes(lokasi)||!['Deposit','WD','Laporan Masak'].includes(tipe)||!Array.isArray(items)||!items.length)
    return reply(request,env,{error:'Transaksi inventaris tidak valid.'},400);
  const rawItems=items.map(x=>({barang:String(x.barang||'').trim(),jumlah:Number(x.jumlah)}));
  if(rawItems.some(x=>!x.barang||!Number.isInteger(x.jumlah)||x.jumlah<1))return reply(request,env,{error:'Item inventaris tidak valid.'},400);
  const merged=new Map();for(const item of rawItems)merged.set(item.barang,(merged.get(item.barang)||0)+item.jumlah);
  const normalized=[...merged].map(([barang,jumlah])=>({barang,jumlah}));
  const results=[];
  for(const item of normalized){
    const id=`${lokasi.toLowerCase().replace(/\s+/g,'_')}__${item.barang.toUpperCase()}`;
    const row=await env.DB.prepare('SELECT id,jumlah FROM inventaris_stok WHERE lokasi=? AND nama_barang=?').bind(lokasi,item.barang).first();
    const current=Number(row?.jumlah||0),next=current+(tipe==='WD'?-item.jumlah:item.jumlah);
    if(next<0)return reply(request,env,{error:`Stok ${item.barang} tidak mencukupi. Saat ini: ${current}`},409);
    results.push({...item,id:row?.id||id,jumlah:next});
  }
  const now=new Date().toISOString(),statements=[];
  for(const item of results){
    statements.push(env.DB.prepare('INSERT INTO inventaris_stok (id,lokasi,nama_barang,jumlah,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET jumlah=excluded.jumlah,updated_at=excluded.updated_at').bind(item.id,lokasi,item.barang,item.jumlah,now));
    statements.push(env.DB.prepare('INSERT INTO inventaris_logs (id,waktu,user_uid,nama_user,tipe,nama_barang,jumlah,lokasi) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),now,user.uid,user.profile.nama||user.email,tipe,item.barang,item.jumlah===undefined?0:normalized.find(x=>x.barang===item.barang).jumlah,lokasi));
  }
  await env.DB.batch(statements);
  return reply(request,env,{ok:true,stocks:results});
}

async function deleteInventoryLog(request,env,user,id){
  if(user.profile.role!=='admin')return reply(request,env,{error:'Akses admin diperlukan.'},403);
  const log=await env.DB.prepare('SELECT * FROM inventaris_logs WHERE id=?').bind(id).first();
  if(!log)return reply(request,env,{error:'Log barang tidak ditemukan.'},404);
  const stock=await env.DB.prepare('SELECT id,jumlah FROM inventaris_stok WHERE lokasi=? AND nama_barang=?').bind(log.lokasi,log.nama_barang).first();
  const current=Number(stock?.jumlah||0);
  const next=current+(['WD','Penjualan'].includes(log.tipe)?Number(log.jumlah):-Number(log.jumlah));
  if(next<0)return reply(request,env,{error:`Log tidak dapat dihapus karena stok ${log.nama_barang} akan menjadi negatif.`},409);
  const statements=[env.DB.prepare('DELETE FROM inventaris_logs WHERE id=?').bind(id)];
  if(stock)statements.unshift(env.DB.prepare('UPDATE inventaris_stok SET jumlah=?,updated_at=? WHERE id=?').bind(next,new Date().toISOString(),stock.id));
  await env.DB.batch(statements);
  return reply(request,env,{ok:true,lokasi:log.lokasi,nama_barang:log.nama_barang,jumlah:next});
}

async function attendanceTransaction(request,env,user){
  const {action}=await request.json();
  if(!['clockIn','clockOut'].includes(action))return reply(request,env,{error:'Aksi absensi tidak valid.'},400);
  const now=new Date(),iso=now.toISOString(),tanggal=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(now),employee=user.profile.id_karyawan;
  if(action==='clockIn'){
    const open=await env.DB.prepare('SELECT id FROM absensi WHERE id_karyawan=? AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1').bind(employee).first();
    if(open)return reply(request,env,{error:'Masih ada sesi aktif yang belum Clock Out.'},409);
    const id=crypto.randomUUID();
    await env.DB.prepare('INSERT INTO absensi (id,user_uid,id_karyawan,nama,jabatan,tanggal,clock_in,clock_out,total_menit,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(id,user.uid,employee,user.profile.nama,user.profile.jabatan||'',tanggal,iso,null,null,iso).run();
    return reply(request,env,{id,clock_in:iso});
  }
  const open=await env.DB.prepare('SELECT id,clock_in FROM absensi WHERE id_karyawan=? AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1').bind(employee).first();
  if(!open)return reply(request,env,{error:'Tidak ada sesi Clock In aktif.'},409);
  const total=Math.max(0,Math.round((now-new Date(open.clock_in))/60000));
  await env.DB.prepare('UPDATE absensi SET clock_out=?,total_menit=?,updated_at=? WHERE id=?').bind(iso,total,iso,open.id).run();
  return reply(request,env,{id:open.id,clock_out:iso,total_menit:total});
}

async function dataRoute(request,env,user,url){
  const [, , , table, id]=url.pathname.split('/'); assertTable(table);
  const pk=primary(table);
  if(request.method==='GET'&&!id)return reply(request,env,{rows:await listRows(request,env,user,table,url)});
  if(request.method==='GET'){
    const row=decode(table,await env.DB.prepare(`SELECT * FROM ${table} WHERE ${pk}=?`).bind(id).first());
    return reply(request,env,{row});
  }
  const existing=id?decode(table,await env.DB.prepare(`SELECT * FROM ${table} WHERE ${pk}=?`).bind(id).first()):null;
  assertWrite(user,table,request.method,existing);
  if(request.method==='POST'){
    const body=await request.json(),newId=body[pk]||crypto.randomUUID();
    if(['absensi','cuti','penjualan','laporan_masak'].includes(table))body.user_uid??=user.uid;
    await upsert(env,table,newId,body,false);return reply(request,env,{id:newId},201);
  }
  if(request.method==='PUT'){
    const body=await request.json();await upsert(env,table,id,body,body.merge!==false);return reply(request,env,{id});
  }
  if(request.method==='DELETE'){
    await env.DB.prepare(`DELETE FROM ${table} WHERE ${pk}=?`).bind(id).run();return reply(request,env,{ok:true});
  }
  return reply(request,env,{error:'Method not allowed'},405);
}

async function webhookRoute(request,env,user,target){
  const secret=WEBHOOK_SECRETS[target],url=secret&&env[secret];
  if(!url)return reply(request,env,{error:'Webhook belum dikonfigurasi.'},503);
  const payload=await request.json();
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(!response.ok)return reply(request,env,{error:`Discord merespons ${response.status}`},502);
  return reply(request,env,{ok:true});
}

export default {async fetch(request,env){
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors(request,env)});
  const url=new URL(request.url);
  try{
    if(url.pathname==='/api/health'){
      const result=await env.DB.prepare('SELECT 1 AS ok').first();return reply(request,env,{ok:result?.ok===1,service:'mangku-resto-api'});
    }
    const user=await authenticate(request,env);
    if(url.pathname==='/api/me')return reply(request,env,{user:{uid:user.uid,email:user.email,...user.profile}});
    if(url.pathname==='/api/attendance'&&request.method==='POST')return await attendanceTransaction(request,env,user);
    if(url.pathname==='/api/inventory/transaction'&&request.method==='POST')return await inventoryTransaction(request,env,user);
    if(url.pathname==='/api/sales/transaction'&&request.method==='POST')return await salesTransaction(request,env,user);
    if(url.pathname==='/api/sales/ranking'&&request.method==='GET')return await salesRanking(request,env,url);
    if(url.pathname.startsWith('/api/inventory/log/')&&request.method==='DELETE')return await deleteInventoryLog(request,env,user,url.pathname.split('/').pop());
    if(url.pathname.startsWith('/api/data/'))return await dataRoute(request,env,user,url);
    if(url.pathname.startsWith('/api/webhooks/')&&request.method==='POST')return await webhookRoute(request,env,user,url.pathname.split('/').pop());
    return reply(request,env,{error:'Not found'},404);
  }catch(error){console.error(error);return reply(request,env,{error:error.message||'Server error'},error.status||401)}
}};
