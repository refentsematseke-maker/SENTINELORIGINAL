/* ==========================================================================
   SENTINEL — models.js
   OOP data models for the prototype. Kept framework-free (vanilla JS classes)
   so the same shapes could be reused almost as-is in server/server.js.
   ========================================================================== */

class CasePost {
  constructor({ id, author, smuVerified, role, title, category, description, image, status, pointsReward, aiInsight, verifiedId, likes, leads, comments }) {
    this.id = id;
    this.author = author;
    this.smuVerified = smuVerified;
    this.role = role || 'reporter'; // 'reporter' (files reports) or 'compiler' (compiles evidence)
    this.title = title;
    this.category = category;
    this.description = description;
    this.image = image;
    this.status = status; // 'pending' | 'active_detective' | 'resolved'
    this.pointsReward = pointsReward;
    this.aiInsight = aiInsight;
    this.verifiedId = !!verifiedId;
    this.likes = likes || 0;
    this.likedByMe = false;
    // Detective "leads" are structured, points-earning contributions of
    // information that helps solve the case (see addLead below).
    this.leads = (leads || []).map(l => ({ ...l }));
    // Plain community "comments" are separate — open discussion/reaction on
    // the post itself, with no points attached, closer to a normal social
    // feed comment section (see addComment below).
    this.comments = (comments || []).map(c => ({ ...c }));
    this.timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  addLead(author, text, verified) {
    this.leads.push({ author, text, time: 'Just now', verified: !!verified });
  }

  addComment(author, text) {
    this.comments.push({ author, text, time: 'Just now' });
  }

  toggleLike() {
    this.likedByMe = !this.likedByMe;
    this.likes += this.likedByMe ? 1 : -1;
  }

  categoryMeta() {
    return CATEGORIES.find(c => c.id === this.category) || { label: this.category, icon: 'fa-flag' };
  }

  statusLabel() {
    if (this.status === 'active_detective') return '🔍 Active Detective';
    if (this.status === 'resolved') return '✅ Resolved';
    return 'Pending Moderation';
  }

  statusClass() {
    if (this.status === 'active_detective') return 'status-active';
    if (this.status === 'resolved') return 'status-resolved';
    return 'status-pending';
  }

  renderCardHTML(commentsOpen = false) {
    const cat = this.categoryMeta();
    return `
      <article class="card" data-post-id="${this.id}">
        <div class="card-header">
          <div class="author-info">
            <div class="avatar">${this.author.charAt(0)}</div>
            <div class="author-details">
              <div class="name">
                ${this.author}
                ${this.smuVerified ? '<span class="smu-badge"><i class="fa-solid fa-circle-check"></i> SMU Verified</span>' : ''}
                ${this.verifiedId ? '<i class="fa-solid fa-badge-check verified-check" title="ID verified"></i>' : ''}
              </div>
              <div class="time">${this.timestamp} • <i class="fa-solid ${cat.icon}"></i> ${cat.label}</div>
            </div>
          </div>
          <span class="status-badge ${this.statusClass()}">${this.statusLabel()}</span>
        </div>

        ${this.image ? `<img src="${this.image}" class="card-media" alt="Case photo" loading="lazy">` : ''}

        <div class="card-body">
          <h3 class="card-title">${this.title}</h3>
          <p class="card-desc">${this.description}</p>

          ${this.aiInsight ? `
            <div class="ai-insight">
              <i class="fa-solid fa-robot"></i>
              <div><strong>AI Traced Pattern:</strong> ${this.aiInsight}</div>
            </div>
          ` : ''}
        </div>

        ${this.leads.length > 0 ? `
          <div class="leads-container">
            <div style="font-size:0.72rem; font-weight:800; color:var(--text-muted);">
              <i class="fa-solid fa-magnifying-glass"></i> CASE LEADS — INFORMATION THAT HELPS SOLVE THIS (${this.leads.length})
            </div>
            ${this.leads.map(l => `
              <div class="lead-item">
                <strong style="color:var(--ig-purple);">${l.author}${l.verified ? ' <i class="fa-solid fa-circle-check verified-check"></i>' : ''}:</strong> ${l.text}
                <div style="color:var(--text-muted); font-size:.68rem; margin-top:3px;">${l.time}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <div class="card-actions">
          <div style="display:flex; gap:14px;">
            <button class="btn-action ${this.likedByMe ? 'liked' : ''}" onclick="app.toggleLike(${this.id})">
              <i class="fa-${this.likedByMe ? 'solid' : 'regular'} fa-heart"></i> ${this.likes}
            </button>
            <button class="btn-action" onclick="app.toggleComments(${this.id})" title="View / add comments">
              <i class="fa-regular fa-comment"></i> ${this.comments.length}
            </button>
          </div>
          <button class="btn-detective" onclick="app.openLeadModal(${this.id})" title="Submit structured information that helps investigate this case">
            <i class="fa-solid fa-magnifying-glass"></i> Investigate (+${this.pointsReward} PTS)
          </button>
        </div>

        ${commentsOpen ? `
          <div class="comments-container">
            <div style="font-size:0.72rem; font-weight:800; color:var(--text-muted);">
              <i class="fa-regular fa-comments"></i> COMMENTS (${this.comments.length})
            </div>
            ${this.comments.length > 0 ? this.comments.map(c => `
              <div class="comment-item">
                <span><strong style="color:var(--text-main);">${c.author}</strong> ${c.text}</span>
                <span class="comment-time">${c.time}</span>
              </div>
            `).join('') : `<p class="comment-empty">No comments yet — be the first to say something.</p>`}
            <div class="comment-input-row">
              <input
                type="text"
                class="comment-input"
                id="comment-input-${this.id}"
                placeholder="Add a comment..."
                onkeydown="if(event.key==='Enter'){ app.submitComment(${this.id}); event.preventDefault(); }"
              >
              <button class="comment-send-btn" onclick="app.submitComment(${this.id})" title="Post comment">
                <i class="fa-solid fa-paper-plane"></i>
              </button>
            </div>
            <p class="form-hint" style="margin:0;">Comments are open community discussion and don't earn points. Use "Investigate" above to submit information that actually helps the case.</p>
          </div>
        ` : ''}
      </article>
    `;
  }
}

class FEDDriver {
  constructor({ id, plate, service, reason, flags, risk }) {
    this.id = id;
    this.plate = plate;
    this.service = service;
    this.reason = reason;
    this.flags = flags;
    this.risk = risk; // 0-100 heuristic risk score
  }

  riskColor() {
    if (this.risk >= 70) return 'var(--danger)';
    if (this.risk >= 40) return 'var(--status-pending)';
    return 'var(--status-resolved)';
  }

  renderCardHTML() {
    return `
      <div class="driver-card">
        <div class="row1">
          <span>${this.service} · ${this.plate}</span>
          <span class="flag-count"><i class="fa-solid fa-flag"></i> ${this.flags} flags</span>
        </div>
        <p style="font-size:0.78rem; color:var(--text-muted); margin-top:5px;">${this.reason}</p>
        <div class="risk-bar"><div class="risk-bar-fill" style="width:${this.risk}%; background:${this.riskColor()};"></div></div>
        <div style="display:flex; justify-content:space-between; margin-top:4px;">
          <span style="font-size:.66rem; color:var(--text-muted); font-weight:700;">Risk score: ${this.risk}/100</span>
          <button class="btn-action" style="font-size:.7rem;" onclick="app.openFlagModal('${this.plate}')"><i class="fa-solid fa-flag"></i> Flag this driver</button>
        </div>
      </div>
    `;
  }
}

/* Represents the signed-in demo user: points, tier, verification & trust state. */
class UserProfile {
  constructor() {
    this.points = 350;
    this.strikes = 0; // false-accusation strikes; 3 strikes suspends detective privileges
    this.idVerified = false;
    this.verificationDocs = []; // e.g. ['Student ID', 'National ID']
    this.reportsSubmitted = 0;
    this.leadsSubmitted = 0;
  }

  tier() { return getTierForPoints(this.points); }

  trustScore() {
    // Simple heuristic: base 70, +5 per verification doc, +2 per useful lead, -20 per strike, capped 0-100
    let score = 70 + this.verificationDocs.length * 5 + Math.min(this.leadsSubmitted * 2, 20) - this.strikes * 20;
    return Math.max(0, Math.min(100, score));
  }

  isSuspended() { return this.strikes >= 3; }

  addPoints(base) {
    const multiplier = this.tier().multiplier;
    const total = Math.round(base * multiplier);
    this.points += total;
    return total;
  }
}
