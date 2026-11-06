require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '123456',
  database: process.env.DB_NAME || 'apartment_visitor_management',
  waitForConnections: true, connectionLimit: 10, dateStrings: true
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(session({
  name: 'avms.sid',
  secret: process.env.SESSION_SECRET || 'development-only-change-me',
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 8 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));

const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const requireAuth = (req, res, next) => req.session.user ? next() : res.status(401).json({ error: 'Please sign in.' });
const requireSecurity = (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ error: 'Please sign in.' });
  if (req.session.user.role !== 'security') return res.status(403).json({ error: 'Security staff access required.' });
  next();
};
const validText = (value, max, required = false) => typeof value === 'string' && value.trim().length <= max && (!required || value.trim().length > 0);

async function seedUsers() {
  const [rows] = await pool.query('SELECT COUNT(*) AS n FROM users');
  if (rows[0].n) return;
  const securityHash = await bcrypt.hash('Security@123', 10);
  const residentHash = await bcrypt.hash('Resident@123', 10);
  await pool.execute("INSERT INTO users (username,password_hash,role) VALUES (?,?, 'security')", ['security', securityHash]);
  await pool.execute("INSERT INTO users (username,password_hash,role,resident_id) VALUES (?,?, 'resident',1)", ['aarav@example.com', residentHash]);
  await pool.execute("INSERT INTO users (username,password_hash,role,resident_id) VALUES (?,?, 'resident',2)", ['priya@example.com', residentHash]);
}

app.get('/api/session', (req, res) => res.json({ user: req.session.user || null }));
app.post('/api/login', asyncRoute(async (req, res) => {
  const { username, password } = req.body;
  if (!validText(username, 100, true) || !validText(password, 200, true)) return res.status(400).json({ error: 'Enter username and password.' });
  const [rows] = await pool.execute('SELECT user_id,username,password_hash,role,resident_id FROM users WHERE username=?', [username.trim()]);
  if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash))) return res.status(401).json({ error: 'Invalid username or password.' });
  const u = rows[0];
  req.session.user = { id: u.user_id, username: u.username, role: u.role, residentId: u.resident_id };
  res.json({ user: req.session.user });
}));
app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));

app.get('/api/dashboard', requireAuth, asyncRoute(async (req, res) => {
  const [[r]] = await pool.query('SELECT COUNT(*) total FROM residents');
  const [[v]] = await pool.query('SELECT COUNT(*) total FROM visitors');
  const [[vis]] = await pool.query("SELECT COUNT(*) total, SUM(status='Inside') inside, SUM(status='Exited') exited FROM visits");
  const [recent] = await pool.query(`SELECT vi.visit_id, vi.entry_time, vi.exit_time, vi.status,
    v.name visitor_name, v.phone visitor_phone, v.purpose, r.name resident_name, r.flat_no
    FROM visits vi JOIN visitors v ON v.visitor_id=vi.visitor_id JOIN residents r ON r.resident_id=vi.resident_id
    ORDER BY vi.entry_time DESC LIMIT 8`);
  res.json({ residents: r.total, visitors: v.total, visits: vis.total || 0, inside: vis.inside || 0, exited: vis.exited || 0, recent });
}));

app.get('/api/residents', requireSecurity, asyncRoute(async (req,res) => {
  const q = `%${String(req.query.q || '').trim()}%`;
  const [rows] = await pool.execute('SELECT * FROM residents WHERE name LIKE ? OR flat_no LIKE ? OR phone LIKE ? ORDER BY flat_no', [q,q,q]);
  res.json(rows);
}));
app.post('/api/residents', requireSecurity, asyncRoute(async (req,res) => {
  const {name,flat_no,phone,email}=req.body;
  if (!validText(name,100,true) || !validText(flat_no,20,true) || !validText(phone||'',15) || !validText(email||'',100)) return res.status(400).json({error:'Check resident fields.'});
  const [result] = await pool.execute('INSERT INTO residents (name,flat_no,phone,email) VALUES (?,?,?,?)',[name.trim(),flat_no.trim(),phone||null,email||null]);
  res.status(201).json({resident_id:result.insertId});
}));
app.put('/api/residents/:id', requireSecurity, asyncRoute(async (req,res) => {
  const {name,flat_no,phone,email}=req.body;
  if (!validText(name,100,true) || !validText(flat_no,20,true) || !validText(phone||'',15) || !validText(email||'',100)) return res.status(400).json({error:'Check resident fields.'});
  const [r]=await pool.execute('UPDATE residents SET name=?,flat_no=?,phone=?,email=? WHERE resident_id=?',[name.trim(),flat_no.trim(),phone||null,email||null,req.params.id]);
  if(!r.affectedRows) return res.status(404).json({error:'Resident not found.'});
  res.json({ok:true});
}));
app.delete('/api/residents/:id', requireSecurity, asyncRoute(async (req,res) => {
  try { const [r]=await pool.execute('DELETE FROM residents WHERE resident_id=?',[req.params.id]); if(!r.affectedRows)return res.status(404).json({error:'Resident not found.'}); res.json({ok:true}); }
  catch(e){ if(e.code==='ER_ROW_IS_REFERENCED_2') return res.status(409).json({error:'Resident has visit records and cannot be deleted.'}); throw e; }
}));

