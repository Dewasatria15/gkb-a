const express=require("express");
const session=require("express-session");
const SQLiteStore=require("connect-sqlite3")(session);
const bcrypt=require("bcryptjs");
const Database=require("better-sqlite3");
const path=require("path");
const crypto=require("crypto");

const app=express();
const PORT=process.env.PORT||3000;
const db=new Database(process.env.DB_FILE||path.join(__dirname,"gkb_a.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','dosen','mahasiswa')));
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rooms(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS times(id INTEGER PRIMARY KEY AUTOINCREMENT,start TEXT NOT NULL,end TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS faculties(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS lecturers(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,faculty TEXT,study TEXT,identity TEXT);
CREATE TABLE IF NOT EXISTS students(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,nim TEXT,faculty TEXT,study TEXT,year TEXT);
CREATE TABLE IF NOT EXISTS schedules(id INTEGER PRIMARY KEY AUTOINCREMENT,date TEXT NOT NULL,room TEXT NOT NULL,time TEXT NOT NULL,type TEXT NOT NULL,owner TEXT NOT NULL,lecturer TEXT,activity TEXT NOT NULL,person TEXT,phone TEXT,notes TEXT,created_at TEXT NOT NULL);
`);

const seedRooms=["2.1","2.2","2.3","2.5","3.1","3.2","3.3","4.1","4.2","4.3","L4.T"];
const seedTimes=[["07:30","09:10"],["09:10","10:00"],["10:00","12:00"],["13:00","15:00"]];
const seedFac=["Fakultas Teknik","Fakultas Ekonomi dan Bisnis","Fakultas Ilmu Sosial dan Ilmu Politik"];
for(const r of seedRooms) db.prepare("INSERT OR IGNORE INTO rooms(name) VALUES(?)").run(r);
for(const [s,e] of seedTimes) db.prepare("INSERT OR IGNORE INTO times(start,end) VALUES(?,?)").run(s,e);
for(const f of seedFac) db.prepare("INSERT OR IGNORE INTO faculties(name) VALUES(?)").run(f);
if(!db.prepare("SELECT 1 FROM settings WHERE key='title'").get()) {
  const ins=db.prepare("INSERT INTO settings(key,value) VALUES(?,?)");
  ins.run("title","Informasi Peminjaman Ruangan GKB A"); ins.run("admin","Dewa Satria Irawan"); ins.run("phone","0895370767839");
}
if(!db.prepare("SELECT 1 FROM users WHERE username='admin'").get()){
  const ins=db.prepare("INSERT INTO users(username,password_hash,role) VALUES(?,?,?)");
  ins.run("admin",bcrypt.hashSync(process.env.ADMIN_PASSWORD||"admin123",12),"admin");
  ins.run("dosen",bcrypt.hashSync(process.env.DOSEN_PASSWORD||"dosen123",12),"dosen");
  ins.run("mahasiswa",bcrypt.hashSync(process.env.MAHASISWA_PASSWORD||"mhs123",12),"mahasiswa");
}

app.use(express.json({limit:"100kb"}));
app.use(session({
  store:new SQLiteStore({db:"sessions.sqlite",dir:__dirname}),
  secret:process.env.SESSION_SECRET||crypto.randomBytes(32).toString("hex"),
  resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:8*60*60*1000}
}));
app.use(express.static(path.join(__dirname,"public")));

const requireLogin=(req,res,next)=>req.session.user?next():res.status(401).json({error:"Belum login"});
const requireAdmin=(req,res,next)=>req.session.user?.role==="admin"?next():res.status(403).json({error:"Khusus Admin"});
const getSettings=()=>Object.fromEntries(db.prepare("SELECT key,value FROM settings").all().map(x=>[x.key,x.value]));
const validTime=t=>/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(t)&&t.slice(0,5)<t.slice(6);

app.post("/api/login",(req,res)=>{
 const {username,password}=req.body||{}; const u=db.prepare("SELECT * FROM users WHERE username=?").get(username||"");
 if(!u||!bcrypt.compareSync(password||"",u.password_hash)) return res.status(401).json({error:"Username atau password salah"});
 req.session.user={id:u.id,username:u.username,role:u.role}; res.json({user:req.session.user});
});
app.post("/api/logout",(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get("/api/me",(req,res)=>res.json({user:req.session.user||null,settings:getSettings()}));

app.get("/api/data",requireLogin,(req,res)=>res.json({
 rooms:db.prepare("SELECT name FROM rooms ORDER BY name").all().map(x=>x.name),
 times:db.prepare("SELECT id,start,end FROM times ORDER BY start").all().map(x=>({id:x.id,label:`${x.start}-${x.end}`,start:x.start,end:x.end})),
 faculties:db.prepare("SELECT * FROM faculties ORDER BY name").all(),
 lecturers:db.prepare("SELECT * FROM lecturers ORDER BY name").all(),
 students:db.prepare("SELECT * FROM students ORDER BY name").all(),
 schedules:db.prepare("SELECT * FROM schedules ORDER BY date,time,room").all(),
 settings:getSettings()
}));

app.post("/api/schedules",requireAdmin,(req,res)=>{
 const x=req.body||{};
 if(!x.date||!x.room||!x.time||!x.owner||!x.activity) return res.status(400).json({error:"Tanggal, ruangan, jam, peminjam, dan kegiatan wajib diisi"});
 if(!validTime(x.time)||!db.prepare("SELECT 1 FROM rooms WHERE name=?").get(x.room)) return res.status(400).json({error:"Ruangan atau format jam tidak valid"});
 const conflict=db.prepare("SELECT id FROM schedules WHERE date=? AND room=? AND time=? AND id<>?").get(x.date,x.room,x.time,x.id||0);
 if(conflict) return res.status(409).json({error:"Ruangan sudah memiliki jadwal pada tanggal dan jam tersebut"});
 if(x.id) db.prepare(`UPDATE schedules SET date=?,room=?,time=?,type=?,owner=?,lecturer=?,activity=?,person=?,phone=?,notes=? WHERE id=?`).run(x.date,x.room,x.time,x.type||"Fakultas",x.owner,x.lecturer||"",x.activity,x.person||"",x.phone||"",x.notes||"",x.id);
 else db.prepare(`INSERT INTO schedules(date,room,time,type,owner,lecturer,activity,person,phone,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(x.date,x.room,x.time,x.type||"Fakultas",x.owner,x.lecturer||"",x.activity,x.person||"",x.phone||"",x.notes||"",new Date().toISOString());
 res.json({ok:true});
});
app.delete("/api/schedules/:id",requireAdmin,(req,res)=>{db.prepare("DELETE FROM schedules WHERE id=?").run(req.params.id);res.json({ok:true})});

app.post("/api/faculties",requireAdmin,(req,res)=>{try{db.prepare("INSERT INTO faculties(name) VALUES(?)").run(req.body.name.trim());res.json({ok:true})}catch(e){res.status(400).json({error:"Nama sudah ada atau tidak valid"})}});
app.delete("/api/faculties/:id",requireAdmin,(req,res)=>{db.prepare("DELETE FROM faculties WHERE id=?").run(req.params.id);res.json({ok:true})});
app.post("/api/lecturers",requireAdmin,(req,res)=>{let x=req.body; if(!x.name?.trim())return res.status(400).json({error:"Nama wajib"});db.prepare("INSERT INTO lecturers(name,faculty,study,identity) VALUES(?,?,?,?)").run(x.name.trim(),x.faculty||"",x.study||"",x.identity||"");res.json({ok:true})});
app.post("/api/students",requireAdmin,(req,res)=>{let x=req.body;if(!x.name?.trim())return res.status(400).json({error:"Nama wajib"});db.prepare("INSERT INTO students(name,nim,faculty,study,year) VALUES(?,?,?,?,?)").run(x.name.trim(),x.nim||"",x.faculty||"",x.study||"",x.year||"");res.json({ok:true})});

app.post("/api/times",requireAdmin,(req,res)=>{let {start,end}=req.body||{};if(!start||!end||start>=end)return res.status(400).json({error:"Jam tidak valid"});db.prepare("INSERT INTO times(start,end) VALUES(?,?)").run(start,end);res.json({ok:true})});
app.put("/api/times/:id",requireAdmin,(req,res)=>{let {start,end}=req.body||{};if(!start||!end||start>=end)return res.status(400).json({error:"Jam tidak valid"});db.prepare("UPDATE times SET start=?,end=? WHERE id=?").run(start,end,req.params.id);res.json({ok:true})});
app.delete("/api/times/:id",requireAdmin,(req,res)=>{db.prepare("DELETE FROM times WHERE id=?").run(req.params.id);res.json({ok:true})});
app.post("/api/rooms",requireAdmin,(req,res)=>{try{db.prepare("INSERT INTO rooms(name) VALUES(?)").run(req.body.name.trim());res.json({ok:true})}catch(e){res.status(400).json({error:"Ruangan sudah ada atau tidak valid"})}});
app.delete("/api/rooms/:name",requireAdmin,(req,res)=>{db.prepare("DELETE FROM rooms WHERE name=?").run(req.params.name);res.json({ok:true})});
app.put("/api/settings",requireAdmin,(req,res)=>{const allowed=["title","admin","phone"];const tx=db.transaction(o=>{for(const k of allowed)if(o[k]!==undefined)db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(k,String(o[k]))});tx(req.body||{});res.json({ok:true})});

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public/index.html")));
app.listen(PORT,()=>console.log(`GKB A berjalan di port ${PORT}`));
