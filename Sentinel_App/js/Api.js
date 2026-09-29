/* ==========================================================================
   SENTINEL — js/api.js
   Thin client for server/server.js. The app is designed to work fully
   standalone (in-memory demo data, see data.js/app.js) so it always demos
   safely with no setup. This module layers a *real* backend on top of that:

     - On load, SentinelAPI.health() is used to detect whether the backend
       (cd server && npm install && npm start) is running.
     - If it is, app.js persists every report/lead/flag/verification/points
       action to it in the background and shows a "LIVE" badge in the header.
     - If it isn't (or a call fails/times out), every method here resolves
       to { ok: false } instead of throwing, so the UI silently keeps using
       its local, in-memory state. Nothing about the demo ever breaks
       because the backend is absent.

   This keeps the two implementations (client heuristics in fraudEngine.js,
   server heuristics in server/server.js) genuinely in sync in a live demo:
   when the backend is up, its anti-fraud + points logic is the source of
   truth; the client-side version stays as the always-available fallback.
   ========================================================================== */

const SentinelAPI = (() => {
  const BASE = (window.SENTINEL_API_BASE || 'http://localhost:4000') + '/api';
  const TIMEOUT_MS = 2500;

  async function request(path, { method = 'GET', body } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(BASE + path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });
      clearTimeout(timer);
      let data = null;
      try { data = await res.json(); } catch (_) { /* no/invalid JSON body */ }
      if (!res.ok) return { ok: false, status: res.status, error: (data && data.error) || res.statusText, data };
      return { ok: true, status: res.status, data };
    } catch (err) {
      clearTimeout(timer);
      // Network error, timeout, or server simply not running — expected in
      // standalone demo mode, so we fail quietly rather than throwing.
      return { ok: false, status: 0, error: err.name === 'AbortError' ? 'timeout' : 'unreachable' };
    }
  }

  return {
    health: () => request('/health'),
    stats: () => request('/stats'),

    listReports: () => request('/reports'),
    createReport: (payload) => request('/reports', { method: 'POST', body: payload }),
    likeReport: (id, liked) => request(`/reports/${id}/like`, { method: 'POST', body: { liked } }),
    addLead: (id, payload) => request(`/reports/${id}/leads`, { method: 'POST', body: payload }),

    listDrivers: () => request('/fed/drivers'),
    flagDriver: (payload) => request('/fed/drivers/flag', { method: 'POST', body: payload }),

    getWallet: (userId) => request(`/wallet/${encodeURIComponent(userId)}`),
    addPoints: (userId, points) => request(`/wallet/${encodeURIComponent(userId)}/add`, { method: 'POST', body: { points } }),
    strike: (userId) => request(`/wallet/${encodeURIComponent(userId)}/strike`, { method: 'POST' }),

    verify: (payload) => request('/verify', { method: 'POST', body: payload })
  };
})();

