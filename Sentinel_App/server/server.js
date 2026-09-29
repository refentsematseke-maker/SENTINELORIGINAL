/* ==========================================================================
   SENTINEL — server/server.js

   A real backend for the prototype: a REST API plus a Socket.IO real-time
   layer, backed by an in-memory store, seeded from the SAME data used by
   the offline demo (js/data.js) so both stay in sync.

   This is what makes the app demonstrable in real time: run this server,
   then open the app in two (or more) browser tabs / devices. Submitting a
   report, a detective lead, or a driver flag in one tab shows up instantly
   in every other connected tab — no refresh. The front-end (js/realtime.js)
   detects whether this server is reachable; if it isn't, the app quietly
   falls back to its original fully client-side demo mode, so nothing here
   is required for the static prototype to still work.

   Run it with:
     cd server
     npm install
     npm start
   Then open http://localhost:4000 in two or more browser tabs/devices on
   the same network and try submitting a report in one.

   Endpoints:
     GET    /api/reports              -> list all reports
     POST   /api/reports              -> create a report (runs anti-fraud check, broadcasts live)
     POST   /api/reports/:id/leads    -> add a lead to a report (broadcasts live)
     POST   /api/reports/:id/comments -> add a plain community comment to a report (broadcasts live)
     POST   /api/reports/:id/flag     -> flag content as a false accusation
     GET    /api/wallet/:userId       -> get a demo user's points/tier
     POST   /api/wallet/:userId/add   -> add points (applies tier multiplier)
     POST   /api/verify               -> simulate an identity verification check
     GET    /api/fed/drivers          -> list flagged e-hailing drivers
     POST   /api/fed/drivers/flag     -> flag/raise risk on a driver (broadcasts live)
     POST   /api/ai/check             -> run the anti-fraud/duplicate AI on arbitrary text (used by the live AI demo page)
     GET    /api/live/stats           -> current viewer count + counts (for the demo)

   Real-time events emitted over Socket.IO:
     presence       { viewers }                 — connected client count changed
     report:new     <report>                    — a new report was filed
     report:lead    { reportId, lead }           — a new lead (structured case info) was added
     report:comment { reportId, comment }        — a new plain community comment was added
     driver:flag    <driver>                     — a driver/vehicle was flagged

   Note on leads vs. comments: a "lead" is a points-earning, structured
   contribution of information meant to help investigate the case (still
   screened for risky/unverified-accusation language). A "comment" is plain,
   no-points community discussion on the post itself — closer to a normal
   social-feed comment section — but still passes through the same spam
   filter so the section can't be used to dodge moderation.

   NOTE: In-memory storage means data resets whenever the server restarts.
   Swap `db` below for a real database (Postgres/Mongo/etc.) for production.
   ========================================================================== */

const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { DEMO_POSTS, DEMO_DRIVERS } = require('../js/data.js');

const app = express();
app.use(cors());
app.use(express.json());

// Serve the front-end itself, so the whole demo is just: npm start, then
// open http://localhost:4000 — no separate static server needed.
app.use(express.static(path.join(__dirname, '..')));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

/* ------------------------------------------------------------ IN-MEMORY DB
   Seeded from the exact same data the offline client demo uses, so a fresh
   server and a fresh browser tab show identical starting content. */
const db = {
  reports: JSON.parse(JSON.stringify(DEMO_POSTS)),
  drivers: JSON.parse(JSON.stringify(DEMO_DRIVERS)),
  wallets: { demoUser: { points: 350, strikes: 0 } }
};

const TIER_TABLE = [
  { min: 1500, multiplier: 3, name: 'Platinum (SMU Verified)' },
  { min: 800, multiplier: 2, name: 'Gold Detective' },
  { min: 300, multiplier: 1.5, name: 'Silver Investigator' },
  { min: 0, multiplier: 1, name: 'Bronze Reporter' }
];
function tierFor(points) { return TIER_TABLE.find(t => points >= t.min); }

/* ------------------------------------------------------- ANTI-FRAUD ENGINE
   Same rule-based heuristic as js/fraudEngine.js and cpp/fraud_engine.cpp,
   kept in sync across all three layers deliberately (see DOCUMENTATION.docx
   "Why three implementations?"). Running it server-side too means a client
   can't just skip the check by editing the front-end JavaScript. */
const SUSPICIOUS_KEYWORDS = ['fake', 'prank', 'hoax', 'joke'];
function checkContent(text = '') {
  const lower = text.toLowerCase();
  let score = 100;
  const reasons = [];
  SUSPICIOUS_KEYWORDS.forEach(w => { if (lower.includes(w)) { score -= 40; reasons.push(`flagged phrase: ${w}`); } });
  if (lower.trim().length < 12) { score -= 25; reasons.push('too short'); }
  return { isValid: score > 50, score: Math.max(0, score), reasons };
}

function similarity(a = '', b = '') {
  const setA = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const setB = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  if (!setA.size || !setB.size) return 0;
  let inter = 0;
  setA.forEach(w => { if (setB.has(w)) inter++; });
  return inter / new Set([...setA, ...setB]).size;
}

/* ------------------------------------------------------------ REAL-TIME
   Tracks how many browser tabs/devices are currently connected, and
   broadcasts every meaningful change to all of them. */
let viewers = 0;
io.on('connection', (socket) => {
  viewers++;
  io.emit('presence', { viewers });
  console.log(`[sentinel] client connected (${viewers} online)`);

  socket.on('disconnect', () => {
    viewers = Math.max(0, viewers - 1);
    io.emit('presence', { viewers });
    console.log(`[sentinel] client disconnected (${viewers} online)`);
  });
});

