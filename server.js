const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'travelease.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'traveler' CHECK(role IN ('traveler','admin')),
  pwd_claim INTEGER NOT NULL DEFAULT 0,
  accessibility_needs TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS destinations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  nightly_rate INTEGER NOT NULL,
  accessibility_score INTEGER NOT NULL,
  photo TEXT NOT NULL,
  features TEXT NOT NULL DEFAULT '[]',
  description TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  destination_id INTEGER NOT NULL REFERENCES destinations(id),
  check_in TEXT NOT NULL,
  check_out TEXT NOT NULL,
  guests INTEGER NOT NULL,
  pwd_guests INTEGER NOT NULL DEFAULT 0,
  accessibility_notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','declined','cancelled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

const seed = [
[1,'Banaue View Lodge','Banaue, Ifugao',3200,92,'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?auto=format&fit=crop&w=900&q=80',['ramp','toilet'],'A mountain-view stay with selected step-free guest areas. Contact the property to confirm room-level access.'],
[2,'Boracay Coast Retreat','Boracay, Aklan',4800,95,'https://images.unsplash.com/photo-1510414842594-a61c69b5ae57?auto=format&fit=crop&w=900&q=80',['ramp','toilet','hearing'],'A relaxed coastal property with ramp access to shared facilities. Confirm beach access and room details with the host.'],
[3,'Vigan Heritage Inn','Vigan, Ilocos Sur',2600,78,'https://images.unsplash.com/photo-1511818966892-d7d671e672a2?auto=format&fit=crop&w=900&q=80',['visual'],'A heritage-inspired stay. Some historic areas may have steps; ask the property about an accessible route.'],
[4,'Palawan Garden Suites','Puerto Princesa, Palawan',3900,89,'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=900&q=80',['ramp','toilet','visual'],'Garden surroundings and selected accessible common areas. Confirm exact room features and transfer arrangements.'],
[5,'Baguio Pine Haven','Baguio City, Benguet',3500,86,'https://images.unsplash.com/photo-1449158743715-0a90ebb6d2d8?auto=format&fit=crop&w=900&q=80',['ramp','hearing'],'A cool-climate retreat with ramp access to selected facilities. Terrain around the property may be sloped.'],
[6,'Ilocos Seaside Resort','Pagudpud, Ilocos Norte',4200,90,'https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=900&q=80',['ramp','toilet'],'A coastal escape with step-free access in selected areas. Ask about accessible transport and beach routes.']
];
const insertDestination = db.prepare(`INSERT OR IGNORE INTO destinations (id,name,city,nightly_rate,accessibility_score,photo,features,description) VALUES (?,?,?,?,?,?,?,?)`);
for (const d of seed) insertDestination.run(d[0],d[1],d[2],d[3],d[4],d[5],JSON.stringify(d[6]),d[7]);

// Optional first-admin bootstrap. Set ADMIN_EMAIL and ADMIN_PASSWORD in .env before first start.
if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  const adminEmail = process.env.ADMIN_EMAIL.trim().toLowerCase();
  const existingAdmin = db.prepare('SELECT id FROM users WHERE email=? COLLATE NOCASE').get(adminEmail);
  if (!existingAdmin) {
    const adminHash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12);
    db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'admin')").run(process.env.ADMIN_NAME || 'Travelease Admin', adminEmail, adminHash);
    console.log('Initial admin account created.');
  }
}

app.disable('x-powered-by');
// Render and other reverse-proxy hosts terminate HTTPS before requests reach Express.
app.set('trust proxy', 1);
const sessionSecret = process.env.SESSION_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'development-only-secret');
if (!sessionSecret) throw new Error('SESSION_SECRET must be set in production.');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '20kb' }));
app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: DATA_DIR }),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000*60*60*24*7 }
}));
const authLimiter = rateLimit({ windowMs: 15*60*1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });
const bookingLimiter = rateLimit({ windowMs: 60*60*1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });
const safeUser = u => ({ id:u.id, name:u.name, email:u.email, role:u.role, pwdClaim:!!u.pwd_claim, accessibilityNeeds:JSON.parse(u.accessibility_needs || '[]') });
function requireAuth(req,res,next){ if(!req.session.userId) return res.status(401).json({error:'Please log in to continue.'}); next(); }
function requireAdmin(req,res,next){ const u=db.prepare('SELECT role FROM users WHERE id=?').get(req.session.userId); if(!u || u.role!=='admin') return res.status(403).json({error:'Administrator access required.'}); next(); }

