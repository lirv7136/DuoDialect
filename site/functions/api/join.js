// POST /api/join: add someone to the founding-members waitlist (Cloudflare Pages Function, D1 binding DB).
// Accepts a normal form post (redirects to the thank-you page) or JSON from fetch (returns JSON).

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const PLATFORMS = new Set(["ios", "android"]);
const ALLOWED_ORIGINS = new Set(["https://talkeven.com", "https://www.talkeven.com", "https://talkeven.pages.dev"]);

function clean(value, max) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

async function readBody(request) {
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) return request.json().catch(() => ({}));
  const form = await request.formData().catch(() => null);
  return form ? Object.fromEntries(form) : {};
}

function reply(request, status, body) {
  const wantsJson = (request.headers.get("accept") || "").includes("application/json");
  if (wantsJson) return Response.json(body, { status });
  const url = new URL(request.url);
  const target = body.ok ? "/join/thanks/" : `/join/?error=${encodeURIComponent(body.error || "Something went wrong.")}`;
  return Response.redirect(`${url.origin}${target}`, 303);
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("origin");
  if (origin && !ALLOWED_ORIGINS.has(origin) && !origin.endsWith(".talkeven.pages.dev")) {
    return new Response("Forbidden", { status: 403 });
  }

  const body = await readBody(request);
  // Honeypot: people never see this field, so anything in it is a bot. Pretend it worked.
  if (clean(body.website, 200)) return reply(request, 200, { ok: true });

  const email = clean(body.email, 254).toLowerCase();
  const firstName = clean(body.first_name, 40);
  const speaks = clean(body.speaks, 40).toLowerCase();
  const learning = clean(body.learning, 40).toLowerCase();
  const suburb = clean(body.suburb, 60);
  const platform = clean(body.platform, 10).toLowerCase();
  const source = clean(body.source, 40);

  if (!EMAIL.test(email)) return reply(request, 400, { ok: false, error: "Please enter a valid email address." });
  if (!firstName) return reply(request, 400, { ok: false, error: "Please tell us your first name." });
  if (!speaks || !learning) return reply(request, 400, { ok: false, error: "Tell us a language you speak and one you're learning." });
  if (speaks === learning) return reply(request, 400, { ok: false, error: "Your two languages need to be different." });
  if (!PLATFORMS.has(platform)) return reply(request, 400, { ok: false, error: "Choose iPhone or Android." });
  if (body.adult !== "on" && body.adult !== true && body.adult !== "true") {
    return reply(request, 400, { ok: false, error: "Talkeven is for people aged 18 and over." });
  }

  await env.DB.prepare(
    `INSERT INTO waitlist (email, first_name, speaks, learning, suburb, platform, source)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
     ON CONFLICT(email) DO UPDATE SET first_name = ?2, speaks = ?3, learning = ?4, suburb = ?5,
       platform = ?6, updated_at = datetime('now')`,
  ).bind(email, firstName, speaks, learning, suburb || null, platform, source || null).run();

  return reply(request, 200, { ok: true });
}

export function onRequest() {
  return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });
}
