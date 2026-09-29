/* ==========================================================================
   SENTINEL — app.js
   Main application controller. Renders pages into #main-view, wires up
   navigation, modals and the demo report/lead/verification/wallet flows.

   This prototype keeps all state in memory on the client (see README for
   why) but is written so the same actions (submitReport, submitLead,
   verifyIdentity, etc.) map 1:1 onto the REST endpoints implemented in
   server/server.js, which is the natural next step to make this real.
   ========================================================================== */

class CommunitySafetyApp {
  constructor() {
    this.user = new UserProfile();
    this.currentPage = 'feed';
    this.casesFilter = 'all';
    this.pendingRole = 'reporter';
    this.posts = DEMO_POSTS.map(p => new CasePost(p));
    this.drivers = DEMO_DRIVERS.map(d => new FEDDriver(d));
    this.openComments = new Set(); // ids of posts whose comment panel is expanded
    this.live = false; // set true by js/realtime.js only if server/server.js is actually reachable

    /* --------------------------------------------------- STAFF PORTAL
       Internal login for the SMU IT/CS graduate staff described in the
       team's founding notes: identity/payout review, AI-tracing &
       accusation review, and evidence hand-off to police. Separate from
       the public/anonymous user above — see renderStaff() below. */
    this.staffUser = null;
    this.staffLoginError = '';
    this.reviewQueue = [];      // risky leads/comments held for staff review
    this.payoutRequests = [];   // wallet cash-out requests awaiting staff approval
    this.verificationQueue = []; // log of identity-verification submissions
    this.evidencePackages = []; // compiled case packages awaiting dispatch to police
    this._idSeq = 1;
  }

  init() {
    this.render();
  }

  /* ---------------------------------------------------------------- NAV */
  navigateTo(pageName) {
    this.currentPage = pageName;
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const primaryNav = ['feed', 'cases', 'fed'].includes(pageName) ? pageName : 'more';
    const activeNav = document.getElementById(`nav-${primaryNav}`);
    if (activeNav) activeNav.classList.add('active');
    document.getElementById('main-view').scrollTo?.(0, 0);
    window.scrollTo(0, 0);
    this.render();
  }

  setCasesFilter(filter) {
    this.casesFilter = filter;
    this.render();
  }

