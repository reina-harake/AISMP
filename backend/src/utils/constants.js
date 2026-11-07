const ROLES = ['citizen', 'employee', 'admin'];
const CATEGORIES = [
  'road_damage', 'street_lighting', 'electricity', 'water', 'waste', 'noise',
  'illegal_construction', 'parking', 'stray_animals', 'public_spaces', 'other',
];
const PRIORITIES = ['critical', 'high', 'medium', 'low'];
const COMPLAINT_STATUSES = ['submitted', 'under_review', 'assigned', 'in_progress', 'resolved', 'rejected'];
const REQUEST_TYPES = [
  'residence_certificate', 'building_permit', 'business_license',
  'civil_record', 'construction_permit', 'other',
];
const REQUEST_STATUSES = ['submitted', 'under_review', 'approved', 'rejected', 'ready'];

// Complaint workflow from the use case diagram:
// Submitted -> Under Review -> Assigned -> In Progress -> Resolved, OR Rejected/Invalid
const COMPLAINT_TRANSITIONS = {
  submitted: ['under_review', 'rejected'],
  under_review: ['assigned', 'rejected'],
  assigned: ['in_progress', 'rejected'],
  in_progress: ['resolved', 'rejected'],
  resolved: [],
  rejected: [],
};

const REQUEST_TRANSITIONS = {
  submitted: ['under_review', 'rejected'],
  under_review: ['approved', 'rejected'],
  approved: ['ready'],
  ready: [],
  rejected: [],
};

// Gamification: points a citizen earns for a complaint that turns out valid, and loses when
// staff reject a report as false or abusive (an ordinary rejection - duplicate, not the
// municipality's job - costs nothing). Points never go below 0.
const POINTS = { complaint_resolved: 10, complaint_invalid: -15 };

// Levels unlocked by points. 'trusted' and above is a real benefit: new complaints skip the
// "submitted" triage step and go straight to "under review" for the department.
const LEVELS = [
  { key: 'newcomer', min: 0 },
  { key: 'active', min: 30 },
  { key: 'trusted', min: 100 },
  { key: 'guardian', min: 250 },
];
const FAST_TRACK_LEVEL = 'trusted';

/** { level, next_level, next_level_at, fast_track } for a points total */
function levelInfo(points = 0) {
  let i = 0;
  while (i + 1 < LEVELS.length && points >= LEVELS[i + 1].min) i += 1;
  const next = LEVELS[i + 1];
  const fastIdx = LEVELS.findIndex((l) => l.key === FAST_TRACK_LEVEL);
  return {
    level: LEVELS[i].key,
    next_level: next?.key ?? null,
    next_level_at: next?.min ?? null,
    fast_track: i >= fastIdx,
  };
}

const PRIORITY_RANK_SQL =
  "FIELD(c.priority, 'critical', 'high', 'medium', 'low')";

module.exports = {
  ROLES, CATEGORIES, PRIORITIES, COMPLAINT_STATUSES, REQUEST_TYPES, REQUEST_STATUSES,
  COMPLAINT_TRANSITIONS, REQUEST_TRANSITIONS, POINTS, LEVELS, levelInfo, PRIORITY_RANK_SQL,
};
