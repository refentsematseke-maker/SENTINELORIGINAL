/* ==========================================================================
   SENTINEL — data.js
   Static/seed data for the prototype: categories, promotional tiers,
   demo posts and demo FED (e-hailing) driver records.
   In a production build this would come from a real database via the
   server/server.js API instead of being hard-coded on the client.
   ========================================================================== */

const CATEGORIES = [
  { id: 'crime', label: 'Crime / Suspicious Activity', icon: 'fa-triangle-exclamation' },
  { id: 'missing', label: 'Missing Person', icon: 'fa-person-circle-question' },
  { id: 'property', label: 'Lost / Stolen Property', icon: 'fa-box-open' },
  { id: 'transport', label: 'E-Hailing Transport Safety', icon: 'fa-car-side' },
];

/* Promotional / rank tiers — from the founding team's business-model notes:
   contributors are ranked by verified, useful contributions (not raw volume),
   unlocking a higher reward multiplier the same way the platform promised to
   beat comparable government/community incentive schemes. */
const TIERS = [
  { id: 'bronze', name: 'Bronze Reporter', min: 0, multiplier: 1, icon: 'fa-shield', perk: 'Base reward rate on verified contributions.' },
  { id: 'silver', name: 'Silver Investigator', min: 300, multiplier: 1.5, icon: 'fa-shield-halved', perk: '1.5x points on verified leads.' },
  { id: 'gold', name: 'Gold Detective', min: 800, multiplier: 2, icon: 'fa-award', perk: '2x points + priority case access.' },
  { id: 'platinum', name: 'Platinum (SMU Verified)', min: 1500, multiplier: 3, icon: 'fa-crown', perk: '3x payout multiplier on police-verified cases.' },
];

function getTierForPoints(points) {
  return [...TIERS].reverse().find(t => points >= t.min) || TIERS[0];
}