app.get('/api/visitors', requireSecurity, asyncRoute(async (req,res) => {
  const q=`%${String(req.query.q||'').trim()}%`;
  const [rows]=await pool.execute('SELECT * FROM visitors WHERE name LIKE ? OR phone LIKE ? ORDER BY visitor_id DESC',[q,q]); res.json(rows);
}));
app.post('/api/visitors', requireSecurity, asyncRoute(async (req,res) => {
  const {name,phone,vehicle_no,purpose}=req.body;
  if(!validText(name,100,true)||!validText(phone||'',15)||!validText(vehicle_no||'',30)||!validText(purpose,150,true)) return res.status(400).json({error:'Check visitor fields.'});
  const [r]=await pool.execute('INSERT INTO visitors(name,phone,vehicle_no,purpose) VALUES(?,?,?,?)',[name.trim(),phone||null,vehicle_no||null,purpose.trim()]);
  res.status(201).json({visitor_id:r.insertId});
}));
app.put('/api/visitors/:id', requireSecurity, asyncRoute(async (req,res) => {
  const {name,phone,vehicle_no,purpose}=req.body;
  if(!validText(name,100,true)||!validText(phone||'',15)||!validText(vehicle_no||'',30)||!validText(purpose,150,true)) return res.status(400).json({error:'Check visitor fields.'});
  const [r]=await pool.execute('UPDATE visitors SET name=?,phone=?,vehicle_no=?,purpose=? WHERE visitor_id=?',[name.trim(),phone||null,vehicle_no||null,purpose.trim(),req.params.id]);
  if(!r.affectedRows)return res.status(404).json({error:'Visitor not found.'}); res.json({ok:true});
}));
app.delete('/api/visitors/:id', requireSecurity, asyncRoute(async (req,res) => {
  try{const [r]=await pool.execute('DELETE FROM visitors WHERE visitor_id=?',[req.params.id]);if(!r.affectedRows)return res.status(404).json({error:'Visitor not found.'});res.json({ok:true});}
  catch(e){if(e.code==='ER_ROW_IS_REFERENCED_2')return res.status(409).json({error:'Visitor has visit records and cannot be deleted.'});throw e;}
}));

app.get('/api/lookups', requireSecurity, asyncRoute(async(req,res)=>{
  const [residents]=await pool.query('SELECT resident_id,name,flat_no FROM residents ORDER BY flat_no');
  const [visitors]=await pool.query('SELECT visitor_id,name,phone FROM visitors ORDER BY name');
  res.json({residents,visitors});
}));
app.get('/api/visits', requireSecurity, asyncRoute(async(req,res)=>{
  const q=`%${String(req.query.q||'').trim()}%`;
  const [rows]=await pool.execute(`SELECT vi.*,v.name visitor_name,v.phone visitor_phone,v.purpose,r.name resident_name,r.flat_no
    FROM visits vi JOIN visitors v ON v.visitor_id=vi.visitor_id JOIN residents r ON r.resident_id=vi.resident_id
    WHERE v.name LIKE ? OR r.name LIKE ? OR r.flat_no LIKE ? ORDER BY vi.entry_time DESC`,[q,q,q]); res.json(rows);
}));
app.post('/api/visits', requireSecurity, asyncRoute(async(req,res)=>{
  const {visitor_id,resident_id}=req.body;
  if(!Number.isInteger(Number(visitor_id))||!Number.isInteger(Number(resident_id)))return res.status(400).json({error:'Select a visitor and resident.'});
  const [active]=await pool.execute("SELECT visit_id FROM visits WHERE visitor_id=? AND resident_id=? AND status='Inside'",[visitor_id,resident_id]);
  if(active.length)return res.status(409).json({error:'This visitor already has an active visit for this resident.'});
  const [r]=await pool.execute("INSERT INTO visits(visitor_id,resident_id,entry_time,status) VALUES(?,?,NOW(),'Inside')",[visitor_id,resident_id]);
  res.status(201).json({visit_id:r.insertId});
}));
app.post('/api/visits/:id/exit', requireSecurity, asyncRoute(async(req,res)=>{
  const [r]=await pool.execute("UPDATE visits SET exit_time=NOW(),status='Exited' WHERE visit_id=? AND status='Inside'",[req.params.id]);
  if(!r.affectedRows)return res.status(409).json({error:'Visit not found or already exited.'}); res.json({ok:true});
}));
app.get('/api/my-visits', requireAuth, asyncRoute(async(req,res)=>{
  if(req.session.user.role!=='resident'||!req.session.user.residentId)return res.status(403).json({error:'Resident access required.'});
  const q=`%${String(req.query.q||'').trim()}%`;
  const [rows]=await pool.execute(`SELECT vi.visit_id,vi.entry_time,vi.exit_time,vi.status,v.name visitor_name,v.phone visitor_phone,v.purpose
    FROM visits vi JOIN visitors v ON v.visitor_id=vi.visitor_id
    WHERE vi.resident_id=? AND (v.name LIKE ? OR v.purpose LIKE ?) ORDER BY vi.entry_time DESC`,[req.session.user.residentId,q,q]);
  res.json(rows);
}));
app.get('/api/my-profile', requireAuth, asyncRoute(async(req,res)=>{
  if(req.session.user.role!=='resident')return res.status(403).json({error:'Resident access required.'});
  const [rows]=await pool.execute('SELECT resident_id,name,flat_no,phone,email FROM residents WHERE resident_id=?',[req.session.user.residentId]);
  if(!rows.length)return res.status(404).json({error:'Profile not found.'}); res.json(rows[0]);
}));

app.get('*', (req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.use((err,req,res,next)=>{ console.error(err); res.status(500).json({error:'Server error. Check database configuration and server logs.'}); });

(async()=>{
  try { await pool.query('SELECT 1'); await seedUsers(); app.listen(PORT,()=>console.log(`AVMS running at http://localhost:${PORT}`)); }
  catch(e){ console.error('Could not connect to MySQL. Import init.sql and check .env.',e.message); process.exit(1); }
})();
