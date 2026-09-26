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
