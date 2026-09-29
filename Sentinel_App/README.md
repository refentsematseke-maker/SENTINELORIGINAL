# Sentinel — Community Safety Network (Hackathon Prototype)

An Instagram-style community safety feed: anonymous reporting, a crowdsourced
"Detective" investigation layer, an open community comment section on every
case, a points/wallet reward system, an E-Hailing Driver flagging tool
(FED), identity verification, and an anti-fraud / AI-tracing layer to
discourage false reports.

Each case card has **two distinct interaction layers**: "leads" are
structured, points-earning contributions of information meant to help
investigate the case (via the "Investigate" button); "comments" are a plain,
no-points, Instagram-style discussion thread on the post itself (via the
comment icon), for reactions, questions and general community chatter. Both
pass through the same anti-fraud content screen.

There is also a separate **Staff Portal** (More → Staff Portal) for the
internal SMU IT/CS graduate staff roles: reviewing AI-flagged
accusations/leads, approving wallet cash-out requests, and dispatching
compiled evidence packages to police. It's a small hardcoded demo login
(see `DEMO_STAFF` in `js/data.js`; demo credentials are also shown on the
login screen itself) — not a production auth system.

## Quick start — static demo (no install)

The front-end works as a static site on its own — no build step, no install.

1. Open `index.html` directly in a modern browser (double-click it, or use
   VS Code's "Live Server" / "Open with Live Preview" extension for the best
   experience, since it needs internet access for Google Fonts / Font Awesome
   / demo images).
2. That's it — the app runs entirely client-side with demo data baked in.

## Quick start — LIVE real-time demo (recommended for showing the app off)

This runs the real backend (`server/server.js`): a REST API + Socket.IO,
so you can open the app in two or more browser tabs/devices and watch
actions in one appear instantly in the others — no refresh.

```bash
cd server
npm install
npm start
```

Then:
1. Open `http://localhost:4000` in a browser tab. A green **LIVE** badge
   appears in the header once it connects (also shows how many tabs/devices
   are currently connected).
2. Open `http://localhost:4000` again in a second tab (or on another device
   on the same Wi-Fi, using your machine's local IP instead of `localhost`).
3. In tab A, submit a report (or a detective lead, or flag a driver/plate).
   It appears in tab B within a fraction of a second — that's the thing to
   point at when demonstrating "real time."

If the server isn't running, opening `index.html`/`http://localhost:4000`
still works exactly like the static demo above — the app detects the
backend is unreachable and quietly falls back to local-only demo data.

## Project structure

```
Sentinel_App/
├── index.html            Page structure / shell only
├── css/
│   └── styles.css        All visual styling (bright, Instagram-style theme)
├── js/
│   ├── data.js            Seed/demo data (categories, tiers, posts, drivers) — also required by server.js
│   ├── models.js           OOP classes: CasePost (leads + comments), FEDDriver, UserProfile
│   ├── fraudEngine.js       Client-side anti-fraud / duplicate-detection heuristic
│   ├── app.js               Main controller: routing, rendering, event handlers
│   └── realtime.js          Real-time layer: connects to server.js if it's running, else no-ops
├── server/
│   ├── server.js          Node/Express REST API + Socket.IO real-time backend (in-memory store)
│   └── package.json
├── cpp/
│   ├── fraud_engine.cpp   Standalone C++ port of the anti-fraud algorithm
│   └── README.md
└── README.md              This file
```

## Why three implementations of the anti-fraud logic?

The same keyword-screening + duplicate-detection algorithm appears three
times on purpose, to different depths:

| Layer | File | Role |
|---|---|---|
| Client (what runs in the demo) | `js/fraudEngine.js` | Instant feedback in the browser UI |
| Server (the "real" authority) | `server/server.js` | Where this check should actually live in production, since a client can be edited or bypassed |
| Algorithmic core | `cpp/fraud_engine.cpp` | A fast, dependency-free reference implementation, useful if this ever needs to run as a high-throughput scoring service |

This is explained in more depth, including likely judge questions and
honest answers, in `Sentinel_Documentation_and_Judge_QA.docx`.

## Running the backend

See "Quick start — LIVE real-time demo" above. In short:

```bash
cd server
npm install
npm start
```

The server also hosts the front-end itself at `http://localhost:4000` (see
the endpoint list at the top of `server/server.js`), and broadcasts a
`report:new` / `report:lead` / `driver:flag` event over Socket.IO to every
connected browser tab whenever new data comes in — that's the real-time
sync. Data is in-memory and resets on restart; swap `db` in `server.js` for
a real database for production.

## Running the C++ module

```bash
cd cpp
g++ -std=c++17 -O2 -o fraud_engine fraud_engine.cpp
./fraud_engine
```

## What's simulated vs. real in this prototype

Being upfront about this (also covered in the judge Q&A document):

- **Anonymous reporting, feed, cases, FED, points/wallet UI** — fully working
  in the browser with in-memory demo data.
- **AI-assisted tracing** — a real, working rule-based heuristic (keyword
  screening + Jaccard text-similarity duplicate detection), not a trained
  machine-learning model. It's built to be swapped for one.
- **Identity ("ID") verification** — the multi-document flow and UI are real;
  the actual document check is simulated (accepts anything long enough), since
  a real eKYC/ID-verification integration needs a licensed third-party
  provider and was out of scope for four days.
- **Payments / cash-out** — simulated wallet only, by design (see the pitch's
  own feasibility section) — no real payment gateway is connected.
- **Police / SAPS integration** — "prepare & send evidence package" generates
  a mock case reference number; there is no live connection to any real
  authority's system.

## Safety & production notes

Before any real deployment this would need: real authentication and
role-based access control, a real database, human moderation workflows,
evidence-integrity guarantees (e.g. hashing/chain-of-custody for uploaded
media), stronger privacy controls, formal report-abuse handling, audit logs,
rate limiting, and a formally negotiated integration with any authority or
payment provider.
