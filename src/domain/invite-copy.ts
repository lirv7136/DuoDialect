/**
 * Copy for an empty Discover: honest about why nobody is shown, and an invite message
 * a person can share to bring a matching partner in. Language names arrive lower cased.
 */
import { displayLanguage } from "./languages";

function either(values: readonly string[]): string {
  const names = [...new Set(values.map(displayLanguage).filter(Boolean))];
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

/** "English ⇄ Japanese", or "" when either side is missing. */
export function exchangeLabel(offers: readonly string[], seeks: readonly string[]): string {
  const give = either(offers), get = either(seeks);
  return give && get ? `${give} ⇄ ${get}` : "";
}

export function emptyDiscoverTitle(offers: readonly string[], seeks: readonly string[], city: string): string {
  const label = exchangeLabel(offers, seeks);
  return label ? `No one in ${city} fits ${label} yet.` : `No one in ${city} fits your exchange yet.`;
}

export function inviteMessage(offers: readonly string[], seeks: readonly string[], appName: string, url: string): string {
  const give = either(offers), get = either(seeks);
  if (!give || !get) return `I’m swapping languages on ${appName}. Know someone who wants a language partner? ${url}`;
  return `I’m swapping ${give} ⇄ ${get} on ${appName}. Know a ${get} speaker who wants to practise ${give}? ${url}`;
}

/** "3 people here are learning English." Empty when nobody is. */
export function learningYourLanguageLine(count: number, offers: readonly string[]): string {
  const what = either(offers);
  if (count <= 0 || !what) return "";
  return count === 1 ? `1 person here is learning ${what}.` : `${count} people here are learning ${what}.`;
}

/**
 * Why someone is only one step from matching, from the viewer's side. Never blames
 * anyone: a level can change, and so can a language list.
 */
export function nearMissReason(
  reason: string,
  me: { offers: readonly string[]; seeks: readonly string[] },
  them: { offers: readonly string[]; seeks: readonly string[] },
): string {
  if (reason === "language/insufficient-fluency") return "You share a pair, but one of you isn’t fluent enough to teach it yet.";
  const wantsMine = them.seeks.some(lang => me.offers.includes(lang));
  const speaksMine = them.offers.some(lang => me.seeks.includes(lang));
  if (wantsMine && !speaksMine) return `Wants ${either(me.offers)}, but doesn’t speak ${either(me.seeks)}.`;
  if (speaksMine && !wantsMine) return `Speaks ${either(me.seeks)}, but isn’t learning ${either(me.offers)}.`;
  return "Not a two way match yet.";
}
