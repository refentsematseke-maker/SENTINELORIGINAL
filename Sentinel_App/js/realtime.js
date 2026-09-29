/* ==========================================================================
   SENTINEL — realtime.js
   Optional real-time layer that lights up ONLY when server/server.js is
   actually running and reachable. It:
     1. Loads live data from the backend instead of the hard-coded demo data.
     2. Opens a Socket.IO connection and listens for live events, so a
        report / lead / driver-flag submitted on ANY connected screen shows
        up instantly on THIS screen too — the thing to point at when
        demonstrating the app "working in real time".
     3. Reroutes the existing submit handlers to also notify the backend,
        so THIS screen's actions show up on every OTHER connected screen.

   If the socket.io client script failed to load, or the server isn't
   running, this whole file quietly does nothing and the app behaves
   exactly like the original fully client-side prototype. Nothing here
   changes any styling, fonts, or colors.
   ========================================================================== */

(function () {
  if (typeof io === 'undefined') return; // socket.io client didn't load (offline / CDN blocked) — stay local-only

  app.live = false;

  const socket = io({ timeout: 2000, reconnectionAttempts: 5, reconnectionDelay: 1000 });

  function setLiveBadge(on, label) {
    const el = document.getElementById('live-badge');
    const txt = document.getElementById('live-badge-text');
    if (!el) return;
    el.style.display = on ? 'inline-flex' : 'none';
    if (txt && label) txt.innerText = label;
  }

  async function loadLiveData() {
    try {
      const [reports, drivers] = await Promise.all([
        fetch('/api/reports').then(r => r.json()),
        fetch('/api/fed/drivers').then(r => r.json())
      ]);
      app.posts = reports.map(r => new CasePost(r));
      app.drivers = drivers.map(d => new FEDDriver(d));
      app.render();
    } catch (err) {
      console.warn('Sentinel: reachable socket but could not load /api data; staying on local demo data.', err);
    }
  }

  /* ---------------------------------------------------------- CONNECTION */
  socket.on('connect', async () => {
    app.live = true;
    setLiveBadge(true, 'LIVE');
    await loadLiveData();
    app.toast('Connected to the live backend. Open this page in another tab or device — actions here now appear there instantly.', 'fa-tower-broadcast');
  });

  socket.on('disconnect', () => {
    app.live = false;
    setLiveBadge(true, 'OFFLINE');
    setTimeout(() => { if (!app.live) setLiveBadge(false); }, 2500);
  });

  socket.on('connect_error', () => {
    app.live = false;
    setLiveBadge(false);
  });

  socket.on('presence', ({ viewers }) => {
    if (app.live) setLiveBadge(true, `LIVE · ${viewers} online`);
  });

  /* -------------------------------------------------------- LIVE EVENTS */
  socket.on('report:new', (report) => {
    if (app.posts.some(p => p.id === report.id)) return;
    app.posts.unshift(new CasePost(report));
    if (app.currentPage !== 'feed') app.navigateTo('feed'); else app.render();
    app.toast(`📡 Live: new report — "${report.title}"`, 'fa-tower-broadcast');
  });

  socket.on('report:lead', ({ reportId, lead }) => {
    const post = app.posts.find(p => p.id === reportId);
    if (!post) return;
    if (post.leads.some(l => l.text === lead.text && l.author === lead.author)) return;
    post.addLead(lead.author, lead.text, lead.verified);
    app.render();
    app.toast(`📡 Live: new lead on "${post.title}"`, 'fa-magnifying-glass');
  });

  socket.on('report:comment', ({ reportId, comment }) => {
    const post = app.posts.find(p => p.id === reportId);
    if (!post) return;
    if (post.comments.some(c => c.text === comment.text && c.author === comment.author)) return;
    post.addComment(comment.author, comment.text);
    app.openComments.add(reportId); // reveal the panel so the new comment is visible immediately
    app.render();
    app.toast(`📡 Live: new comment on "${post.title}"`, 'fa-comment');
  });

  socket.on('driver:flag', (driver) => {
    const existing = app.drivers.find(d => d.id === driver.id || d.plate.toLowerCase() === driver.plate.toLowerCase());
    if (existing) Object.assign(existing, driver);
    else app.drivers.unshift(new FEDDriver(driver));
    app.render();
    app.toast(`📡 Live: driver flag recorded — ${driver.plate}`, 'fa-car-side');
  });

  /* ------------------------------------------------------ SUBMIT REROUTE
     When live, these replace the local-only handlers with versions that
     validate locally (same instant UX) then post to the shared backend.
     The actual card/lead/driver update happens when the broadcast above
     comes back — including to this same tab — which is what keeps every
     connected screen showing identical state. */

  const origReportSubmit = CommunitySafetyApp.prototype.handleReportSubmit;
  CommunitySafetyApp.prototype.handleReportSubmit = function (e) {
    if (!this.live) return origReportSubmit.call(this, e);
    e.preventDefault();

    if (this.user.isSuspended()) {
      this.toast('Account under review after repeated false-report strikes.', 'fa-ban');
      return;
    }

    const cat = document.getElementById('report-category').value;
    const title = document.getElementById('report-title').value;
    const desc = document.getElementById('report-desc').value;
    const location = document.getElementById('report-location').value.trim();
    const idInput = document.getElementById('report-id').value.trim();

    const contentCheck = AntiFraudEngine.checkContent(desc + ' ' + title);
    if (!contentCheck.isValid) {
      this.toast(`Anti-fraud check flagged this report: ${contentCheck.reasons[0] || 'low confidence content'}`, 'fa-triangle-exclamation');
      return;
    }

    const fullDesc = location ? `${desc} | Area: ${location}` : desc;
    const verified = idInput.length > 0;

    fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: Date.now(), title, category: cat, description: fullDesc, verifiedId: verified, role: this.pendingRole })
    })
      .then(r => { if (!r.ok) throw new Error('rejected'); return r.json(); })
      .then(() => {
        this.user.reportsSubmitted++;
        const base = 20;
        const bonus = verified ? base * 2 : 0;
        const awarded = this.user.addPoints(base + bonus);
        this.render();
        // The "report:new" broadcast (received by this tab too) handles
        // adding the card to the feed and the main confirmation toast.
        this.toast(`+${awarded} points awarded${verified ? ' (3x verified-ID bonus)' : ''}.`, 'fa-coins');
      })
      .catch(() => this.toast('Could not reach the live backend — is server/server.js running?', 'fa-triangle-exclamation'));

    this.closeModals();
    e.target.reset();
  };

  const origLeadSubmit = CommunitySafetyApp.prototype.handleLeadSubmit;
  CommunitySafetyApp.prototype.handleLeadSubmit = function (e) {
    if (!this.live) return origLeadSubmit.call(this, e);
    e.preventDefault();

    if (this.user.isSuspended()) {
      this.toast('Detective privileges suspended after repeated strikes.', 'fa-ban');
      return;
    }

    const caseId = parseInt(document.getElementById('lead-case-id').value);
    const text = document.getElementById('lead-text').value;
    const post = this.posts.find(p => p.id === caseId);
    if (!post) return;

    const contentCheck = AntiFraudEngine.checkContent(text);
    const accusation = AntiFraudEngine.evaluateAccusation(text);

    if (!contentCheck.isValid) {
      this.toast('Anti-fraud trace flagged this lead as low-confidence / spam-like.', 'fa-triangle-exclamation');
      return;
    }
    if (accusation.risky) {
      this.user.strikes++;
      this.toast(`Lead held for review: ${accusation.reason} Strike ${this.user.strikes}/3 recorded on your account.`, 'fa-shield-halved');
      this.closeModals();
      this.render();
      return;
    }

    fetch(`/api/reports/${caseId}/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, author: 'Verified Investigator' })
    })
      .then(r => { if (!r.ok) throw new Error('rejected'); return r.json(); })
      .then(() => {
        this.user.leadsSubmitted++;
        const awarded = this.user.addPoints(post.pointsReward);
        this.render();
        this.toast(`+${awarded} points added to your wallet.`, 'fa-coins');
      })
      .catch(() => this.toast('Could not reach the live backend — is server/server.js running?', 'fa-triangle-exclamation'));

    this.closeModals();
    e.target.reset();
  };

  const origFlagSubmit = CommunitySafetyApp.prototype.handleFlagSubmit;
  CommunitySafetyApp.prototype.handleFlagSubmit = function (e) {
    if (!this.live) return origFlagSubmit.call(this, e);
    e.preventDefault();

    const plate = document.getElementById('flag-plate').value.trim();
    const reason = document.getElementById('flag-reason').value.trim();
    const contentCheck = AntiFraudEngine.checkContent(reason);
    if (!contentCheck.isValid) {
      this.toast('Anti-fraud check flagged this driver report as low-confidence.', 'fa-triangle-exclamation');
      return;
    }

    fetch('/api/fed/drivers/flag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plate, reason })
    })
      .then(r => { if (!r.ok) throw new Error('rejected'); return r.json(); })
      .then(() => {
        const awarded = this.user.addPoints(15);
        this.render();
        this.toast(`+${awarded} points awarded.`, 'fa-coins');
      })
      .catch(() => this.toast('Could not reach the live backend — is server/server.js running?', 'fa-triangle-exclamation'));

    this.closeModals();
    e.target.reset();
  };

  const origSubmitComment = CommunitySafetyApp.prototype.submitComment;
  CommunitySafetyApp.prototype.submitComment = function (postId) {
    if (!this.live) return origSubmitComment.call(this, postId);

    const input = document.getElementById(`comment-input-${postId}`);
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    if (this.user.isSuspended()) {
      this.toast('Account under review after repeated false-report strikes.', 'fa-ban');
      return;
    }

    const contentCheck = AntiFraudEngine.checkContent(text);
    if (!contentCheck.isValid) {
      this.toast('Comment blocked by the anti-fraud filter (looks like spam / low-effort).', 'fa-triangle-exclamation');
      return;
    }

    fetch(`/api/reports/${postId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, author: 'You' })
    })
      .then(r => { if (!r.ok) throw new Error('rejected'); return r.json(); })
      .then(() => {
        this.openComments.add(postId);
        // The "report:comment" broadcast (received by this tab too) adds the
        // comment to the card and re-renders, exactly like leads/flags above.
      })
      .catch(() => this.toast('Could not reach the live backend — is server/server.js running?', 'fa-triangle-exclamation'));

    input.value = '';
  };
})();