/* Demo feed posts. image URLs point to Unsplash purely for prototype visuals. */
const DEMO_POSTS = [
  {
    id: 1,
    author: 'Thabo M.',
    smuVerified: true,
    role: 'compiler',
    title: 'Suspicious Silver Polo circling Campus Gate 2',
    category: 'transport',
    description: 'Unregistered silver VW Polo idling near the primary student drop-off point for the third evening in a row. Driver declined to state which e-hailing service he was affiliated with.',
    image: 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=800&q=80',
    status: 'active_detective',
    pointsReward: 50,
    aiInsight: 'AI matched 3 related reports in the Pretoria North zone with overlapping vehicle description and time window.',
    verifiedId: true,
    likes: 24,
    leads: [
      { author: 'Community Detective', text: 'Spotted turning toward Molotlegi Street at 21:15, no visible plate lighting.', time: '2h ago', verified: true }
    ],
    comments: [
      { author: 'Sipho D.', text: 'Saw this too last night, glad someone finally posted it.', time: '1h ago' },
      { author: 'Anonymous', text: 'Stay safe everyone, avoid that gate after dark for now.', time: '35m ago' }
    ]
  },
  {
    id: 2,
    author: 'Anonymous Student',
    smuVerified: false,
    role: 'reporter',
    title: 'Missing black Dell backpack with research drives',
    category: 'property',
    description: 'Left unattended for under 5 minutes at the library learning commons, gone when I returned. Contains two labelled research USB drives — no personal ID inside.',
    image: null,
    status: 'pending',
    pointsReward: 30,
    aiInsight: 'AI is cross-referencing recent second-hand marketplace listings and lost-and-found submissions in a 2km radius.',
    verifiedId: false,
    likes: 9,
    leads: [],
    comments: []
  },
  {
    id: 3,
    author: 'Naledi K.',
    smuVerified: true,
    role: 'compiler',
    title: 'Community alert: attempted break-in, Block C residence',
    category: 'crime',
    description: 'Two individuals attempted to force a ground-floor window at approximately 02:40. Residents were alerted before entry occurred. No injuries. Security was notified on-site.',
    image: 'https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=800&q=80',
    status: 'active_detective',
    pointsReward: 60,
    aiInsight: 'Pattern match: similar description and time-of-night reported twice this month within 400m — flagged for a linked-case review.',
    verifiedId: true,
    likes: 41,
    leads: [
      { author: 'Verified Investigator', text: 'Security footage timestamp confirms two individuals in dark clothing, one carrying a crowbar-shaped object.', time: '40m ago', verified: true },
      { author: 'Community Detective', text: 'Similar description reported near the same block two weeks ago — possible repeat activity.', time: '15m ago', verified: false }
    ],
    comments: [
      { author: 'Res Warden Office', text: 'Extra security patrol has been added to Block C for the rest of the week.', time: '20m ago' }
    ]
  },
  {
    id: 4,
    author: 'Anonymous Reporter',
    smuVerified: false,
    role: 'reporter',
    title: 'Missing person: elderly resident, last seen Church Street',
    category: 'missing',
    description: '78-year-old male, last seen around 17:00 wearing a grey jacket. Family has already opened a case with local authorities; sharing here to widen community awareness only.',
    image: null,
    status: 'active_detective',
    pointsReward: 70,
    aiInsight: 'Time-sensitive case — AI has flagged this as high priority for community visibility.',
    verifiedId: true,
    likes: 63,
    leads: [],
    comments: [
      { author: 'Anonymous', text: 'Praying he\'s found safe. Sharing this in our res group chat too.', time: '2h ago' }
    ]
  },
  {
    id: 5,
    author: 'Anonymous Reporter',
    smuVerified: false,
    role: 'reporter',
    title: 'Hijacking attempt: silver Toyota Corolla, Gate 3 parking',
    category: 'crime',
    description: 'Two males approached the driver at gunpoint while stationary near the Gate 3 boom. Driver reversed and fled before handover — no injuries. Suspects left on foot toward the taxi rank.',
    image: 'https://images.unsplash.com/photo-1502877338535-766e1452684a?auto=format&fit=crop&w=800&q=80',
    status: 'active_detective',
    pointsReward: 75,
    aiInsight: 'AI flagged this as high-severity and matched 2 recent reports describing similar suspect clothing near the same gate.',
    verifiedId: true,
    likes: 52,
    leads: [
      { author: 'Verified Investigator', text: 'Boom-gate camera log shows two males loitering near the same spot roughly 20 minutes earlier.', time: '1h ago', verified: true }
    ],
    comments: [
      { author: 'Anonymous', text: 'This is terrifying, glad the driver is okay.', time: '50m ago' },
      { author: 'Lerato N.', text: 'Campus security really needs better lighting at Gate 3.', time: '10m ago' }
    ]
  },
  {
    id: 6,
    author: 'Anonymous Student',
    smuVerified: false,
    role: 'reporter',
    title: 'Phone snatched from hand outside main library',
    category: 'property',
    description: 'iPhone grabbed out of my hand while I was walking and looking at it near the library steps. Suspect was on foot, wearing a red hoodie, ran toward the sports field.',
    image: 'https://images.unsplash.com/photo-1512499617640-c74ae3a79d37?auto=format&fit=crop&w=800&q=80',
    status: 'pending',
    pointsReward: 35,
    aiInsight: 'AI is checking recent second-hand phone listings and comparing suspect description against other snatch-and-run reports this week.',
    verifiedId: false,
    likes: 17,
    leads: [],
    comments: [
      { author: 'Anonymous', text: 'Same thing happened to my friend near the same steps last month.', time: '4h ago' }
    ]
  },
  {
    id: 7,
    author: 'Kagiso P.',
    smuVerified: true,
    role: 'compiler',
    title: 'Vehicle break-in: laptop stolen from parked Polo Vivo',
    category: 'property',
    description: 'Rear passenger window smashed sometime between 09:00 and 13:00 in the north parking lot. A grey laptop bag was taken from the back seat; nothing else disturbed.',
    image: null,
    status: 'active_detective',
    pointsReward: 45,
    aiInsight: 'AI matched a similar smash-and-grab pattern reported in the same parking lot two weeks ago — possible repeat offender.',
    verifiedId: true,
    likes: 28,
    leads: [
      { author: 'Community Detective', text: 'A neighbouring car owner mentioned seeing broken glass on the ground the previous evening too — worth checking CCTV coverage for that window.', time: '3h ago', verified: false }
    ],
    comments: []
  },
  {
    id: 8,
    author: 'Anonymous Reporter',
    smuVerified: false,
    role: 'reporter',
    title: 'Bicycle stolen from residence bike rack',
    category: 'property',
    description: 'Black and orange mountain bike, secured with a cable lock, gone overnight from the Res 4 bike rack. Cable lock was cut, not unlocked — left behind on the ground.',
    image: 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=800&q=80',
    status: 'pending',
    pointsReward: 25,
    aiInsight: 'AI found no closely related reports yet — this may be a new pattern.',
    verifiedId: false,
    likes: 6,
    leads: [],
    comments: []
  },
  {
    id: 9,
    author: 'Anonymous Reporter',
    smuVerified: false,
    role: 'reporter',
    title: 'Catalytic converter stolen from staff parking bay',
    category: 'property',
    description: 'Car would not start this morning; mechanic confirmed the catalytic converter had been removed overnight. Vehicle was parked in the staff bay closest to the perimeter fence.',
    image: null,
    status: 'active_detective',
    pointsReward: 50,
    aiInsight: 'AI matched 2 other converter-theft reports from the same perimeter-fence parking row over the past month — flagged as a likely organised pattern.',
    verifiedId: true,
    likes: 19,
    leads: [
      { author: 'Verified Investigator', text: 'Perimeter fence near that bay has a gap large enough to pass tools through — worth flagging to campus security for a fence check.', time: '5h ago', verified: true }
    ],
    comments: [
      { author: 'Staff Member', text: 'Third one this term. Facilities has been notified about the fence gap.', time: '1h ago' }
    ]
  },
  {
    id: 10,
    author: 'Naledi K.',
    smuVerified: true,
    role: 'compiler',
    title: 'Vandalism: windows smashed and graffiti at Res Block D',
    category: 'crime',
    description: 'Several ground-floor windows smashed and offensive graffiti sprayed on the outer wall overnight. No entry appears to have been made. Facilities has been notified for clean-up and boarding.',
    image: 'https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=800&q=80',
    status: 'pending',
    pointsReward: 30,
    aiInsight: 'AI found no closely related reports yet — this may be a new pattern.',
    verifiedId: true,
    likes: 22,
    leads: [],
    comments: []
  },
  {
    id: 11,
    author: 'Anonymous Student',
    smuVerified: false,
    role: 'reporter',
    title: 'Card skimming device found on campus ATM',
    category: 'crime',
    description: 'Noticed the card slot on the on-campus ATM felt loose and slightly raised compared to normal. Did not insert my card. Reported to the bank\'s fraud line as well as here.',
    image: null,
    status: 'active_detective',
    pointsReward: 55,
    aiInsight: 'AI flagged this as high priority — skimming devices are frequently linked to organised card-fraud rings operating across multiple ATMs.',
    verifiedId: false,
    likes: 34,
    leads: [
      { author: 'Community Detective', text: 'Same ATM had unusually slow card-read times reported by two other students this week — consistent with a skimmer being fitted.', time: '30m ago', verified: false }
    ],
    comments: [
      { author: 'Anonymous', text: 'Thanks for the heads up, cancelling my card check just in case.', time: '12m ago' }
    ]
  },
  {
    id: 12,
    author: 'Anonymous Reporter',
    smuVerified: false,
    role: 'reporter',
    title: 'Missing person: first-year student not seen since Friday',
    category: 'missing',
    description: '19-year-old female, last confirmed seen leaving the campus library Friday evening. Not responding to calls or messages since. Family and residence management have already been informed.',
    image: null,
    status: 'active_detective',
    pointsReward: 80,
    aiInsight: 'Time-sensitive case — AI has flagged this as high priority for community visibility.',
    verifiedId: true,
    likes: 71,
    leads: [],
    comments: [
      { author: 'Anonymous', text: 'Sharing everywhere I can, please reach out if anyone has info.', time: '3h ago' },
      { author: 'Res Warden Office', text: 'Campus security is aware and actively assisting the family.', time: '1h ago' }
    ]
  },
  {
    id: 13,
    author: 'Anonymous Reporter',
    smuVerified: false,
    role: 'reporter',
    title: 'Assault reported outside off-campus tavern',
    category: 'crime',
    description: 'Witnessed a physical altercation between two men outside the tavern on the main road around 23:30. One individual appeared injured. Bystanders called for help; unclear if it was reported to police on-site.',
    image: null,
    status: 'pending',
    pointsReward: 40,
    aiInsight: 'AI matched 1 related report describing a disturbance at the same tavern the previous weekend.',
    verifiedId: false,
    likes: 15,
    leads: [],
    comments: []
  },
  {
    id: 14,
    author: 'Anonymous Student',
    smuVerified: false,
    role: 'reporter',
    title: 'E-hailing driver verbally aggressive after cancelled trip',
    category: 'transport',
    description: 'Driver became verbally abusive and followed me partway on foot after I cancelled the trip due to safety concerns about the vehicle not matching the app. Reporting here in addition to the platform.',
    image: null,
    status: 'active_detective',
    pointsReward: 45,
    aiInsight: 'AI matched this account/vehicle description to a driver already flagged once before in the FED tool — recommend cross-checking flagged drivers.',
    verifiedId: false,
    likes: 26,
    leads: [
      { author: 'Verified Investigator', text: 'Vehicle description matches a plate already flagged in FED with a prior GPS-deviation complaint — worth linking the two records.', time: '20m ago', verified: true }
    ],
    comments: []
  }
];