/* --------------------------------------------------------------- ROUTES */
app.get('/api/reports', (req, res) => res.json(db.reports));

app.post('/api/reports', (req, res) => {
  const { title, category, description, role, verifiedId, id } = req.body;
  if (!title || !category || !description) return res.status(400).json({ error: 'title, category and description are required' });

  const check = checkContent(description);
  if (!check.isValid) return res.status(422).json({ error: 'Anti-fraud check failed', reasons: check.reasons });

  const related = db.reports
    .map(r => ({ id: r.id, title: r.title, score: similarity(description, r.description) }))
    .filter(r => r.score > 0.18)
    .sort((a, b) => b.score - a.score);

  const aiInsight = related.length > 0
    ? `AI matched ${related.length} related report(s), most similar: "${related[0].title}".`
    : 'AI found no closely related reports yet — this may be a new pattern.';

  const report = {
    id: id || Date.now(),
    author: 'Anonymous Reporter',
    smuVerified: false,
    role: role || 'reporter',
    title, category, description,
    image: null,
    status: 'pending',
    pointsReward: 40,
    aiInsight,
    verifiedId: !!verifiedId,
    likes: 0,
    relatedReportIds: related.map(r => r.id),
    leads: [],
    comments: []
  };
  db.reports.unshift(report);
  io.emit('report:new', report); // <-- pushes to every connected tab/device instantly
  res.status(201).json(report);
});

app.post('/api/reports/:id/leads', (req, res) => {
  const report = db.reports.find(r => r.id === parseInt(req.params.id));
  if (!report) return res.status(404).json({ error: 'Report not found' });

  const { text, author } = req.body;
  const check = checkContent(text);
  if (!check.isValid) return res.status(422).json({ error: 'Anti-fraud check failed', reasons: check.reasons });

  const lead = { author: author || 'Verified Investigator', text, time: 'Just now', verified: true };
  report.leads.push(lead);
  io.emit('report:lead', { reportId: report.id, lead }); // <-- live push
  res.status(201).json(lead);
});

app.post('/api/reports/:id/comments', (req, res) => {
  const report = db.reports.find(r => r.id === parseInt(req.params.id));
  if (!report) return res.status(404).json({ error: 'Report not found' });

  const { text, author } = req.body;
  const check = checkContent(text);
  if (!check.isValid) return res.status(422).json({ error: 'Anti-fraud check failed', reasons: check.reasons });

  if (!Array.isArray(report.comments)) report.comments = [];
  const comment = { author: author || 'Anonymous', text, time: 'Just now' };
  report.comments.push(comment);
  io.emit('report:comment', { reportId: report.id, comment }); // <-- live push
  res.status(201).json(comment);
});

app.get('/api/wallet/:userId', (req, res) => {
  const wallet = db.wallets[req.params.userId];
  if (!wallet) return res.status(404).json({ error: 'Unknown user' });
  res.json({ ...wallet, tier: tierFor(wallet.points) });
});

app.post('/api/wallet/:userId/add', (req, res) => {
  const wallet = db.wallets[req.params.userId] || (db.wallets[req.params.userId] = { points: 0, strikes: 0 });
  const base = Number(req.body.points) || 0;
  const tier = tierFor(wallet.points);
  const awarded = Math.round(base * tier.multiplier);
  wallet.points += awarded;
  res.json({ awarded, wallet, tier: tierFor(wallet.points) });
});

app.post('/api/verify', (req, res) => {
  const { docType, docNumber } = req.body;
  if (!docType || !docNumber || docNumber.length < 5) {
    return res.status(422).json({ error: 'Invalid or missing verification document' });
  }
  // Simulated verification — a production build would call a licensed
  // identity-verification / eKYC provider here instead of returning true.
  res.json({ verified: true, docType });
});

app.get('/api/fed/drivers', (req, res) => res.json(db.drivers));

app.post('/api/fed/drivers/flag', (req, res) => {
  const { plate, service, reason } = req.body;
  if (!plate || !reason) return res.status(400).json({ error: 'plate and reason are required' });

  const check = checkContent(reason);
  if (!check.isValid) return res.status(422).json({ error: 'Anti-fraud check failed', reasons: check.reasons });

  let driver = db.drivers.find(d => d.plate.toLowerCase() === plate.toLowerCase());
  if (driver) { driver.flags += 1; driver.risk = Math.min(100, driver.risk + 6); }
  else { driver = { id: Date.now(), plate, service: service || 'Unverified', reason, flags: 1, risk: 20 }; db.drivers.unshift(driver); }
  io.emit('driver:flag', driver); // <-- live push
  res.status(201).json(driver);
});

app.get('/api/live/stats', (req, res) => res.json({
  viewers,
  reports: db.reports.length,
  activeCases: db.reports.filter(r => r.status === 'active_detective').length,
  drivers: db.drivers.length
}));

/* Lets the front-end's "AI Fraud & Duplicate Detector" demo page show a
   real, independent server-side verdict alongside the instant client-side
   one — the same checkContent()/similarity() used to gate every report,
   lead and driver flag above, just exposed directly so it can be
   demonstrated without needing to submit anything. */
app.post('/api/ai/check', (req, res) => {
  const text = (req.body && req.body.text) || '';
  const check = checkContent(text);
  const related = db.reports
    .map(r => ({ id: r.id, title: r.title, score: similarity(text, `${r.description} ${r.title}`) }))
    .filter(r => r.score > 0.12)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  res.json({ ...check, related });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Sentinel live demo server on http://localhost:${PORT}  (REST API + Socket.IO real-time)`));

module.exports = app;
