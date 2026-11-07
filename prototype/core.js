import { LANGUAGES, AREAS, SLOTS, GENDERS, VENUES, defaultProfile, PEOPLE, GROUPS } from './data.js';

export const STORAGE_KEY = 'duodialect.preview.v1';
const text = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const uniqueList = (v, choices, min = 1) => Array.isArray(v) && v.length >= min && v.length <= choices.length && new Set(v).size === v.length && v.every(x => choices.includes(x));
export function validateProfile(p) {
  if (!p || typeof p !== 'object') throw new Error('Please complete your profile.');
  if (!text(p.name, 40)) throw new Error('Enter a name of up to 40 characters.');
  if (p.adult !== true || !Number.isInteger(p.age) || p.age < 18 || p.age > 100) throw new Error('This preview is for adults aged 18 and over.');
  if (!GENDERS.includes(p.gender) || !AREAS.includes(p.area)) throw new Error('Choose your gender and Sydney neighbourhood.');
  if (!LANGUAGES.includes(p.speaks) || !LANGUAGES.includes(p.learns) || p.speaks === p.learns) throw new Error('Choose different languages to offer and practise.');
  if (!['Beginner', 'Intermediate', 'Advanced'].includes(p.level)) throw new Error('Choose your learning level.');
  if (!uniqueList(p.availability, SLOTS)) throw new Error('Choose at least one time to meet.');
  if (!Array.isArray(p.interests) || p.interests.length > 8 || !p.interests.every(v => text(v, 24))) throw new Error('Use up to eight short interests.');
  if (typeof p.dating !== 'boolean') throw new Error('Choose whether to enable dating.');
  if (!uniqueList(p.datingGenders, GENDERS, p.dating ? 1 : 0)) throw new Error('Choose who you would like to date.');
  if (!Number.isInteger(p.ageMin) || !Number.isInteger(p.ageMax) || p.ageMin < 18 || p.ageMax > 100 || p.ageMin > p.ageMax) throw new Error('Choose a valid adult dating age range.');
  // Return only known fields; never merge arbitrary stored keys into application state.
  return Object.fromEntries(Object.keys(defaultProfile).map(k => [k, structuredClone(p[k])]));
}
export function reciprocal(me, them) {
  return them.fluent === true && me.speaks === them.learns && me.learns === them.speaks;
}
export function mutualDating(me, them) {
  return me.dating === true && them.dating === true && me.adult === true && them.adult === true &&
    me.age >= 18 && them.age >= 18 && me.datingGenders.includes(them.gender) && them.datingGenders.includes(me.gender) &&
    them.age >= me.ageMin && them.age <= me.ageMax && me.age >= them.ageMin && me.age <= them.ageMax;
}
export function matches(me, mode = 'partner', filters = {}, blocked = [], people = PEOPLE) {
  return people.filter(p => !blocked.includes(p.id) && p.adult === true && p.age >= 18 && reciprocal(me, p))
    .filter(p => mode !== 'date' || mutualDating(me, p))
    .map(p => ({ ...p, sharedTimes: p.availability.filter(v => me.availability.includes(v)), sharedInterests: p.interests.filter(v => me.interests.includes(v)) }))
    .filter(p => p.sharedTimes.length && (!filters.area || filters.area === p.area) && (!filters.slot || p.sharedTimes.includes(filters.slot)))
    .sort((a, b) => (Number(b.area === me.area) * 3 + b.sharedTimes.length * 2 + b.sharedInterests.length) - (Number(a.area === me.area) * 3 + a.sharedTimes.length * 2 + a.sharedInterests.length));
}
export function eligibleGroups(me, blocked = [], filters = {}) {
  return GROUPS.filter(g => g.pair.includes(me.speaks) && g.pair.includes(me.learns) && me.speaks !== me.learns &&
    g.members.some(id => PEOPLE.some(p => p.id === id && reciprocal(me, p))) &&
    !g.members.some(id => blocked.includes(id)) && me.availability.includes(g.slot) &&
    (!filters.area || filters.area === g.area) && (!filters.slot || filters.slot === g.slot));
}
export function nextDate(weekday, now = new Date()) {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const delta = (weekday - date.getDay() + 7) % 7 || 7;
  date.setDate(date.getDate() + delta);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function defaultDate(slot) { return nextDate(({ Wednesday: 3, Thursday: 4, Saturday: 6, Sunday: 0 })[slot.split(' ')[0]]); }
export function slotFor(date, time) {
  const d = new Date(`${date}T${time}:00`);
  const day = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];
  const hour = d.getHours();
  return `${day} ${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}`;
}
export function validatePlan(plan, state, now = new Date()) {
  if (!plan || !['partner', 'date', 'group'].includes(plan.kind)) throw new Error('Choose a meetup type.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(plan.date) || !/^\d{2}:\d{2}$/.test(plan.time)) throw new Error('Choose a date and time.');
  const date = new Date(`${plan.date}T${plan.time}:00`);
  if (!Number.isFinite(+date) || date <= now || date.getFullYear() > now.getFullYear() + 1) throw new Error('Choose a future date within the next year.');
  if (`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` !== plan.date || date.getHours() !== Number(plan.time.slice(0, 2)) || date.getMinutes() !== Number(plan.time.slice(3))) throw new Error('Choose a valid date and time.');
  if (!VENUES.includes(plan.venue) || !['once', 'weekly'].includes(plan.repeat)) throw new Error('Choose a public meeting place and frequency.');
  if (!text(plan.note, 400)) throw new Error('Add a short invitation of up to 400 characters.');
  const slot = slotFor(plan.date, plan.time);
  if (plan.kind === 'group') {
    const group = eligibleGroups(state.profile, state.blocked).find(g => g.id === plan.target);
    if (!group || group.slot !== slot || group.members.length + group.otherSeats >= group.capacity) throw new Error('This group is not available for your exchange.');
    if (plan.date !== nextDate(group.weekday, now) || plan.time !== group.time) throw new Error('Use the scheduled group session.');
  } else {
    const match = matches(state.profile, plan.kind, {}, state.blocked).find(p => p.id === plan.target);
    if (!match || !match.sharedTimes.includes(slot)) throw new Error('Choose a time you both have available.');
  }
  if (state.plans.some(p => p.target === plan.target && p.kind === plan.kind && p.status !== 'cancelled')) throw new Error('You already have an active invitation here. Find it in My plans.');
  return true;
}
export function initialState() { return { version: 1, profile: structuredClone(defaultProfile), blocked: [], reports: [], plans: [] }; }
export function parseState(raw) {
  const s = JSON.parse(raw);
  if (!s || s.version !== 1) throw new Error('Unsupported saved preview.');
  const profile = validateProfile(s.profile);
  if (!uniqueList(s.blocked, PEOPLE.map(p => p.id), 0)) throw new Error('Invalid blocked list.');
  if (!Array.isArray(s.plans) || s.plans.length > 100 || !Array.isArray(s.reports) || s.reports.length > 100) throw new Error('Invalid saved preview.');
  const ids = new Set();
  const plans = s.plans.map(p => {
    if (!p || !text(p.id, 80) || ids.has(p.id) || !['partner', 'date', 'group'].includes(p.kind) ||
      !(p.kind === 'group' ? GROUPS : PEOPLE).some(t => t.id === p.target) ||
      !['pending', 'cancelled'].includes(p.status) || !['once', 'weekly'].includes(p.repeat) || !VENUES.includes(p.venue) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(p.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.time) || !Number.isFinite(Date.parse(`${p.date}T${p.time}:00`)) ||
      !Array.isArray(p.messages) || p.messages.length > 200 || !p.messages.every(m => m && text(m.text, 400) && Number.isFinite(m.at))) throw new Error('Invalid saved invitation.');
    ids.add(p.id);
    return { id: p.id, kind: p.kind, target: p.target, status: p.status, repeat: p.repeat, venue: p.venue, date: p.date, time: p.time, messages: p.messages.map(m => ({ text: m.text, at: m.at })) };
  });
  const reports = s.reports.map(r => {
    if (!r || !PEOPLE.some(p => p.id === r.target) || !['Unwanted flirting', 'Misleading profile', 'Harassment', 'Other concern'].includes(r.reason)) throw new Error('Invalid saved report.');
    return { target: r.target, reason: r.reason };
  });
  return { version: 1, profile, blocked: [...s.blocked], reports, plans };
}
export function createPlan(state, proposal, now = new Date()) {
  validatePlan(proposal, state, now);
  if (state.plans.length >= 100) throw new Error('This preview holds up to 100 plans. Reset it to start again.');
  return { id: crypto.randomUUID(), kind: proposal.kind, target: proposal.target, date: proposal.date, time: proposal.time, venue: proposal.venue, repeat: proposal.repeat, status: 'pending', messages: [{ text: proposal.note.trim(), at: +now }] };
}