/* Demo FED (Flagging of E-Hailing Drivers) records */
const DEMO_DRIVERS = [
  { id: 1, plate: 'GP 88 YZ GP', service: 'Uber', reason: 'Vehicle mismatch reported near campus — car did not match app description.', flags: 12, risk: 78 },
  { id: 2, plate: 'CA 123-991', service: 'Bolt', reason: 'GPS route deviation reported by student passenger late at night.', flags: 8, risk: 61 },
  { id: 3, plate: 'GP 45 KLM', service: 'Uber', reason: 'Driver requested passenger cancel and pay cash outside the app.', flags: 5, risk: 44 },
  { id: 4, plate: 'GP 19 QRT', service: 'Bolt', reason: 'Unclear vehicle, no visible driver photo match at pickup.', flags: 2, risk: 21 },
];

/* Suspicious / high-risk keyword list used by the client-side heuristic layer.
   The authoritative scoring logic mirrors this in cpp/fraud_engine.cpp and, in
   a full deployment, in server/server.js on the backend where it can't be
   bypassed by a modified client. */
const SUSPICIOUS_KEYWORDS = ['fake', 'prank', 'hoax', 'joke', 'test test', 'lol just kidding'];

/* Internal staff accounts — the SMU IT/CS graduate hires described in the
   team's founding notes ("promotional levels for workers", verification
   and payout/security roles). This is a small, hardcoded demo login list,
   not a real auth system — see js/app.js handleStaffLogin() and the Staff
   Portal page for how it's used, and Section "What's Real vs Simulated" in
   the documentation for the honest caveat on this. */
const DEMO_STAFF = [
  { id: 1, username: 'k.mahlangu', password: 'Sentinel2026!', name: 'Kagiso Mahlangu', role: 'Identity & Payout Review', title: 'SMU IT Graduate' },
  { id: 2, username: 'n.dube', password: 'Sentinel2026!', name: 'Naledi Dube', role: 'AI Tracing & Accusation Review', title: 'SMU CS Graduate' },
  { id: 3, username: 'staff', password: 'staff123', name: 'Staff Demo Account', role: 'Evidence Compiler', title: 'Internal Security & Evidence Team' }
];

/* Dual export: these consts work as browser globals when loaded via a
   <script> tag (as index.html does) AND as a Node module when required by
   server/server.js. That keeps the live backend's seed data and the
   offline demo data as a single source of truth instead of two copies
   drifting apart. Has no effect in the browser (module is undefined there). */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CATEGORIES, TIERS, getTierForPoints, DEMO_POSTS, DEMO_DRIVERS, SUSPICIOUS_KEYWORDS, DEMO_STAFF };
}