  /* ------------------------------------------------------------- TOAST */
  toast(message, icon = 'fa-circle-check') {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.innerHTML = `<i class="fa-solid ${icon}"></i> ${message}`;
    el.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  /* ------------------------------------------------------------ MODALS */
  openReportModal() { document.getElementById('modal-report').classList.add('active'); }
  openLeadModal(id) {
    document.getElementById('lead-case-id').value = id;
    document.getElementById('modal-lead').classList.add('active');
  }
  openWalletModal() { this.render(); document.getElementById('modal-wallet').classList.add('active'); }
  openVerifyModal() { document.getElementById('modal-verify').classList.add('active'); }
  openFlagModal(plate) {
    document.getElementById('flag-plate').value = plate || '';
    document.getElementById('modal-flag').classList.add('active');
  }
  closeModals() { document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active')); }

  selectRole(role, btn) {
    this.pendingRole = role;
    document.querySelectorAll('.role-option').forEach(el => el.classList.remove('selected'));
    btn.classList.add('selected');
  }

  /* ------------------------------------------------------- LIKE ACTION */
  toggleLike(id) {
    const post = this.posts.find(p => p.id === id);
    if (!post) return;
    post.toggleLike();
    this.render();
  }

  /* ------------------------------------------------------- COMMENTS
     Plain, no-points community discussion on a case — separate from
     "leads" (structured, points-earning investigation info handled by
     handleLeadSubmit below). Comments still pass through the same
     spam/accusation screen so the section can't be used to post risky
     unverified accusations just because it isn't the "official" lead flow. */
  toggleComments(id) {
    if (this.openComments.has(id)) this.openComments.delete(id);
    else this.openComments.add(id);
    this.render();
  }

  submitComment(postId) {
    const input = document.getElementById(`comment-input-${postId}`);
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    if (this.user.isSuspended()) {
      this.toast('Account under review after repeated false-report strikes.', 'fa-ban');
      return;
    }

    const post = this.posts.find(p => p.id === postId);
    if (!post) return;

    const contentCheck = AntiFraudEngine.checkContent(text);
    if (!contentCheck.isValid) {
      this.toast('Comment blocked by the anti-fraud filter (looks like spam / low-effort).', 'fa-triangle-exclamation');
      return;
    }

    const accusation = AntiFraudEngine.evaluateAccusation(text);
    if (accusation.risky) {
      this.user.strikes++;
      this.reviewQueue.unshift({
        id: this._idSeq++, type: 'comment', postId: post.id, postTitle: post.title,
        author: 'You', text, reason: accusation.reason, time: 'Just now', status: 'pending'
      });
      this.toast(`Comment held for review: ${accusation.reason} Strike ${this.user.strikes}/3 recorded on your account.`, 'fa-shield-halved');
      this.render();
      return;
    }

    post.addComment('You', text);
    this.openComments.add(postId);
    this.render();
  }

  /* ---------------------------------------------------- REPORT SUBMIT */
  handleReportSubmit(e) {
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

    const related = AntiFraudEngine.findRelated(desc + ' ' + title, this.posts);
    const aiInsight = related.length > 0
      ? `AI matched ${related.length} related report(s), most similar: "${related[0].post.title}".`
      : 'AI found no closely related reports yet — this may be a new pattern.';

    const fullDesc = location ? `${desc} | Area: ${location}` : desc;
    const verified = idInput.length > 0;

    const newPost = new CasePost({
      id: Date.now(),
      author: 'Anonymous Reporter',
      smuVerified: false,
      role: this.pendingRole,
      title,
      category: cat,
      description: fullDesc,
      image: null,
      status: 'pending',
      pointsReward: 40,
      aiInsight,
      verifiedId: verified,
      likes: 0,
      leads: []
    });

    this.posts.unshift(newPost);
    this.user.reportsSubmitted++;
    const base = 20;
    const bonus = verified ? base * 2 : 0; // "3x bonus" when a verification ID is supplied (base + 2x bonus = 3x)
    const awarded = this.user.addPoints(base + bonus);
    this.closeModals();
    e.target.reset();
    this.navigateTo('feed');
    this.toast(`Report posted to the feed. +${awarded} points awarded${verified ? ' (3x verified-ID bonus applied)' : ''}.`, 'fa-circle-check');
  }

  /* ------------------------------------------------------- LEAD SUBMIT */
  handleLeadSubmit(e) {
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
      this.reviewQueue.unshift({
        id: this._idSeq++, type: 'lead', postId: post.id, postTitle: post.title,
        author: 'You', text, reason: accusation.reason, time: 'Just now', status: 'pending'
      });
      this.toast(`Lead held for review: ${accusation.reason} Strike ${this.user.strikes}/3 recorded on your account.`, 'fa-shield-halved');
      this.closeModals();
      this.render();
      return;
    }

    post.addLead('Verified Investigator', text, true);
    this.user.leadsSubmitted++;
    const awarded = this.user.addPoints(post.pointsReward);
    this.closeModals();
    e.target.reset();
    this.render();
    this.toast(`Lead submitted! +${awarded} points added to your wallet.`, 'fa-magnifying-glass');
  }

  /* -------------------------------------------------------- FED FLAG */
  handleFlagSubmit(e) {
    e.preventDefault();
    const plate = document.getElementById('flag-plate').value.trim();
    const reason = document.getElementById('flag-reason').value.trim();
    const contentCheck = AntiFraudEngine.checkContent(reason);
    if (!contentCheck.isValid) {
      this.toast('Anti-fraud check flagged this driver report as low-confidence.', 'fa-triangle-exclamation');
      return;
    }
    let driver = this.drivers.find(d => d.plate.toLowerCase() === plate.toLowerCase());
    if (driver) {
      driver.flags += 1;
      driver.risk = Math.min(100, driver.risk + 6);
    } else {
      driver = new FEDDriver({ id: Date.now(), plate, service: 'Unverified', reason, flags: 1, risk: 20 });
      this.drivers.unshift(driver);
    }
    const awarded = this.user.addPoints(15);
    this.closeModals();
    e.target.reset();
    this.render();
    this.toast(`Driver flag recorded. +${awarded} points awarded.`, 'fa-car-side');
  }

  /* ---------------------------------------------------- ID VERIFICATION */
  handleVerifySubmit(e) {
    e.preventDefault();
    const docType = document.getElementById('verify-doc-type').value;
    const docNumber = document.getElementById('verify-doc-number').value.trim();
    if (docNumber.length < 5) {
      this.toast('Document reference looks too short to verify.', 'fa-triangle-exclamation');
      return;
    }
    if (!this.user.verificationDocs.includes(docType)) {
      this.user.verificationDocs.push(docType);
    }
    this.user.idVerified = true;
    this.verificationQueue.unshift({
      id: this._idSeq++, docType, docNumber, submittedBy: 'You', time: 'Just now', status: 'auto-approved (simulated check)'
    });
    const awarded = this.user.addPoints(10);
    this.closeModals();
    e.target.reset();
    this.render();
    this.toast(`${docType} verified (simulated). Trust score increased. +${awarded} points.`, 'fa-id-card');
  }

  preparePoliceEvidence() {
    const caseRef = 'SNT-' + Math.floor(100000 + Math.random() * 899999);
    this.evidencePackages.unshift({
      id: this._idSeq++, caseRef, compiledBy: 'You', reportCount: this.posts.length,
      time: 'Just now', status: 'pending'
    });
    this.toast(`Evidence package compiled as case ${caseRef} — queued for staff review before dispatch.`, 'fa-file-circle-check');
  }

  requestCashOut() {
    const points = this.user.points;
    const amountZar = (points * 0.5).toFixed(2);
    this.payoutRequests.unshift({
      id: this._idSeq++, requestedBy: 'You', points, amountZar,
      tier: this.user.tier().name, time: 'Just now', status: 'pending'
    });
    this.closeModals();
    this.toast(`Cash-out request for R${amountZar} submitted — queued for staff approval (simulation only; no real payment provider is connected).`, 'fa-wallet');
  }

  /* Tapped from a tier-card in the Business page — those cards look
     selectable (icon, name, styling) so a tap should surface something,
     even though rank is earned automatically from points rather than
     chosen by the user. */
  showTierInfo(tierId) {
    const t = TIERS.find(x => x.id === tierId);
    if (!t) return;
    const isCurrent = this.user.tier().id === tierId;
    const gap = t.min - this.user.points;
    const status = isCurrent
      ? "This is your current rank."
      : gap > 0
        ? `${gap} more point${gap === 1 ? '' : 's'} to reach this rank.`
        : "You already qualify for this rank or higher.";
    this.toast(`${t.name} (${t.min}+ pts): ${t.perk} ${status}`, 'fa-medal');
  }

  emergencyCall() {
    this.toast('For immediate danger, contact your local emergency number directly (e.g. 10111 in South Africa). This button is a UI demo only.', 'fa-phone');
  }

  addPoints(pts) { return this.user.addPoints(pts); }

  /* =====================================================================
     STAFF PORTAL — internal login for the SMU IT/CS graduate staff roles
     described in the team's founding notes: identity/payout review,
     AI-tracing & accusation review, and compiling evidence for police
     hand-off. This is a small hardcoded demo login (see DEMO_STAFF in
     data.js), not a real auth system — flagged as such in the UI.
     ===================================================================== */
  handleStaffLogin(e) {
    e.preventDefault();
    const username = document.getElementById('staff-username').value.trim();
    const password = document.getElementById('staff-password').value;
    const match = DEMO_STAFF.find(s => s.username === username && s.password === password);
    if (!match) {
      this.staffLoginError = 'Incorrect username or password.';
      this.render();
      return;
    }
    this.staffUser = match;
    this.staffLoginError = '';
    this.render();
    this.toast(`Welcome back, ${match.name.split(' ')[0]}.`, 'fa-user-shield');
  }

  staffLogout() {
    this.staffUser = null;
    this.render();
    this.toast('Signed out of the Staff Portal.', 'fa-right-from-bracket');
  }

  staffResolveReview(id, action) {
    const item = this.reviewQueue.find(r => r.id === id);
    if (!item) return;
    item.status = action === 'clear' ? 'cleared (false positive)' : 'strike upheld';
    if (action === 'clear' && this.user.strikes > 0) {
      this.user.strikes--; // clearing a false-positive removes the strike it caused
    }
    this.render();
    this.toast(action === 'clear' ? 'Flagged content cleared — strike removed from the account.' : 'Strike upheld on review.', 'fa-shield-halved');
  }

  staffDecidePayout(id, decision) {
    const req = this.payoutRequests.find(r => r.id === id);
    if (!req) return;
    req.status = decision === 'approve' ? 'approved' : 'denied';
    this.render();
    this.toast(decision === 'approve' ? `Payout of R${req.amountZar} approved (simulated).` : 'Payout request denied.', 'fa-wallet');
  }

  staffDispatchEvidence(id) {
    const pkg = this.evidencePackages.find(e => e.id === id);
    if (!pkg) return;
    pkg.status = 'sent';
    pkg.dispatchedBy = this.staffUser.name;
    this.render();
    this.toast(`Case ${pkg.caseRef} marked as dispatched (simulated — no live SAPS connection exists).`, 'fa-paper-plane');
  }

  /* =====================================================================
     AI ANTI-FRAUD / DUPLICATE ENGINE — LIVE, VISIBLE DEMONSTRATION
     Everything below just calls the exact same AntiFraudEngine used to
     silently gate submissions elsewhere in this file (see fraudEngine.js)
     and renders its live output, so the "AI verifying whether it's a
     false report" isn't a black box — you can watch it score text as you
     type, both here in the submission modals and on the dedicated
     AI Fraud & Duplicate Detector page (More > AI Fraud Detector).
     ===================================================================== */

  aiCheckSnippet(text, { includeAccusation = false } = {}) {
    const check = AntiFraudEngine.checkContent(text);
    const badgeClass = check.score > 70 ? 'badge-green' : check.score > 40 ? 'badge-gold' : 'badge-red';
    const verdictIcon = check.isValid ? 'fa-circle-check' : 'fa-triangle-exclamation';
    const verdictText = check.isValid ? 'Looks credible' : 'Flagged — would be blocked';

    let html = `
      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:6px;">
        <i class="fa-solid fa-robot" style="color:var(--ig-purple);"></i>
        <strong style="font-size:.78rem;">AI content screen:</strong>
        <span class="badge ${badgeClass}"><i class="fa-solid ${verdictIcon}"></i> ${verdictText} · ${check.score}/100</span>
      </div>
      <div class="trust-meter" style="margin:0 0 6px;"><div class="trust-meter-fill" style="width:${check.score}%;"></div></div>
      ${check.reasons.length
        ? `<ul style="padding-left:16px; margin:0; font-size:.72rem; color:var(--text-muted); line-height:1.5;">${check.reasons.map(r => `<li>${r}</li>`).join('')}</ul>`
        : `<p style="font-size:.72rem; color:var(--text-muted); margin:0;">No spam / low-effort patterns detected.</p>`}
    `;

    if (includeAccusation) {
      const acc = AntiFraudEngine.evaluateAccusation(text);
      html += `
        <div style="margin-top:8px; padding-top:8px; border-top:1px dashed var(--border-color);">
          <strong style="font-size:.72rem;">Unverified-accusation screen:</strong>
          <span class="badge ${acc.risky ? 'badge-red' : 'badge-green'}" style="margin-left:4px;">
            <i class="fa-solid ${acc.risky ? 'fa-triangle-exclamation' : 'fa-shield-halved'}"></i> ${acc.risky ? 'Risky language' : 'Clear'}
          </span>
          ${acc.reason ? `<p style="font-size:.72rem; color:var(--text-muted); margin-top:4px;">${acc.reason}</p>` : ''}
        </div>
      `;
    }
    return html;
  }

  /* Live preview wired to the "Details & Clues" field in the report modal. */
  updateReportAiPreview() {
    const titleEl = document.getElementById('report-title');
    const descEl = document.getElementById('report-desc');
    const el = document.getElementById('report-ai-preview');
    if (!el || !titleEl || !descEl) return;
    const text = `${titleEl.value} ${descEl.value}`.trim();
    if (!text) { el.style.display = 'none'; return; }
    el.style.display = 'flex';
    el.style.flexDirection = 'column';
    el.innerHTML = this.aiCheckSnippet(text);
  }

  /* Live preview wired to the detective-lead textarea. */
  updateLeadAiPreview() {
    const textEl = document.getElementById('lead-text');
    const el = document.getElementById('lead-ai-preview');
    if (!el || !textEl) return;
    const text = textEl.value.trim();
    if (!text) { el.style.display = 'none'; return; }
    el.style.display = 'flex';
    el.style.flexDirection = 'column';
    el.innerHTML = this.aiCheckSnippet(text, { includeAccusation: true });
  }

  /* Live preview wired to the FED driver-flag reason field. */
  updateFlagAiPreview() {
    const textEl = document.getElementById('flag-reason');
    const el = document.getElementById('flag-ai-preview');
    if (!el || !textEl) return;
    const text = textEl.value.trim();
    if (!text) { el.style.display = 'none'; return; }
    el.style.display = 'flex';
    el.style.flexDirection = 'column';
    el.innerHTML = this.aiCheckSnippet(text);
  }

  /* Fills the AI Fraud & Duplicate Detector page textarea with a preset
     example so the three outcome types (credible / spam / risky
     accusation) can be demonstrated with one click each. */
  loadAiExample(kind) {
    const examples = {
      legit: 'Two students witnessed a man attempting to force open a side door near Block C at approximately 23:40. Security was notified immediately and the individual left on foot heading toward Church Street.',
      spam: "lol just kidding this is fake, test test, ignore this",
      accusation: "I am 100% sure it was him, I know its my neighbour, someone should attack him, his address is 12 Oak Street."
    };
    const el = document.getElementById('ai-demo-input');
    if (!el) return;
    el.value = examples[kind] || '';
    this.updateAiDemo();
  }

  /* Drives the standalone AI Fraud & Duplicate Detector page: client-side
     verdict (instant), duplicate-report matching against the live feed,
     and — when the real backend (server/server.js) is connected — the
     same text re-checked by the actual server, to show this isn't just
     client-side theatre that a modified client could skip. */
  updateAiDemo() {
    const inputEl = document.getElementById('ai-demo-input');
    const text = inputEl ? inputEl.value : '';

    const resultEl = document.getElementById('ai-demo-result');
    if (resultEl) resultEl.innerHTML = this.aiCheckSnippet(text, { includeAccusation: true });

    const relatedEl = document.getElementById('ai-demo-related');
    if (relatedEl) {
      const related = text.trim() ? AntiFraudEngine.findRelated(text, this.posts, 0.12).slice(0, 4) : [];
      relatedEl.innerHTML = related.length
        ? related.map(r => `
            <div class="info-row">
              <i class="fa-solid fa-link"></i>
              <div><strong>${Math.round(r.score * 100)}% word-overlap match</strong><p>${r.post.title}</p></div>
            </div>`).join('')
        : `<p class="card-desc" style="margin-bottom:0;">No matching reports in the current feed yet — try pasting text similar to one of the cards on the Home feed.</p>`;
    }

    const serverEl = document.getElementById('ai-demo-server-result');
    if (serverEl && this.live) {
      clearTimeout(this._aiServerTimer);
      serverEl.innerHTML = `<span style="color:var(--text-muted); font-size:.78rem;"><i class="fa-solid fa-spinner fa-spin"></i> checking with the live server…</span>`;
      this._aiServerTimer = setTimeout(() => {
        fetch('/api/ai/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        })
          .then(r => r.json())
          .then(result => {
            const badgeClass = result.score > 70 ? 'badge-green' : result.score > 40 ? 'badge-gold' : 'badge-red';
            serverEl.innerHTML = `
              <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                <i class="fa-solid fa-server" style="color:var(--ig-purple);"></i>
                <span class="badge ${badgeClass}"><i class="fa-solid ${result.isValid ? 'fa-circle-check' : 'fa-triangle-exclamation'}"></i> ${result.isValid ? 'Valid' : 'Flagged'} · ${result.score}/100</span>
              </div>
              <p class="card-desc" style="margin-bottom:0;">${result.related && result.related.length ? `Server independently found ${result.related.length} related report(s) in its own database.` : 'Server found no related reports.'}</p>
            `;
          })
          .catch(() => { serverEl.innerHTML = `<span style="color:var(--danger); font-size:.78rem;">Could not reach the server.</span>`; });
      }, 350);
    }
  }

  /* =====================================================================
     RENDER
     ===================================================================== */
  render() {
    const container = document.getElementById('main-view');
    const u = this.user;
    document.getElementById('user-points').innerText = u.points;

    if (this.currentPage === 'feed') container.innerHTML = this.renderFeed();
    else if (this.currentPage === 'cases') container.innerHTML = this.renderCases();
    else if (this.currentPage === 'fed') container.innerHTML = this.renderFED();
    else if (this.currentPage === 'ai-demo') container.innerHTML = this.renderAiDemo();
    else if (this.currentPage === 'resources') container.innerHTML = this.renderResources();
    else if (this.currentPage === 'about') container.innerHTML = this.renderAbout();
    else if (this.currentPage === 'police') container.innerHTML = this.renderPolice();
    else if (this.currentPage === 'profile') container.innerHTML = this.renderProfile();
    else if (this.currentPage === 'security') container.innerHTML = this.renderSecurity();
    else if (this.currentPage === 'business') container.innerHTML = this.renderBusiness();
    else if (this.currentPage === 'staff') container.innerHTML = this.renderStaff();
    else if (this.currentPage === 'more') container.innerHTML = this.renderMore();

    if (this.currentPage === 'ai-demo') this.updateAiDemo(); // populate the live panels on arrival
  }

  renderAiDemo() {
    return `
      <section class="page-intro">
        <h1><i class="fa-solid fa-robot"></i> AI Fraud & Duplicate Detector</h1>
        <p>This is the real anti-fraud engine that screens every report, lead and driver flag elsewhere in the app (<code>js/fraudEngine.js</code>) — not a mockup. Type or paste text below and watch it get scored live, exactly as it happens behind the scenes when you submit something.</p>
      </section>

      <div class="pill-row" style="margin-bottom:2px;">
        <button class="category-pill" onclick="app.loadAiExample('legit')">✅ Try a credible report</button>
        <button class="category-pill" onclick="app.loadAiExample('spam')">🚫 Try spam text</button>
        <button class="category-pill" onclick="app.loadAiExample('accusation')">⚠️ Try a risky accusation</button>
      </div>

      <div class="card"><div class="card-body">
        <h3 class="section-title">Text to screen</h3>
        <textarea class="form-control" id="ai-demo-input" rows="4" placeholder="Type a report description here and watch the panels below update as you type..." oninput="app.updateAiDemo()">Suspicious white Toyota Corolla has been parked outside the residence gate for two hours with its engine running.</textarea>
        <p class="form-hint">Nothing here is sent anywhere unless the live backend is connected (see the server panel below) — this runs entirely in your browser.</p>
      </div></div>

      <div class="card"><div class="card-body">
        <h3 class="section-title">Client-side verdict <span style="font-weight:600; color:var(--text-muted); font-size:.68rem; text-transform:none;">— instant, runs in your browser</span></h3>
        <div id="ai-demo-result"></div>
      </div></div>

      <div class="card"><div class="card-body">
        <h3 class="section-title">Duplicate / related-report match</h3>
        <p class="section-subtitle" style="margin-bottom:8px;">Jaccard word-overlap similarity scored against every report currently in the feed — the same logic behind the "AI Traced Pattern" note shown on case cards.</p>
        <div id="ai-demo-related" class="info-list"></div>
      </div></div>

      <div class="card"><div class="card-body">
        <h3 class="section-title"><i class="fa-solid fa-server"></i> Server-side verdict <span style="font-weight:600; color:var(--text-muted); font-size:.68rem; text-transform:none;">— the authoritative check a client can't bypass</span></h3>
        ${this.live
          ? `<div id="ai-demo-server-result"><span style="color:var(--text-muted); font-size:.78rem;">Waiting for input…</span></div>`
          : `<p class="card-desc" style="margin-bottom:0;">Not connected. Run the live backend to see this exact text independently re-checked by <code>server/server.js</code>:</p><pre style="font-size:.72rem; background:var(--bg-input); padding:10px 12px; border-radius:var(--radius-sm); overflow-x:auto; margin-top:8px;">cd server && npm install && npm start</pre>`}
      </div></div>

      <div class="info-list">
        <div class="info-row"><i class="fa-solid fa-code"></i><div><strong>Where to find the code</strong><p><code>js/fraudEngine.js</code> (client, used above), <code>server/server.js</code> (server, the authority), <code>cpp/fraud_engine.cpp</code> (standalone C++ port) — all three implement the same scoring rules.</p></div></div>
      </div>
    `;
  }

  renderFeed() {
    const u = this.user;
    return `
      <section class="page-intro">
        <h1>Community Safety Network</h1>
        <p>A central place to report concerns, discover active cases, share useful information and learn about community safety.</p>
      </section>

      <div class="story-bar">
        <div class="story-item add-story" onclick="app.openReportModal()">
          <div class="story-ring"><div class="story-ring-inner"><i class="fa-solid fa-plus" style="color:var(--ig-pink);"></i></div></div>
          <span>New report</span>
        </div>
        ${this.posts.filter(p => p.status === 'active_detective').slice(0, 6).map(p => `
          <div class="story-item" onclick="app.openLeadModal(${p.id})">
            <div class="story-ring"><div class="story-ring-inner">${p.categoryMeta().icon ? `<i class="fa-solid ${p.categoryMeta().icon}" style="font-size:1rem;color:var(--ig-purple);"></i>` : ''}</div></div>
            <span>${p.title}</span>
          </div>
        `).join('')}
      </div>

      <div class="stat-grid">
        <div class="stat-box"><strong>${this.posts.length}</strong><span>Community cases</span></div>
        <div class="stat-box"><strong>${this.posts.filter(p => p.status === 'active_detective').length}</strong><span>Active investigations</span></div>
        <div class="stat-box"><strong>${u.points}</strong><span>Your points</span></div>
        <div class="stat-box"><strong>${u.tier().name.split(' ')[0]}</strong><span>Your rank</span></div>
      </div>

      <div class="quick-grid">
        <button class="quick-action" onclick="app.openReportModal()">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <strong>Report an Incident</strong>
          <span>Crime, missing person, lost property or transport safety.</span>
        </button>
        <button class="quick-action" onclick="app.navigateTo('cases')">
          <i class="fa-solid fa-magnifying-glass"></i>
          <strong>Explore Cases</strong>
          <span>Review active community cases and available clues.</span>
        </button>
        <button class="quick-action" onclick="app.navigateTo('fed')">
          <i class="fa-solid fa-car-side"></i>
          <strong>FED: Flag a Driver</strong>
          <span>Report unsafe e-hailing drivers or vehicles.</span>
        </button>
        <button class="quick-action" onclick="app.navigateTo('security')">
          <i class="fa-solid fa-shield-halved"></i>
          <strong>Trust & Security</strong>
          <span>How we verify people and catch false reports.</span>
        </button>
        <button class="quick-action" onclick="app.navigateTo('ai-demo')">
          <i class="fa-solid fa-robot"></i>
          <strong>Try the AI Fraud Detector</strong>
          <span>See the false-report / spam-screening AI score text live.</span>
        </button>
      </div>

      <h2 class="section-title">Latest Community Reports</h2>
      ${this.posts.map(p => p.renderCardHTML(this.openComments.has(p.id))).join('')}
    `;
  }

  renderCases() {
    const filters = [{ id: 'all', label: 'All active' }, ...CATEGORIES];
    let list = this.posts.filter(p => p.status === 'active_detective');
    if (this.casesFilter !== 'all') list = list.filter(p => p.category === this.casesFilter);

    return `
      <section class="page-intro">
        <h1>Detective & Community Cases</h1>
        <p>Explore cases opened for community information. Share only what you genuinely believe is relevant — never confront anyone or publish private information.</p>
      </section>

      <div class="pill-row">
        ${filters.map(f => `<button class="category-pill ${this.casesFilter === f.id ? 'active' : ''}" onclick="app.setCasesFilter('${f.id}')">${f.label}</button>`).join('')}
      </div>

      ${list.length ? list.map(p => p.renderCardHTML(this.openComments.has(p.id))).join('') : '<div class="card"><div class="card-body"><p class="card-desc">No active cases in this category right now.</p></div></div>'}

      <div class="card"><div class="card-body">
        <h3 class="card-title">How community investigation works</h3>
        <div class="info-list">
          <div class="info-row"><i class="fa-solid fa-1"></i><div><strong>Review</strong><p>Read the report carefully and separate facts from assumptions.</p></div></div>
          <div class="info-row"><i class="fa-solid fa-2"></i><div><strong>Share useful information</strong><p>Add relevant observations, documents or leads without exposing private information.</p></div></div>
          <div class="info-row"><i class="fa-solid fa-3"></i><div><strong>Moderation & AI screening</strong><p>Every lead runs through the anti-fraud engine before being shown as a verified lead.</p></div></div>
        </div>
      </div></div>
    `;
  }

  renderFED() {
    return `
      <section class="page-intro">
        <h1><i class="fa-solid fa-car-side"></i> FED — Flagging of E-Hailing Drivers</h1>
        <p>Look up flagged vehicles or report an unsafe e-hailing driver near campus. Especially built for students relying on Uber and Bolt.</p>
      </section>

      <div class="stat-grid">
        <div class="stat-box"><strong>${this.drivers.length}</strong><span>Flagged vehicles</span></div>
        <div class="stat-box"><strong>${this.drivers.reduce((s, d) => s + d.flags, 0)}</strong><span>Total flags filed</span></div>
      </div>

      <button class="btn-submit" onclick="app.openFlagModal('')"><i class="fa-solid fa-flag"></i> Flag a driver / vehicle</button>

      <h2 class="section-title" style="margin-top:4px;">Recently flagged</h2>
      <div style="display:flex; flex-direction:column; gap:10px;">
        ${this.drivers.map(d => d.renderCardHTML()).join('')}
      </div>

      <div class="card"><div class="card-body">
        <h3 class="section-title">How FED risk scores work</h3>
        <p class="card-desc">Each flag nudges a vehicle's risk score upward. Multiple independent flags from different accounts, in a short time window, weigh more heavily than repeated flags from one account — the same anti-abuse logic used for case reports.</p>
      </div></div>
    `;
  }

  renderResources() {
    return `
      <section class="page-intro">
        <h1>Safety Resources</h1>
        <p>Practical information for reporting incidents, protecting yourself and using Sentinel responsibly.</p>
      </section>

      <div class="card"><div class="card-body">
        <h3 class="section-title">Immediate danger</h3>
        <p class="section-subtitle">If someone is in immediate danger, contact the appropriate emergency service directly. Sentinel is not a replacement for emergency response.</p>
        <button class="btn-submit" onclick="app.emergencyCall()"><i class="fa-solid fa-phone"></i> Emergency Guidance (10111)</button>
      </div></div>

      <div class="card"><div class="card-body">
        <h3 class="section-title">Reporting guidelines</h3>
        <div class="info-list">
          <div class="info-row"><i class="fa-solid fa-check"></i><div><strong>Be factual</strong><p>Describe only what you personally know or observed, and flag any uncertainty.</p></div></div>
          <div class="info-row"><i class="fa-solid fa-user-shield"></i><div><strong>Protect privacy</strong><p>Never post private addresses, passwords, identity documents or unnecessary personal information.</p></div></div>
          <div class="info-row"><i class="fa-solid fa-ban"></i><div><strong>Do not accuse without evidence</strong><p>A report is an allegation until properly verified — false accusations carry strikes and consequences.</p></div></div>
          <div class="info-row"><i class="fa-solid fa-hand"></i><div><strong>Do not confront suspects</strong><p>Never put yourself or others at risk while trying to investigate a case.</p></div></div>
        </div>
      </div></div>

      <div class="card"><div class="card-body">
        <h3 class="section-title">Frequently Asked Questions</h3>
        <div class="faq-item"><strong>Can I report anonymously?</strong><p>Yes — the prototype supports anonymous reporting, with an optional ID verification step for a points bonus and higher trust score.</p></div>
        <div class="faq-item"><strong>Are reports automatically confirmed?</strong><p>No. Reports are treated as unverified until moderation or official verification takes place.</p></div>
        <div class="faq-item"><strong>What happens if I submit a false report?</strong><p>It's recorded as a strike against your account. Three strikes suspends detective/reporting privileges pending review.</p></div>
      </div></div>
    `;
  }

  renderAbout() {
    return `
      <section class="page-intro">
        <h1>About Sentinel</h1>
        <p>Sentinel is a community safety concept connecting responsible reporting, useful information and safer communities in one platform.</p>
      </section>

      <div class="card"><div class="card-body">
        <h3 class="section-title">Our purpose</h3>
        <p class="card-desc">Give communities a structured place to report concerns, find relevant cases and contribute information that assists responsible, lawful investigation — turning passive observers into responsible participants.</p>
        <div class="info-list">
          <div class="info-row"><i class="fa-solid fa-bullhorn"></i><div><strong>Report</strong><p>Make it easy to submit structured community safety reports.</p></div></div>
          <div class="info-row"><i class="fa-solid fa-people-group"></i><div><strong>Connect</strong><p>Bring related information together instead of leaving it scattered.</p></div></div>
          <div class="info-row"><i class="fa-solid fa-shield-halved"></i><div><strong>Protect</strong><p>Build safety and privacy into the design, not as an afterthought.</p></div></div>
          <div class="info-row"><i class="fa-solid fa-scale-balanced"></i><div><strong>Responsible participation</strong><p>Encourage evidence-based reporting while discouraging vigilantism and false accusations.</p></div></div>
        </div>
      </div></div>

      <div class="card"><div class="card-body">
        <h3 class="section-title">What Sentinel is not</h3>
        <p class="card-desc">Sentinel is not a police service, court, or emergency dispatch centre, and it should never be used to identify, accuse or confront a person based only on a community post.</p>
      </div></div>
    `;
  }

  renderPolice() {
    const reporters = this.posts.filter(p => p.role === 'reporter').length;
    const compilers = this.posts.filter(p => p.role === 'compiler').length;
    return `
      <section class="page-intro">
        <h1><i class="fa-solid fa-building-shield"></i> Authorities & Evidence</h1>
        <p>A structured area for organising community reports before lawful submission to the appropriate authorities.</p>
      </section>

      <div class="card"><div class="card-body">
        <h3 class="section-title">Two contributor roles</h3>
        <p class="card-desc">The platform splits community participation into two roles that feed into the same evidence pipeline.</p>
        <div class="info-list">
          <div class="info-row"><i class="fa-solid fa-bullhorn"></i><div><strong>Reporters (${reporters})</strong><p>File the original incident, missing-person, lost-property or safety report.</p></div></div>
          <div class="info-row"><i class="fa-solid fa-folder-tree"></i><div><strong>Evidence Compilers (${compilers})</strong><p>Review related reports and leads, cross-reference them, and assemble a structured case file.</p></div></div>
        </div>
      </div></div>

      <div class="card"><div class="card-body">
        <h3 class="section-title">Evidence workflow</h3>
        <div class="info-list">
          <div class="info-row"><i class="fa-solid fa-file-lines"></i><div><strong>1. Collect</strong><p>Keep the original report and every supporting lead together.</p></div></div>
          <div class="info-row"><i class="fa-solid fa-check-double"></i><div><strong>2. Review</strong><p>Separate confirmed information from unverified claims and speculation.</p></div></div>
          <div class="info-row"><i class="fa-solid fa-file-export"></i><div><strong>3. Prepare & send</strong><p>Compile a structured summary; internal staff review and dispatch it to the appropriate authority via the Staff Portal.</p></div></div>
        </div>
        <button class="btn-submit" onclick="app.preparePoliceEvidence()"><i class="fa-solid fa-file-circle-check"></i> Compile Evidence Package</button>
      </div></div>

      <div class="police-panel">
        <h4 style="margin-bottom:6px;">Important</h4>
        <p style="font-size:.78rem;color:#4a4a55;line-height:1.5;">This prototype does not create a live connection to SAPS or any other authority. A production integration would require formal approval, secure APIs and legal/privacy controls. Compiled packages sit in a staff-only review queue (Staff Portal) until an internal team member dispatches them — no package is auto-sent.</p>
      </div>
    `;
  }

  renderProfile() {
    const u = this.user;
    const tier = u.tier();
    const trust = u.trustScore();
    return `
      <section class="page-intro">
        <h1>Your Profile</h1>
        <p>Manage your community participation, verification status and points.</p>
      </section>

      <div class="card"><div class="card-body">
        <div class="avatar" style="margin-bottom:10px; width:52px; height:52px; font-size:1.2rem;">U</div>
        <h3 class="card-title">Community Member ${u.idVerified ? '<i class="fa-solid fa-badge-check verified-check"></i>' : ''}</h3>
        <p class="card-desc">Reports can be submitted anonymously. Verification and moderation happen before allegations are treated as fact.</p>
        <div class="stat-grid">
          <div class="stat-box"><strong>${u.points}</strong><span>Points balance</span></div>
          <div class="stat-box"><strong>${u.reportsSubmitted}</strong><span>Reports filed</span></div>
          <div class="stat-box"><strong>${u.leadsSubmitted}</strong><span>Leads contributed</span></div>
          <div class="stat-box"><strong>${tier.multiplier}x</strong><span>${tier.name}</span></div>
        </div>
        <button class="btn-submit" onclick="app.openWalletModal()"><i class="fa-solid fa-wallet"></i> Open Wallet</button>
        ${!u.idVerified ? `<button class="btn-submit outline" onclick="app.openVerifyModal()"><i class="fa-solid fa-id-card"></i> Verify My Identity</button>` : ''}
      </div></div>

      <div class="card"><div class="card-body">
        <h3 class="section-title">Trust score</h3>
        <div class="trust-meter"><div class="trust-meter-fill" style="width:${trust}%;"></div></div>
        <p class="card-desc" style="margin-bottom:0;">${trust}/100 — based on ID verification, contribution history and any strikes on your account.</p>
      </div></div>

      <div class="card"><div class="card-body">
        <h3 class="section-title">False-accusation strikes</h3>
        <p class="section-subtitle" style="margin-bottom:8px;">Three strikes suspends reporting/detective privileges pending manual review.</p>
        <div class="strike-row"><div class="strike-dot ${u.strikes >= 1 ? 'filled' : ''}"></div><div class="strike-dot ${u.strikes >= 2 ? 'filled' : ''}"></div><div class="strike-dot ${u.strikes >= 3 ? 'filled' : ''}"></div>
        <span style="font-size:.78rem; color:var(--text-muted); margin-left:6px;">${u.strikes}/3 strikes${u.isSuspended() ? ' — account under review' : ''}</span></div>
      </div></div>
    `;
  }

  renderSecurity() {
    const u = this.user;
    return `
      <section class="page-intro">
        <h1><i class="fa-solid fa-shield-halved"></i> Trust & Security Center</h1>
        <p>How Sentinel tries to keep the platform trustworthy: identity checks, an internal security team, AI-assisted pattern tracing, and real consequences for abuse.</p>
      </section>

      <div class="card"><div class="card-body">
        <h3 class="section-title">Identity verification</h3>
        <p class="card-desc">Reports can stay anonymous to the public feed, but the account behind them can optionally be verified with more than one form of ID (e.g. Student ID + National ID) for a trust-score boost and a 3x points bonus on that report.</p>
        <div class="info-list">
          <div class="info-row"><i class="fa-solid fa-id-card"></i><div><strong>Multi-document verification</strong><p>Supports more than a single ID type, reducing the chance of one leaked or fake document passing the check.</p></div></div>
          <div class="info-row"><i class="fa-solid fa-user-secret"></i><div><strong>Public anonymity, internal accountability</strong><p>The public sees "Anonymous Reporter"; an internal, access-controlled identifier still exists to prevent repeated abuse.</p></div></div>
        </div>
        ${!u.idVerified ? `<button class="btn-submit" onclick="app.openVerifyModal()"><i class="fa-solid fa-id-card"></i> Verify Identity</button>` : `<p class="badge badge-green" style="margin-top:6px;"><i class="fa-solid fa-check"></i> Identity verified</p>`}
      </div></div>

      <div class="card"><div class="card-body">
        <h3 class="section-title">Internal security team</h3>
        <p class="card-desc">A dedicated internal security & trust team (planned at 11 people for the full platform) is responsible for account security, breach response and stopping the platform itself from being hacked or misused from within.</p>
      </div></div>

      <div class="card"><div class="card-body">
        <h3 class="section-title">AI-assisted fraud tracing</h3>
        <p class="card-desc">Every report, lead and comment passes through the anti-fraud engine (client-side heuristic here; see <code>fraudEngine.js</code> and <code>cpp/fraud_engine.cpp</code>) which screens for spam patterns, cross-references related reports, and looks for language associated with unverified certainty or false accusation.</p>
        <button class="btn-submit outline" onclick="app.navigateTo('ai-demo')"><i class="fa-solid fa-robot"></i> Try it live</button>
      </div></div>

      <div class="card"><div class="card-body">
        <h3 class="section-title">Consequences for false accusations</h3>
        <p class="card-desc">Contributions flagged as risky or later confirmed false are recorded as strikes. Repeated strikes suspend a user's reporting/detective privileges and remove them from the payout-eligible pool — reviewed by internal staff in the <button class="linklike" onclick="app.navigateTo('staff')" style="background:none;border:none;color:var(--ig-purple);font-weight:700;cursor:pointer;padding:0;">Staff Portal</button>, the mechanism the team calls "who gets paid on what."</p>
      </div></div>
    `;
  }

  renderBusiness() {
    return `
      <section class="page-intro">
        <h1><i class="fa-solid fa-chart-line"></i> Business Model & Growth</h1>
        <p>How the platform sustains itself beyond the hackathon — summarised from the team's founding notes.</p>
      </section>

      <h2 class="section-title">Promotional / rank tiers</h2>
      <div class="tier-grid">
        ${TIERS.map(t => `
          <div class="tier-card ${this.user.tier().id === t.id ? 'current' : ''}" style="cursor:pointer;" onclick="app.showTierInfo('${t.id}')" title="Tap for tier details">
            <i class="fa-solid ${t.icon} tier-icon" style="color:var(--ig-purple);"></i>
            <div class="tier-name">${t.name}</div>
            <div class="tier-req">${t.min}+ points</div>
            <div class="tier-perk">${t.perk}</div>
          </div>
        `).join('')}
      </div>

      <div class="card"><div class="card-body">
        <h3 class="section-title">Revenue streams</h3>
        <div class="info-list">
          <div class="info-row"><i class="fa-solid fa-star"></i><div><strong>Premium subscriptions</strong><p>An optional subscriber tier for faster case visibility, extra alerts, and premium safety tools.</p></div></div>
          <div class="info-row"><i class="fa-solid fa-hand-holding-dollar"></i><div><strong>Investor-backed growth</strong><p>Early growth capital funds the reward pool and verification/security team ahead of subscription revenue scaling.</p></div></div>
          <div class="info-row"><i class="fa-solid fa-medal"></i><div><strong>Competitive rewards</strong><p>The team's goal is to offer a materially better contributor reward rate than comparable government/community incentive schemes.</p></div></div>
        </div>
      </div></div>

      <div class="card"><div class="card-body">
        <h3 class="section-title">Team composition</h3>
        <p class="card-desc">Verification, IT and moderation roles are earmarked for computer science / IT graduates (e.g. SMU graduates), reflected in-app as the "SMU Verified" contributor badge shown on trusted case posts.</p>
      </div></div>
    `;
  }

  /* =====================================================================
     STAFF PORTAL PAGE
     Internal-only area for the SMU IT/CS graduate staff roles described
     in the team's founding notes: reviewing AI-flagged accusations,
     approving payouts, and dispatching compiled evidence to police.
     Gated behind handleStaffLogin() above — see DEMO_STAFF in data.js
     for the demo credentials shown on the login screen.
     ===================================================================== */
  renderStaff() {
    if (!this.staffUser) return this.renderStaffLogin();
    return this.renderStaffDashboard();
  }

  renderStaffLogin() {
    return `
      <section class="page-intro">
        <h1><i class="fa-solid fa-user-shield"></i> Staff Portal</h1>
        <p>Internal login for verification, payout and evidence-review staff — not part of the public app.</p>
      </section>

      <div class="card"><div class="card-body">
        <h3 class="section-title">Staff sign-in</h3>
        ${this.staffLoginError ? `<p class="badge badge-red" style="margin-bottom:10px;"><i class="fa-solid fa-triangle-exclamation"></i> ${this.staffLoginError}</p>` : ''}
        <form onsubmit="app.handleStaffLogin(event)">
          <div class="form-group">
            <label>Username</label>
            <input type="text" class="form-control" id="staff-username" placeholder="e.g. k.mahlangu" required>
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" class="form-control" id="staff-password" placeholder="••••••••" required>
          </div>
          <button type="submit" class="btn-submit"><i class="fa-solid fa-right-to-bracket"></i> Sign In</button>
        </form>
      </div></div>

      <div class="card"><div class="card-body">
        <h3 class="section-title">Demo credentials (for judges/testers)</h3>
        <p class="card-desc">This is a small hardcoded login list for the prototype, not a production auth system — see <code>DEMO_STAFF</code> in <code>js/data.js</code>. Try any of these:</p>
        <div class="info-list">
          ${DEMO_STAFF.map(s => `
            <div class="info-row"><i class="fa-solid fa-id-badge"></i><div><strong>${s.username}</strong> / ${s.password}<p>${s.name} — ${s.role} (${s.title})</p></div></div>
          `).join('')}
        </div>
      </div></div>
    `;
  }

  renderStaffDashboard() {
    const s = this.staffUser;
    const pendingReview = this.reviewQueue.filter(r => r.status === 'pending');
    const pendingPayouts = this.payoutRequests.filter(r => r.status === 'pending');
    const pendingEvidence = this.evidencePackages.filter(e => e.status === 'pending');

    return `
      <section class="page-intro">
        <h1><i class="fa-solid fa-user-shield"></i> Staff Portal</h1>
        <p>Signed in as an internal staff member — this area does not appear anywhere in the public app.</p>
      </section>

      <div class="card"><div class="card-body">
        <div class="avatar" style="margin-bottom:10px; width:52px; height:52px; font-size:1.2rem;">${s.name.charAt(0)}</div>
        <h3 class="card-title">${s.name} <span class="smu-badge"><i class="fa-solid fa-graduation-cap"></i> ${s.title}</span></h3>
        <p class="card-desc">Role: ${s.role}</p>
        <div class="stat-grid">
          <div class="stat-box"><strong>${pendingReview.length}</strong><span>Flags to review</span></div>
          <div class="stat-box"><strong>${pendingPayouts.length}</strong><span>Payouts pending</span></div>
          <div class="stat-box"><strong>${pendingEvidence.length}</strong><span>Evidence to dispatch</span></div>
          <div class="stat-box"><strong>${this.verificationQueue.length}</strong><span>Verifications logged</span></div>
        </div>
        <button class="btn-submit outline" onclick="app.staffLogout()"><i class="fa-solid fa-right-from-bracket"></i> Sign Out</button>
      </div></div>

      <div class="card"><div class="card-body">
        <h3 class="section-title"><i class="fa-solid fa-robot"></i> AI-Tracing & Accusation Review</h3>
        <p class="card-desc">Leads and comments the anti-fraud engine flagged as risky/unverified-certainty language, held back from public display. Clearing a false positive removes the strike it caused; upholding it keeps the strike on the contributor's account.</p>
        ${pendingReview.length === 0 ? `<p class="comment-empty">No items waiting for review.</p>` : this.reviewQueue.map(r => `
          <div class="queue-item">
            <div><strong>${r.type === 'lead' ? 'Lead' : 'Comment'}</strong> on "${r.postTitle}" — <span style="color:var(--text-muted);">${r.time}</span></div>
            <p style="margin:4px 0;">${r.text}</p>
            <p style="font-size:.74rem; color:var(--danger);">Flag reason: ${r.reason}</p>
            ${r.status === 'pending' ? `
              <div class="queue-actions">
                <button class="btn-mini green" onclick="app.staffResolveReview(${r.id}, 'clear')"><i class="fa-solid fa-check"></i> Clear (false positive)</button>
                <button class="btn-mini red" onclick="app.staffResolveReview(${r.id}, 'uphold')"><i class="fa-solid fa-ban"></i> Uphold strike</button>
              </div>
            ` : `<p class="badge ${r.status.includes('cleared') ? 'badge-green' : 'badge-red'}">${r.status}</p>`}
          </div>
        `).join('')}
      </div></div>

      <div class="card"><div class="card-body">
        <h3 class="section-title"><i class="fa-solid fa-money-bill-wave"></i> Payout Approvals</h3>
        <p class="card-desc">The system that decides who gets paid on what: cash-out requests against the simulated wallet, gated behind staff sign-off before any (simulated) payment goes out.</p>
        ${this.payoutRequests.length === 0 ? `<p class="comment-empty">No cash-out requests yet.</p>` : this.payoutRequests.map(r => `
          <div class="queue-item">
            <div><strong>R${r.amountZar}</strong> (${r.points} pts, ${r.tier} tier) — <span style="color:var(--text-muted);">${r.time}</span></div>
            ${r.status === 'pending' ? `
              <div class="queue-actions">
                <button class="btn-mini green" onclick="app.staffDecidePayout(${r.id}, 'approve')"><i class="fa-solid fa-check"></i> Approve</button>
                <button class="btn-mini red" onclick="app.staffDecidePayout(${r.id}, 'deny')"><i class="fa-solid fa-xmark"></i> Deny</button>
              </div>
            ` : `<p class="badge ${r.status === 'approved' ? 'badge-green' : 'badge-red'}">${r.status}</p>`}
          </div>
        `).join('')}
      </div></div>

      <div class="card"><div class="card-body">
        <h3 class="section-title"><i class="fa-solid fa-building-shield"></i> Evidence Dispatch to Police</h3>
        <p class="card-desc">Packages compiled from the Authorities & Evidence page. Only staff can mark a package as dispatched — this is still a simulation with no live SAPS connection.</p>
        ${this.evidencePackages.length === 0 ? `<p class="comment-empty">No evidence packages compiled yet.</p>` : this.evidencePackages.map(pkg => `
          <div class="queue-item">
            <div><strong>${pkg.caseRef}</strong> — ${pkg.reportCount} reports on file — <span style="color:var(--text-muted);">${pkg.time}</span></div>
            ${pkg.status === 'pending' ? `
              <div class="queue-actions">
                <button class="btn-mini green" onclick="app.staffDispatchEvidence(${pkg.id})"><i class="fa-solid fa-paper-plane"></i> Dispatch to Police</button>
              </div>
            ` : `<p class="badge badge-green">Sent by ${pkg.dispatchedBy}</p>`}
          </div>
        `).join('')}
      </div></div>

      <div class="card"><div class="card-body">
        <h3 class="section-title"><i class="fa-solid fa-id-card"></i> Verification Log</h3>
        <p class="card-desc">Read-only record of identity-verification submissions (currently auto-approved by the simulated document check on the public side).</p>
        ${this.verificationQueue.length === 0 ? `<p class="comment-empty">No verifications submitted yet.</p>` : this.verificationQueue.map(v => `
          <div class="queue-item">
            <div><strong>${v.docType}</strong> — ref ${v.docNumber} — <span style="color:var(--text-muted);">${v.time}</span></div>
            <p class="badge badge-green">${v.status}</p>
          </div>
        `).join('')}
      </div></div>
    `;
  }

  renderMore() {
    return `
      <section class="page-intro">
        <h1>More</h1>
        <p>Explore the wider Sentinel platform.</p>
      </section>

      <div class="quick-grid">
        <button class="quick-action" onclick="app.navigateTo('about')"><i class="fa-solid fa-circle-info"></i><strong>About Us</strong><span>Mission, purpose and future direction.</span></button>
        <button class="quick-action" onclick="app.navigateTo('resources')"><i class="fa-solid fa-book-open"></i><strong>Safety Resources</strong><span>Guidelines, FAQs and responsible use.</span></button>
        <button class="quick-action" onclick="app.navigateTo('police')"><i class="fa-solid fa-building-shield"></i><strong>Authorities & Evidence</strong><span>Reporter / compiler roles and case packages.</span></button>
        <button class="quick-action" onclick="app.navigateTo('security')"><i class="fa-solid fa-shield-halved"></i><strong>Trust & Security</strong><span>Verification, anti-fraud and consequences.</span></button>
        <button class="quick-action" onclick="app.navigateTo('ai-demo')"><i class="fa-solid fa-robot"></i><strong>AI Fraud Detector</strong><span>Live demo: watch the anti-fraud AI score text.</span></button>
        <button class="quick-action" onclick="app.navigateTo('profile')"><i class="fa-solid fa-user"></i><strong>My Profile</strong><span>Participation, trust score and points.</span></button>
        <button class="quick-action" onclick="app.navigateTo('business')"><i class="fa-solid fa-chart-line"></i><strong>Business Model</strong><span>Tiers, revenue and team structure.</span></button>
        <button class="quick-action" onclick="app.navigateTo('staff')"><i class="fa-solid fa-user-shield"></i><strong>Staff Portal</strong><span>Internal login for verification, payout & evidence review staff.</span></button>
      </div>

      <div class="card"><div class="card-body">
        <h3 class="section-title">Platform principles</h3>
        <div class="info-list">
          <div class="info-row"><i class="fa-solid fa-lock"></i><div><strong>Privacy</strong><p>Collect only what's needed for a legitimate safety purpose.</p></div></div>
          <div class="info-row"><i class="fa-solid fa-gavel"></i><div><strong>Lawful use</strong><p>Community reporting never replaces authorised law-enforcement process.</p></div></div>
          <div class="info-row"><i class="fa-solid fa-flag"></i><div><strong>Moderation</strong><p>False, malicious or harmful content is screened before it spreads.</p></div></div>
        </div>
      </div></div>
    `;
  }
}

const app = new CommunitySafetyApp();
window.onload = () => app.init();
