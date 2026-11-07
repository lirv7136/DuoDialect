import { LANGUAGES, AREAS, SLOTS, VENUES, GENDERS, PEOPLE, GROUPS } from './data.js';
import { STORAGE_KEY, initialState, parseState, validateProfile, matches, eligibleGroups, defaultDate, nextDate, createPlan, slotFor } from './core.js';

const $ = (selector) => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const paths = {
  discover: '<circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5Z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-12 4h.01M12 15h.01M16 15h.01"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M2 21v-2a7 7 0 0 1 14 0v2M16 5a3 3 0 0 1 0 6m2 3a6 6 0 0 1 4 5v2"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  swap: '<path d="M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  cup: '<path d="M4 8h13v8a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5ZM17 9h2a3 3 0 0 1 0 6h-2M8 2v3m5-3v3M2 23h18"/>',
  chat: '<path d="M21 11a9 9 0 0 1-9 9 10 10 0 0 1-4-.8L3 21l1.8-5A9 9 0 1 1 21 11Z"/><path d="M8 11h8m-8 4h5"/>',
  shield: '<path d="m12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6Z"/><path d="m8 12 3 3 5-6"/>',
  walk: '<path d="M3 20c1-7 6-4 8-9s7-3 10-7M3 21h18"/><circle cx="6" cy="6" r="2"/><path d="m17 14 3 3-3 3"/>',
  reset: '<path d="M3 11a9 9 0 1 1 2 7M3 3v8h8"/>',
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.chat}</svg>`;
function portrait(p) {
  const feminine = p.id === 'aiko' || p.id === 'sora' || p.id === 'lucia';
  return `<div class="portrait-wrap ${escape(p.colour)}"><svg class="portrait" viewBox="0 0 100 108" aria-hidden="true"><path d="M12 110c1-27 17-35 38-35s37 8 38 35" fill="${p.colour === 'sage' ? '#b7764f' : p.colour === 'lavender' ? '#748569' : '#576e5e'}"/>${feminine ? '<path d="M23 46c0-36 55-41 56 1l6 40H16Z" fill="#39352d"/>' : ''}<path d="M42 66v17q8 9 16 0V66" fill="#c98f6c"/><ellipse cx="50" cy="48" rx="23" ry="29" fill="#e4ad88"/><path d="M25 43c-4-28 21-35 36-27 18 0 20 17 14 29l-7-17q-14 13-37 6l-5 15Z" fill="#39352d"/><path d="M39 48h2m18 0h2" stroke="#39352d" stroke-width="3" stroke-linecap="round"/><path d="m50 49-2 9h4m-9 6q7 5 14-1" fill="none" stroke="#a66d52" stroke-width="1.5" stroke-linecap="round"/><path d="m35 80 15 16 15-16" fill="none" stroke="#f7f0dc" stroke-width="2"/></svg></div>`;
}
let state = initialState(), storageProblem = '', storageLocked = false;
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) state = parseState(saved);
} catch { storageProblem = 'Your saved preview could not be read. You can explore with sample settings, or reset the saved preview from Your profile. Existing saved data has not been replaced.'; storageLocked = true; }
let mode = 'partner', area = '', slot = '', toastTimer, returnFocus;
const modal = $('#modal');
const modeTitle = { partner: 'Language partners', group: 'Small groups', date: 'Language dates' };
const activePlans = () => state.plans.filter(p => p.status !== 'cancelled');
function save() {
  try {
    if (storageLocked) throw new Error('Storage needs resetting.');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); storageProblem = '';
  } catch { storageProblem = storageLocked ? storageProblem : 'Changes are available in this tab, but this browser could not save them. Keep the tab open; reloading may lose your latest changes.'; }
  renderStorage();
}
function renderStorage() { $('#storage-warning').hidden = !storageProblem; $('#storage-warning').textContent = storageProblem; }
function toast(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false; toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 6500); }
function page() { return ['plans', 'profile'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'discover'; }
function navigate(to) { if (page() === to) render(); else location.hash = to; }
function renderNav() {
  const nav = [['discover', 'discover', 'Discover'], ['plans', 'calendar', 'My plans'], ['profile', 'person', 'Your profile']].map(([id, symbol, label]) => `<a class="nav-link ${page() === id ? 'active' : ''}" href="#${id}" ${page() === id ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${label}</span>${id === 'plans' && activePlans().length ? `<span class="nav-count">${activePlans().length}</span>` : ''}</a>`).join('');
  $('#navigation').innerHTML = nav; $('#mobile-navigation').innerHTML = nav;
  $('#location-label').innerHTML = `${icon('pin')} Sydney, Australia`;
  $('#profile-button').textContent = state.profile.name.slice(0, 1).toUpperCase();
  $('#sidebar-profile').innerHTML = `<span class="small-avatar">${escape(state.profile.name.slice(0, 1).toUpperCase())}</span><span><strong>${escape(state.profile.name)}</strong><small>Your demo profile</small></span>${icon('arrow')}`;
}
function render() { renderNav(); renderStorage(); $('#main').innerHTML = page() === 'plans' ? plansView() : page() === 'profile' ? profileView() : discoverView(); }
function options(list, current, emptyLabel) { return `${emptyLabel ? `<option value="">${escape(emptyLabel)}</option>` : ''}${list.map(v => `<option value="${escape(v)}" ${v === current ? 'selected' : ''}>${escape(v)}</option>`).join('')}`; }
function discoverView() {
  const me = state.profile;
  const list = mode === 'group' ? eligibleGroups(me, state.blocked, { area, slot }) : matches(me, mode, { area, slot }, state.blocked);
  const title = mode === 'group' ? 'Good company, in small groups.' : mode === 'date' ? 'A shared language. A little spark.' : 'Your next conversation starts here.';
  return `<section class="hero"><div><p class="eyebrow"><span class="dot"></span> LESS SCROLLING. MORE CONVERSATION.</p><h1>Find your words.<br><em>Find your people.</em></h1><p class="intro">Meet someone who speaks your next language.<br>Share yours in return. Make a little room for connection.</p></div><div class="hero-art" aria-hidden="true"><div class="speech one">hello.</div><span class="art-star">✳</span><div class="speech two">こんにちは</div><span class="art-loop"></span></div></section>
    <div class="mode-tabs" role="group" aria-label="Meetup type">${[['partner', 'chat', 'Language partners', 'A regular conversation'], ['group', 'people', 'Small groups', 'A few new faces'], ['date', 'heart', 'Language dates', 'Only when you both opt in']].map(([id, symbol, title, sub]) => `<button class="mode-tab ${mode === id ? 'active' : ''}" data-action="mode" data-mode="${id}" aria-pressed="${mode === id}">${icon(symbol)}<span><strong>${title}</strong><small>${sub}</small></span></button>`).join('')}</div>
    <div class="exchange-bar"><div class="exchange-pair"><span>Your exchange:</span><strong>${escape(me.speaks)}</strong>${icon('swap')}<strong>${escape(me.learns)}</strong><span>· ${escape(me.level.toLowerCase())}</span></div><button class="text-button" data-action="profile">Edit my languages</button></div>
    ${mode === 'date' && !me.dating ? `<section class="empty-state date-gate"><span>${icon('heart')}</span><p class="eyebrow">A DIFFERENT KIND OF FIRST DATE</p><h2>A connection you both choose.</h2><p>Language dates are optional. Turn them on and set your preferences to discover adults who want both a language exchange and a date. Your regular language meetups stay platonic.</p><button class="button purple" data-action="dating-settings">Explore dating preferences ${icon('arrow')}</button></section>` : `
    ${mode === 'date' ? '<p class="intent-notice">Both people have opted into dating and meet each other’s preferences. Language partner invitations are always platonic.</p>' : ''}
    <section aria-label="Discover results"><div class="section-bar"><div><h2>${title}</h2><p>${list.length} sample ${mode === 'group' ? 'meetups' : 'people'} · reciprocal languages · a time that works for you</p></div><div class="filters"><label>${icon('pin')}<span class="sr-only">Neighbourhood</span><select id="area-filter">${options(AREAS, area, 'All neighbourhoods')}</select></label><label>${icon('calendar')}<span class="sr-only">Availability</span><select id="slot-filter">${options(SLOTS, slot, 'Any shared time')}</select></label></div></div>
    ${list.length ? `<div class="cards">${list.map(p => mode === 'group' ? groupCard(p) : personCard(p)).join('')}</div>` : `<div class="empty-state"><span>${icon('discover')}</span><h2>A little more room to find your people.</h2><p>No sample ${mode === 'group' ? 'groups' : 'people'} fit this combination. Try another neighbourhood or time, or update your languages. We won’t relax your dating preferences or show a one way exchange.</p><button class="button" data-action="reset-filters">Clear filters</button><button class="button primary" data-action="profile">Edit profile</button></div>`}</section>`}
    <div class="hint-strip">${icon(mode === 'group' ? 'people' : 'swap')}<div><strong>${mode === 'group' ? 'Small enough for everyone to have a turn.' : 'You bring a language. They bring another.'}</strong><p>${mode === 'group' ? 'Meetups use a shared language pair, with practice time for both sides.' : 'Try 20 minutes in each language. A coffee and a few mistakes are a great place to start.'}</p></div></div>`;
}
function personCard(p) {
  const existing = activePlans().find(v => v.target === p.id && v.kind === mode);
  return `<article class="person-card" data-person="${p.id}"><div class="card-top"><span class="match-label">${icon(mode === 'date' ? 'heart' : 'swap')}${mode === 'date' ? 'Mutual dating preferences' : 'You can help each other'}</span><button class="card-menu" data-action="person" data-id="${p.id}" aria-label="View ${escape(p.name)}’s profile and options">···</button></div>${portrait(p)}<h3>${escape(p.name)} <span>${p.age}</span></h3><p class="person-place">${icon('pin')}${escape(p.area)} · Sydney</p><div class="language-lines"><div><span>Can help you with</span><strong>${escape(p.speaks)} <small>Fluent</small></strong></div><div><span>Would love to practise</span><strong>${escape(p.learns)}</strong></div></div><p class="person-bio">${escape(p.bio)}</p><div class="tags">${p.interests.map(t => `<span class="tag ${p.sharedInterests.includes(t) ? 'shared' : ''}">${escape(t)}</span>`).join('')}</div><div class="availability">${icon('calendar')}${escape(p.sharedTimes[0])}${p.sharedTimes.length > 1 ? ' + more' : ''}</div><button class="button ${mode === 'date' ? 'purple' : 'primary'}" data-action="${existing ? 'conversation' : 'invite'}" data-id="${existing ? existing.id : p.id}">${existing ? 'View invitation' : mode === 'date' ? 'Suggest a language date' : 'Say hello'} ${icon(existing ? 'chat' : 'arrow')}</button></article>`;
}
function groupCard(g) {
  const existing = activePlans().find(p => p.target === g.id && p.kind === 'group');
  return `<article class="person-card group-card"><div class="group-art ${g.theme}">${icon(g.theme === 'walk' ? 'walk' : 'cup')}</div><div class="group-body"><p class="group-pair">${g.pair.map(escape).join(' ↔ ')}</p><h3>${escape(g.title)}</h3><div class="group-details"><div>${icon('calendar')}${escape(g.slot)} · ${g.time}</div><div>${icon('pin')}${escape(g.area)}, Sydney</div><div>${icon('people')}${g.capacity - g.members.length - g.otherSeats} sample places available · ${g.capacity} people maximum</div></div><p class="person-bio">${escape(g.description)}</p><button class="button primary" data-action="${existing ? 'conversation' : 'join'}" data-id="${existing ? existing.id : g.id}">${existing ? 'View join request' : 'Take a closer look'} ${icon('arrow')}</button></div></article>`;
}
function targetName(plan) { return (plan.kind === 'group' ? GROUPS : PEOPLE).find(v => v.id === plan.target)?.[plan.kind === 'group' ? 'title' : 'name'] || 'Meetup'; }
function formattedDate(date, config = {}) { return new Date(`${date}T12:00:00`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', ...config }); }
function plansView() {
  return `<p class="eyebrow">MAKE A LITTLE TIME FOR CONNECTION</p><h1 class="page-title">Good things on the calendar.</h1><p class="page-lead">Your invitations and recurring language exchanges, in one place. In this preview, requests stay local and aren’t accepted by a real person.</p>${state.plans.length ? `<div class="plan-list">${[...state.plans].reverse().map(p => `<article class="plan-card"><div class="date-tile"><small>${new Date(`${p.date}T12:00:00`).toLocaleDateString('en-AU', { month: 'short' })}</small><strong>${Number(p.date.slice(8))}</strong></div><div class="plan-info"><span class="status-pill ${p.status === 'cancelled' ? 'cancelled' : ''}">${p.status === 'cancelled' ? 'Cancelled' : 'Demo request · not confirmed'}</span><h2>${escape(targetName(p))}</h2><p>${modeTitle[p.kind]} · ${formattedDate(p.date)} · ${escape(p.time)}<br>${escape(p.venue)} · ${p.repeat === 'weekly' ? 'Every week from this date' : 'One meetup'}</p></div><button class="button" data-action="conversation" data-id="${escape(p.id)}">View plan ${icon('arrow')}</button></article>`).join('')}</div>` : `<div class="empty-state"><span>${icon('calendar')}</span><h2>Start with a hello.</h2><p>Find a language partner, suggest a time, and make it a regular thing if you like. Your first invitation will appear here.</p><a class="button primary" href="#discover">Find my people ${icon('arrow')}</a></div>`}<div class="hint-strip">${icon('cup')}<div><strong>A simple plan is a good plan.</strong><p>Choose a public place, agree on the details together and split the language time fairly. Dates and times use this device’s local timezone.</p></div></div>`;
}
function profileView() {
  const p = state.profile;
  return `<p class="eyebrow">SOMETHING TO SHARE. SOMETHING TO LEARN.</p><h1 class="page-title">Your side of the conversation.</h1><p class="page-lead">Start with a language you speak fluently and one you’d love to practise. This is a local demo profile, visible only in this browser.</p><section class="profile-summary"><h2>${escape(p.name)}, ${p.age}</h2><p class="small muted">${escape(p.area)} · Sydney</p><dl class="summary-grid"><div><dt>I can share</dt><dd>${escape(p.speaks)} · Fluent</dd></div><div><dt>I’m practising</dt><dd>${escape(p.learns)} · ${escape(p.level)}</dd></div><div><dt>Let’s find a time</dt><dd>${p.availability.map(escape).join('<br>')}</dd></div><div><dt>A few things I like</dt><dd>${p.interests.map(escape).join(', ') || 'Add your interests'}</dd></div><div><dt>Language dates</dt><dd>${p.dating ? `On · ${p.ageMin}–${p.ageMax} · ${p.datingGenders.map(escape).join(', ')}` : 'Off · language meetups only'}</dd></div></dl><div class="profile-actions"><button class="button primary" data-action="profile">Edit my profile ${icon('arrow')}</button><button class="button" data-action="dating-settings">Dating preferences</button></div><div class="manage-list"><h3>Blocked profiles</h3>${state.blocked.length ? state.blocked.map(id => `<div class="blocked-row"><span>${escape(PEOPLE.find(p => p.id === id).name)}</span><button class="text-button" data-action="unblock" data-id="${id}">Unblock</button></div>`).join('') : '<p class="small muted">No blocked profiles.</p>'}<p class="small muted">Blocking hides a sample person, cancels your active invitations with them and hides groups they are in. Reports in this preview are saved locally; there is no moderation team receiving them.</p></div><div class="manage-list"><h3>Start fresh</h3><p class="small muted">Remove this preview’s profile, invitations, messages, blocks and reports from this browser.</p><button class="button danger" data-action="reset">Reset saved preview</button></div></section>`;
}
function showModal(title, body) {
  if (!modal.open) returnFocus = document.activeElement;
  $('#modal-content').innerHTML = `<div class="modal-inner"><div class="modal-top"><h2 id="modal-title">${escape(title)}</h2><button class="close-button" data-action="close" aria-label="Close dialog">${icon('close')}</button></div>${body}</div>`;
  if (!modal.open) modal.showModal();
}
function closeModal() { modal.close(); }
modal.addEventListener('close', () => { if (returnFocus?.isConnected) returnFocus.focus(); else $('#main').focus({ preventScroll: true }); });
function formError(message) { const node = $('#form-error'); if (node) { node.hidden = false; node.textContent = message; node.scrollIntoView({ block: 'nearest' }); } else toast(message); }
const errorNode = '<p id="form-error" class="form-error" role="alert" hidden></p>';
function profileModal(datingFocus = false) {
  const p = state.profile;
  showModal('A little about you.', `<p class="modal-lead">Make the sample profile your own. Offer a language you speak fluently; you don’t need to be a native speaker. This pilot is for adults 18 and over.</p><form id="profile-form"><div class="form-grid"><label class="field">First name<input name="name" value="${escape(p.name)}" maxlength="40" required autocomplete="given-name"></label><label class="field">Age<input name="age" type="number" min="18" max="100" value="${p.age}" required></label><label class="field">Gender<select name="gender">${options(GENDERS, p.gender)}</select></label><label class="field">Sydney neighbourhood<select name="area">${options(AREAS, p.area)}</select></label><label class="field">I speak fluently<select name="speaks">${options(LANGUAGES, p.speaks)}</select></label><label class="field">I want to practise<select name="learns">${options(LANGUAGES, p.learns)}</select></label></div><label class="field">My learning level<select name="level">${options(['Beginner', 'Intermediate', 'Advanced'], p.level)}</select></label><fieldset><legend>When could you meet?</legend><div class="checkboxes">${SLOTS.map(v => `<label class="check-label"><input type="checkbox" name="availability" value="${escape(v)}" ${p.availability.includes(v) ? 'checked' : ''}>${escape(v)}</label>`).join('')}</div></fieldset><label class="field">A few interests, separated by commas<input name="interests" maxlength="198" value="${escape(p.interests.join(', '))}" placeholder="Coffee, books, walking"></label><label class="check-label"><input name="adult" type="checkbox" required ${p.adult ? 'checked' : ''}>I am at least 18 years old.</label><section class="dating-settings" id="dating-settings"><label class="check-label"><input type="checkbox" name="dating" id="dating-toggle" ${p.dating ? 'checked' : ''}><strong>I’m also open to language dates</strong></label><p>Off by default. Turning this on only introduces you to adults who have also opted in and meet your mutual preferences. Regular language partner invitations stay platonic.</p><div id="dating-fields" ${p.dating ? '' : 'hidden'}><fieldset><legend>I’d like to date</legend><div class="checkboxes">${GENDERS.map(g => `<label class="check-label"><input type="checkbox" name="datingGenders" value="${g}" ${p.datingGenders.includes(g) ? 'checked' : ''}>${g}</label>`).join('')}</div></fieldset><div class="form-grid"><label class="field">Minimum age<input name="ageMin" type="number" min="18" max="100" value="${p.ageMin}" required></label><label class="field">Maximum age<input name="ageMax" type="number" min="18" max="100" value="${p.ageMax}" required></label></div></div><p>Turning dating off cancels any active date invitations in this preview.</p></section><p class="inline-note">Changing languages, availability or dating preferences cancels active invitations that no longer fit.</p>${errorNode}<div class="form-actions"><button class="button" type="button" data-action="close">Cancel</button><button class="button primary" type="submit">Save my profile ${icon('check')}</button></div></form>`);
  $('#dating-fields').querySelectorAll('input').forEach(input => { input.disabled = !p.dating; });
  if (datingFocus) { $('#dating-settings').scrollIntoView({ block: 'center' }); $('#dating-toggle').focus({ preventScroll: true }); }
}
function personModal(id) {
  const p = matches(state.profile, mode, {}, state.blocked).find(p => p.id === id);
  if (!p) return toast('This profile is no longer available for your exchange.');
  showModal(`Meet ${p.name}.`, `<p class="modal-lead">Fictional profile · ${mode === 'date' ? 'Both open to a language date' : 'A platonic language exchange'}</p><div class="detail-person">${portrait(p)}<div><h3>${escape(p.name)}, ${p.age}</h3><p>${escape(p.area)} · Sydney</p></div></div><p class="detail-bio">${escape(p.bio)}</p><div class="exchange-summary"><div>${escape(p.speaks)}<span>They help you</span></div>${icon('swap')}<div>${escape(p.learns)}<span>You help them</span></div></div><p class="small">Shared times: ${p.sharedTimes.map(escape).join(', ')}.</p><div class="detail-actions"><button class="button primary" data-action="invite" data-id="${id}">Suggest a meetup ${icon('arrow')}</button><button class="button" data-action="report" data-id="${id}">Report</button><button class="button danger" data-action="block" data-id="${id}">Block</button></div>`);
}
function inviteModal(id, group = false) {
  const p = group ? eligibleGroups(state.profile, state.blocked).find(g => g.id === id) : matches(state.profile, mode, {}, state.blocked).find(p => p.id === id);
  if (!p) return toast('This exchange is no longer available for your profile.');
  const kind = group ? 'group' : mode;
  const old = activePlans().find(v => v.target === id && v.kind === kind);
  if (old) return conversationModal(old.id);
  const shared = group ? [p.slot] : p.sharedTimes;
  const selectedSlot = shared.includes(slot) ? slot : shared[0];
  const date = group ? nextDate(p.weekday) : defaultDate(selectedSlot);
  const time = group ? p.time : selectedSlot.endsWith('morning') ? '10:00' : selectedSlot.endsWith('afternoon') ? '14:00' : '18:00';
  const note = group ? `I’d love to join and swap ${state.profile.speaks} for ${state.profile.learns}.` : `Hi ${p.name}! Fancy a coffee and a language swap? We could try 20 minutes in ${state.profile.learns} and 20 in ${state.profile.speaks}.`;
  showModal(group ? p.title : kind === 'date' ? `A language date with ${p.name}.` : `Say hello to ${p.name}.`, `<p class="modal-lead">${group ? escape(p.description) : `A ${kind === 'date' ? 'date with a language exchange' : 'platonic language meetup'}. Suggest a plan and leave room to agree on the details together.`}</p><form id="invite-form" data-target="${id}" data-kind="${kind}"><div class="exchange-summary"><div>20 minutes<span>${escape(state.profile.learns)}</span></div>${icon('swap')}<div>20 minutes<span>${escape(state.profile.speaks)}</span></div></div><p class="inline-note">${group ? 'Sample group session' : 'You’re both available'}: ${shared.map(escape).join(', ')}. Times use this device’s local timezone.</p><div class="form-grid"><label class="field">${group ? 'Session date' : 'Date'}<input name="date" type="date" value="${date}" required ${group ? 'readonly' : ''}></label><label class="field">Time<input name="time" type="time" value="${time}" required ${group ? 'readonly' : ''}></label></div><label class="field">A public place<select name="venue">${options(VENUES, `A café in ${p.area === 'CBD' ? 'the CBD' : p.area}`)}</select></label><label class="field">Make it a regular thing?<select name="repeat"><option value="once">Just this once</option><option value="weekly">Every week, at the same time</option></select></label><label class="field">${group ? 'Introduce yourself' : 'A little hello'}<textarea name="note" rows="3" maxlength="400" required>${escape(note)}</textarea></label><p class="inline-note">This saves a demo request in this browser. Nobody is contacted and no place is booked.</p>${errorNode}<div class="form-actions"><button class="button" type="button" data-action="close">Not now</button><button class="button ${kind === 'date' ? 'purple' : 'primary'}" type="submit">Save demo ${group ? 'join request' : 'invitation'} ${icon('arrow')}</button></div></form>`);
}
function conversationModal(id) {
  const p = state.plans.find(v => v.id === id); if (!p) return;
  showModal(targetName(p), `<p class="modal-lead">${modeTitle[p.kind]} · ${formattedDate(p.date)} · ${escape(p.time)}<br>${escape(p.venue)} · ${p.repeat === 'weekly' ? 'Every week from this date' : 'One meetup'}</p><span class="status-pill ${p.status === 'cancelled' ? 'cancelled' : ''}">${p.status === 'cancelled' ? 'Cancelled' : 'Demo request · not confirmed'}</span><p class="inline-note">Only your messages appear here. This preview doesn’t contact people or simulate their replies.</p><div class="message-list" aria-label="Your local messages">${p.messages.map(m => `<div class="message">${escape(m.text)}<small>You · saved in this preview</small></div>`).join('')}</div>${p.status !== 'cancelled' ? `<form id="message-form" data-id="${escape(id)}"><label class="field">Add a message<textarea name="message" rows="2" maxlength="400" required placeholder="What would you like to practise?"></textarea></label>${errorNode}<div class="form-actions"><button class="button danger" type="button" data-action="cancel-plan" data-id="${escape(id)}">Cancel request</button><button class="button primary" type="submit">Save demo message ${icon('arrow')}</button></div></form>` : '<p class="small muted">This request is closed. You can make a new invitation from Discover.</p>'}`);
}
function confirmModal(title, description, action, id = '') { showModal(title, `<p class="modal-lead">${escape(description)}</p><div class="form-actions"><button class="button" data-action="close">Keep it</button><button class="button danger" data-action="${action}" data-id="${escape(id)}">${action === 'do-reset' ? 'Reset preview' : action === 'do-block' ? 'Block profile' : 'Cancel request'}</button></div>`); }
function cancelIncompatiblePlans() {
  let count = 0;
  for (const p of state.plans) {
    const eligible = p.kind === 'group' ? eligibleGroups(state.profile, state.blocked).some(g => g.id === p.target) : matches(state.profile, p.kind, {}, state.blocked).some(person => person.id === p.target && person.sharedTimes.includes(slotFor(p.date, p.time)));
    if (p.status !== 'cancelled' && !eligible) { p.status = 'cancelled'; count++; }
  }
  return count;
}
document.addEventListener('click', e => {
  const button = e.target.closest('[data-action]'); if (!button) return;
  const action = button.dataset.action, id = button.dataset.id;
  if (action === 'close') closeModal();
  if (action === 'profile') profileModal();
  if (action === 'dating-settings') profileModal(true);
  if (action === 'mode') { mode = button.dataset.mode; render(); $(`[data-mode="${mode}"]`)?.focus({ preventScroll: true }); }
  if (action === 'reset-filters') { area = ''; slot = ''; render(); }
  if (action === 'person') personModal(id);
  if (action === 'invite') inviteModal(id);
  if (action === 'join') inviteModal(id, true);
  if (action === 'conversation') conversationModal(id);
  if (action === 'cancel-plan') confirmModal('Cancel this request?', 'This closes the local invitation and its conversation. Nothing will be sent to anyone.', 'do-cancel', id);
  if (action === 'do-cancel') { const p = state.plans.find(v => v.id === id); if (p) p.status = 'cancelled'; save(); render(); closeModal(); toast('Demo request cancelled.'); }
  if (action === 'block') confirmModal('Block this profile?', 'They will disappear from your discoveries. Active invitations with them will be cancelled, and groups they are in will be hidden. You can unblock them from your profile.', 'do-block', id);
  if (action === 'do-block') { if (PEOPLE.some(p => p.id === id) && !state.blocked.includes(id)) state.blocked.push(id); cancelIncompatiblePlans(); save(); render(); closeModal(); toast('Profile blocked in this preview.'); }
  if (action === 'unblock') { state.blocked = state.blocked.filter(v => v !== id); save(); render(); toast('Profile unblocked. Cancelled invitations stay closed.'); }
  if (action === 'reset') confirmModal('Start with a fresh hello?', 'This removes only this preview’s profile, invitations, messages, blocks and reports from this browser. It cannot be undone.', 'do-reset');
  if (action === 'do-reset') {
    try { localStorage.removeItem(STORAGE_KEY); storageLocked = false; storageProblem = ''; state = initialState(); mode = 'partner'; area = ''; slot = ''; render(); closeModal(); toast('Preview reset to the sample profile.'); }
    catch { toast('This browser could not clear saved data. Try its site storage settings.'); }
  }
  if (action === 'report') showModal('Flag a concern.', `<p class="modal-lead">In a real pilot, reports need a moderation team. This demo stores your selection locally; it is not submitted to anyone.</p><form id="report-form" data-target="${escape(id)}"><label class="field">What happened?<select name="reason">${options(['Unwanted flirting', 'Misleading profile', 'Harassment', 'Other concern'], '')}</select></label>${errorNode}<div class="form-actions"><button class="button" type="button" data-action="close">Cancel</button><button class="button primary" type="submit">Save local report</button></div></form>`);
  if (action === 'about') showModal('An idea you can try.', `<p class="modal-lead">DuoDialect brings together people who can help each other practise a language, with a clear choice between friendship, small groups and dating.</p><ul class="about-list"><li><strong>Every person and group is fictional.</strong> Illustrations represent sample profiles, not real members.</li><li>Profiles, invitations and messages stay in this browser. Nobody is contacted, and invitations aren’t bookings or confirmed matches.</li><li>Dating starts off. Both people must opt in, be adults, and fit each other’s gender and age preferences.</li><li>You can edit your profile, try different languages, plan a weekly meetup, join a sample group, or block a profile.</li><li>This is an adults only concept preview. Real accounts, age checks, messaging, moderation and shared availability need a separate live service before a public pilot.</li></ul><div class="form-actions"><button class="button primary" data-action="close">Let’s explore ${icon('arrow')}</button></div>`);
});
document.addEventListener('change', e => {
  if (e.target.id === 'area-filter' || e.target.id === 'slot-filter') {
    const id = e.target.id; if (id === 'area-filter') area = e.target.value; else slot = e.target.value;
    render(); $(`#${id}`)?.focus({ preventScroll: true });
  }
  if (e.target.id === 'dating-toggle') {
    $('#dating-fields').hidden = !e.target.checked;
    $('#dating-fields').querySelectorAll('input').forEach(input => { input.disabled = !e.target.checked; });
  }
});
document.addEventListener('submit', e => {
  e.preventDefault(); const form = e.target, data = new FormData(form);
  try {
    if (form.id === 'profile-form') {
      const profile = validateProfile({ name: data.get('name').trim(), age: Number(data.get('age')), adult: data.has('adult'), gender: data.get('gender'), area: data.get('area'), speaks: data.get('speaks'), learns: data.get('learns'), level: data.get('level'), availability: data.getAll('availability'), interests: data.get('interests').split(',').map(s => s.trim()).filter(Boolean), dating: data.has('dating'), datingGenders: data.has('dating') ? data.getAll('datingGenders') : state.profile.datingGenders, ageMin: data.has('dating') ? Number(data.get('ageMin')) : state.profile.ageMin, ageMax: data.has('dating') ? Number(data.get('ageMax')) : state.profile.ageMax });
      state.profile = profile; const cancelled = cancelIncompatiblePlans(); area = ''; slot = ''; save(); render(); closeModal(); toast(`Profile updated.${cancelled ? ` ${cancelled} incompatible request${cancelled === 1 ? '' : 's'} cancelled.` : ''}`);
    }
    if (form.id === 'invite-form') {
      const proposal = { ...Object.fromEntries(data), kind: form.dataset.kind, target: form.dataset.target };
      const plan = createPlan(state, proposal); state.plans.push(plan); save(); render(); conversationModal(plan.id); toast('Demo invitation saved. No message has been sent to a real person.');
    }
    if (form.id === 'message-form') {
      const p = state.plans.find(v => v.id === form.dataset.id); const message = data.get('message').trim();
      if (!p || p.status !== 'pending') throw new Error('This request is closed.');
      if (!message || message.length > 400) throw new Error('Write a message of up to 400 characters.');
      if (p.messages.length >= 200) throw new Error('This demo conversation has reached its message limit.');
      p.messages.push({ text: message, at: Date.now() }); save(); conversationModal(p.id); $('#message-form textarea').focus(); toast('Message saved locally.');
    }
    if (form.id === 'report-form') {
      if (state.reports.length >= 100) throw new Error('This preview has reached its local report limit.');
      state.reports.push({ target: form.dataset.target, reason: data.get('reason') }); save(); closeModal(); toast('Report saved locally. No moderation team has received it.');
    }
  } catch (error) { formError(error.message); }
});
window.addEventListener('hashchange', () => { render(); $('#main').focus({ preventScroll: true }); window.scrollTo(0, 0); });
window.addEventListener('storage', event => {
  if (event.key === STORAGE_KEY || event.key === null) {
    storageLocked = true; storageProblem = 'This preview changed in another tab. Reload to use those changes before saving here; your current tab has not overwritten them.'; renderStorage();
  }
});
render();