app.get('/api/health', (req,res)=>res.json({ok:true,service:'Travelease API'}));
app.get('/api/destinations', (req,res)=>{
 const rows=db.prepare('SELECT * FROM destinations WHERE active=1 ORDER BY id').all();
 res.json(rows.map(x=>({...x,features:JSON.parse(x.features)})));
});
app.get('/api/me',(req,res)=>{
 if(!req.session.userId) return res.json({user:null});
 const user=db.prepare('SELECT * FROM users WHERE id=?').get(req.session.userId);
 res.json({user:user?safeUser(user):null});
});
app.post('/api/auth/register',authLimiter,async(req,res)=>{
 const {name,email,password}=req.body||{};
 if(typeof name!=='string'||name.trim().length<2||name.trim().length>80) return res.status(400).json({error:'Enter a name between 2 and 80 characters.'});
 if(typeof email!=='string'||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:'Enter a valid email address.'});
 if(typeof password!=='string'||password.length<8||password.length>128) return res.status(400).json({error:'Password must be at least 8 characters.'});
 try {
  const hash=await bcrypt.hash(password,12);
  const info=db.prepare('INSERT INTO users(name,email,password_hash) VALUES(?,?,?)').run(name.trim(),email.trim().toLowerCase(),hash);
  req.session.userId=info.lastInsertRowid;
  const user=db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid);
  res.status(201).json({user:safeUser(user)});
 } catch(e){ if(String(e.code).includes('SQLITE_CONSTRAINT')) return res.status(409).json({error:'An account with that email already exists.'}); throw e; }
});
app.post('/api/auth/login',authLimiter,async(req,res)=>{
 const {email,password}=req.body||{};
 if(typeof email!=='string'||typeof password!=='string') return res.status(400).json({error:'Enter your email and password.'});
 const user=db.prepare('SELECT * FROM users WHERE email=? COLLATE NOCASE').get(email.trim());
 if(!user || !(await bcrypt.compare(password,user.password_hash))) return res.status(401).json({error:'Incorrect email or password.'});
 req.session.userId=user.id; res.json({user:safeUser(user)});
});
app.post('/api/auth/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.patch('/api/me',requireAuth,(req,res)=>{
 const {pwdClaim,accessibilityNeeds}=req.body||{};
 if(typeof pwdClaim!=='boolean'||!Array.isArray(accessibilityNeeds)||accessibilityNeeds.length>20||!accessibilityNeeds.every(x=>typeof x==='string'&&x.length<=80)) return res.status(400).json({error:'Invalid profile details.'});
 db.prepare('UPDATE users SET pwd_claim=?, accessibility_needs=? WHERE id=?').run(pwdClaim?1:0,JSON.stringify(accessibilityNeeds),req.session.userId);
 res.json({user:safeUser(db.prepare('SELECT * FROM users WHERE id=?').get(req.session.userId))});
});
app.post('/api/bookings',requireAuth,bookingLimiter,(req,res)=>{
 const {destinationId,checkIn,checkOut,guests,pwdGuests=0,accessibilityNotes=''}=req.body||{};
 const dateRe=/^\d{4}-\d{2}-\d{2}$/;
 if(!Number.isInteger(Number(destinationId))||!dateRe.test(checkIn||'')||!dateRe.test(checkOut||'')) return res.status(400).json({error:'Choose a destination and valid travel dates.'});
 const start=new Date(checkIn+'T00:00:00Z'),end=new Date(checkOut+'T00:00:00Z');
 if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start) return res.status(400).json({error:'Check-out must be after check-in.'});
 if(!Number.isInteger(guests)||guests<1||guests>20||!Number.isInteger(pwdGuests)||pwdGuests<0||pwdGuests>guests) return res.status(400).json({error:'Guest counts are invalid.'});
 if(typeof accessibilityNotes!=='string'||accessibilityNotes.length>1000) return res.status(400).json({error:'Accessibility notes must be 1,000 characters or fewer.'});
 const place=db.prepare('SELECT id FROM destinations WHERE id=? AND active=1').get(destinationId);
 if(!place) return res.status(404).json({error:'Destination not found.'});
 const reference='TE-'+require('crypto').randomBytes(4).toString('hex').toUpperCase();
 const info=db.prepare(`INSERT INTO bookings(reference,user_id,destination_id,check_in,check_out,guests,pwd_guests,accessibility_notes) VALUES(?,?,?,?,?,?,?,?)`).run(reference,req.session.userId,destinationId,checkIn,checkOut,guests,pwdGuests,accessibilityNotes.trim());
 res.status(201).json({booking:{id:info.lastInsertRowid,reference,status:'pending',checkIn,checkOut}});
});
app.get('/api/bookings/mine',requireAuth,(req,res)=>{
 const rows=db.prepare(`SELECT b.id,b.reference,b.check_in,b.check_out,b.guests,b.pwd_guests,b.accessibility_notes,b.status,b.created_at,d.name AS destination,d.city FROM bookings b JOIN destinations d ON d.id=b.destination_id WHERE b.user_id=? ORDER BY b.id DESC`).all(req.session.userId);
 res.json({bookings:rows});
});
app.get('/api/admin/bookings',requireAuth,requireAdmin,(req,res)=>{
 const rows=db.prepare(`SELECT b.*,u.name AS customer_name,u.email,d.name AS destination FROM bookings b JOIN users u ON u.id=b.user_id JOIN destinations d ON d.id=b.destination_id ORDER BY b.id DESC`).all();
 res.json({bookings:rows});
});
app.patch('/api/admin/bookings/:id',requireAuth,requireAdmin,(req,res)=>{
 const {status}=req.body||{};
 if(!['approved','declined','cancelled','pending'].includes(status)) return res.status(400).json({error:'Invalid booking status.'});
 const result=db.prepare('UPDATE bookings SET status=? WHERE id=?').run(status,Number(req.params.id));
 if(!result.changes) return res.status(404).json({error:'Booking not found.'});
 res.json({ok:true});
});
app.get('/api/admin/summary',requireAuth,requireAdmin,(req,res)=>{
 res.json({users:db.prepare('SELECT COUNT(*) AS n FROM users').get().n,bookings:db.prepare('SELECT COUNT(*) AS n FROM bookings').get().n,pending:db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE status='pending'").get().n,destinations:db.prepare('SELECT COUNT(*) AS n FROM destinations WHERE active=1').get().n});
});
app.use(express.static(path.join(__dirname,'public')));
app.use((err,req,res,next)=>{ console.error(err); res.status(500).json({error:'Something went wrong. Please try again.'}); });
app.listen(PORT,()=>console.log(`Travelease running at http://localhost:${PORT}`));
