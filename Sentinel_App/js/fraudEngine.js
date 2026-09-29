/* ==========================================================================
   SENTINEL — fraudEngine.js
   Client-side "AI tracing" heuristic layer.

   IMPORTANT (be upfront about this in any demo/judging Q&A):
   This is a rule-based / statistical heuristic, not a trained machine-learning
   model. It demonstrates the *concept* of automated pattern detection,
   duplicate-report clustering and false-accusation screening described in
   the pitch. The same scoring approach is re-implemented in C++
   (cpp/fraud_engine.cpp) to show it running as a fast, dependency-free
   backend/algorithmic module, and would be the layer to replace with a real
   trained classifier (e.g. text-similarity embeddings + a supervised
   fraud/duplicate model) in a production build.
   ========================================================================== */

const AntiFraudEngine = {
  /* Basic keyword + heuristic content screen run on every new report/lead. */
  checkContent(text) {
    const lower = (text || '').toLowerCase();
    let score = 100;
    const reasons = [];

    SUSPICIOUS_KEYWORDS.forEach(w => {
      if (lower.includes(w)) { score -= 40; reasons.push(`Contains flagged phrase: "${w}"`); }
    });

    if (lower.trim().length < 12) { score -= 25; reasons.push('Description is very short / low detail.'); }

    const repeatedChar = /(.)\1{5,}/.test(lower); // e.g. "aaaaaa"
    if (repeatedChar) { score -= 20; reasons.push('Contains repeated-character spam pattern.'); }

    return { isValid: score > 50, score: Math.max(0, score), reasons };
  },

  /* Jaccard word-overlap similarity between two strings — a lightweight stand-in
     for a real duplicate/near-duplicate detector. Returns 0..1. */
  similarity(a, b) {
    const setA = new Set((a || '').toLowerCase().split(/\W+/).filter(Boolean));
    const setB = new Set((b || '').toLowerCase().split(/\W+/).filter(Boolean));
    if (setA.size === 0 || setB.size === 0) return 0;
    let intersection = 0;
    setA.forEach(w => { if (setB.has(w)) intersection++; });
    const union = new Set([...setA, ...setB]).size;
    return intersection / union;
  },

  /* Scan existing posts for likely duplicates/related reports — this is the
     "AI matched N related reports" insight shown on cards. */
  findRelated(newText, existingPosts, threshold = 0.18) {
    return existingPosts
      .map(p => ({ post: p, score: this.similarity(newText, p.description + ' ' + p.title) }))
      .filter(r => r.score >= threshold)
      .sort((a, b) => b.score - a.score);
  },

  /* Evaluate whether a lead/report looks like a knowingly false accusation.
     In the prototype this is a simple keyword + retraction-pattern check;
     the pitch's real design calls for AI tracing of a contributor's review
     history to catch a pattern of lying, with escalating consequences. */
  evaluateAccusation(text) {
    const flags = ['definitely him', 'i know its', 'i am 100% sure', 'kill', 'attack him', 'his address is'];
    const lower = (text || '').toLowerCase();
    const hit = flags.find(f => lower.includes(f));
    return {
      risky: !!hit,
      reason: hit ? `Unverified certainty / risky language detected ("${hit}"). Contributions are reviewed before being treated as fact.` : null
    };
  }
};
