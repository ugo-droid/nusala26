// NUSALA 26 API — all endpoints in one Pages Function.
// ponytail: shared password auth + whole-blob storage; one admin, few hundred users.

const JSON_HEADERS = { "content-type": "application/json", "cache-control": "no-store" };

export async function onRequest(context) {
  const { request, env, params } = context;
  const path = (params.path || []).join("/");
  const method = request.method;

  if (method === "OPTIONS") return new Response(null, { status: 204 });

  try {
    if (path === "data" && method === "GET") return getData(env);
    if (path === "data" && method === "POST") return authed(request, env, postData);
    if (path === "subscribe" && method === "POST") return subscribe(request, env);
    if (path === "notify" && method === "POST") return authed(request, env, notify);
    if (path === "photos" && method === "GET") return listPhotos(env);
    if (path === "photos" && method === "POST") return uploadPhoto(request, env);
    if (path.startsWith("photo/") && method === "GET") return getPhoto(path.slice(6), env);
    if (path.startsWith("photo/") && method === "DELETE") return authed(request, env, () => deletePhoto(path.slice(6), env));
    if (path === "pending" && method === "GET") return authed(request, env, () => listPending(env));
    if (path.startsWith("approve/") && method === "POST") return authed(request, env, () => approvePhoto(path.slice(8), env));
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: JSON_HEADERS });
  }
  return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: JSON_HEADERS });
}

async function authed(request, env, fn) {
  if (request.headers.get("x-admin-key") !== env.ADMIN_PASSWORD || !env.ADMIN_PASSWORD) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: JSON_HEADERS });
  }
  return fn(request, env);
}

async function getData(env) {
  const data = await env.NUSALA.get("data");
  if (!data) return new Response(JSON.stringify({ error: "no data" }), { status: 404, headers: JSON_HEADERS });
  return new Response(data, { headers: JSON_HEADERS });
}

async function postData(request, env) {
  const text = await request.text();
  if (text.length > 250_000) return bad("payload too large");
  let d;
  try { d = JSON.parse(text); } catch { return bad("invalid JSON"); }
  if (!Array.isArray(d.days) || !Array.isArray(d.announcements) || !Array.isArray(d.speakers) || typeof d.venue !== "object") {
    return bad("missing required keys: days, announcements, speakers, venue");
  }
  d.updated = new Date().toISOString();
  await env.NUSALA.put("data", JSON.stringify(d));
  return new Response(JSON.stringify({ ok: true, updated: d.updated }), { headers: JSON_HEADERS });
}

function bad(msg) {
  return new Response(JSON.stringify({ error: msg }), { status: 400, headers: JSON_HEADERS });
}

async function subscribe(request, env) {
  let sub;
  try { sub = await request.json(); } catch { return bad("invalid JSON"); }
  if (!sub || typeof sub.endpoint !== "string" || !sub.endpoint.startsWith("https://")) return bad("invalid subscription");
  const hash = await sha256hex(sub.endpoint);
  await env.NUSALA.put("sub:" + hash, JSON.stringify(sub));
  return new Response(JSON.stringify({ ok: true }), { headers: JSON_HEADERS });
}

async function notify(request, env) {
  if (!env.VAPID_PUBLIC || !env.VAPID_PRIVATE) return bad("push not configured");
  const list = await env.NUSALA.list({ prefix: "sub:" });
  let sent = 0, dead = 0, failed = 0;
  const jwtCache = {};

  const results = await Promise.allSettled(list.keys.map(async (k) => {
    const raw = await env.NUSALA.get(k.name);
    if (!raw) return;
    const sub = JSON.parse(raw);
    const origin = new URL(sub.endpoint).origin;
    if (!jwtCache[origin]) jwtCache[origin] = await vapidJwt(origin, env);
    // ponytail: payload-less push — sw fetches /api/data for content, no aes128gcm needed
    const r = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        TTL: "86400",
        Authorization: `vapid t=${jwtCache[origin]}, k=${env.VAPID_PUBLIC}`,
      },
    });
    if (r.status === 404 || r.status === 410) {
      await env.NUSALA.delete(k.name);
      dead++;
    } else if (r.ok || r.status === 201) sent++;
    else failed++;
  }));
  results.forEach((r) => { if (r.status === "rejected") failed++; });
  return new Response(JSON.stringify({ ok: true, sent, dead, failed, total: list.keys.length }), { headers: JSON_HEADERS });
}

/* --- Photo wall --- */
// ponytail: photos as KV binary values, caption in KV metadata (free on list).
// Ceiling: KV list caps at 1000 photos, free-tier reads 100k/day — fine for one weekend; move to R2 if this outlives the convention.

async function listPhotos(env) {
  const list = await env.NUSALA.list({ prefix: "photo:" });
  const photos = list.keys
    .map((k) => ({ id: k.name.slice(6), ...(k.metadata || {}) }))
    .sort((a, b) => (a.id < b.id ? 1 : -1));
  return new Response(JSON.stringify({ photos }), { headers: JSON_HEADERS });
}

async function uploadPhoto(request, env) {
  const buf = await request.arrayBuffer();
  if (buf.byteLength > 4_000_000) return bad("photo too large");
  const bytes = new Uint8Array(buf);
  if (bytes.length < 100 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return bad("not a JPEG");
  const name = (request.headers.get("x-name") || "").slice(0, 40);
  const id = Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  const approved = await aiReview(bytes, env);
  // ponytail: fail-closed — AI unsure or down means human review in admin, never auto-publish
  const prefix = approved ? "photo:" : "pending:";
  await env.NUSALA.put(prefix + id, buf, { metadata: { n: name, t: new Date().toISOString() } });
  return new Response(JSON.stringify({ ok: true, id, status: approved ? "live" : "pending" }), { headers: JSON_HEADERS });
}

async function aiReview(bytes, env) {
  try {
    const r = await env.AI.run("@cf/llava-hf/llava-1.5-7b-hf", {
      image: [...bytes],
      prompt:
        "This photo was submitted to a family community event photo wall. Reply APPROVE if it is appropriate (people, venue, food, celebration, ordinary scenes). Reply REJECT if it contains nudity, sexual content, graphic violence, weapons, hate symbols, or offensive gestures. Reply with one word.",
      max_tokens: 10,
    });
    return /approve/i.test(r.description || r.response || "");
  } catch (e) {
    return false;
  }
}

async function listPending(env) {
  const list = await env.NUSALA.list({ prefix: "pending:" });
  const photos = list.keys.map((k) => ({ id: k.name.slice(8), ...(k.metadata || {}) })).sort((a, b) => (a.id < b.id ? 1 : -1));
  return new Response(JSON.stringify({ photos }), { headers: JSON_HEADERS });
}

async function approvePhoto(id, env) {
  if (!/^[\w-]+$/.test(id)) return bad("bad id");
  const { value, metadata } = await env.NUSALA.getWithMetadata("pending:" + id, "arrayBuffer");
  if (!value) return bad("not pending");
  await env.NUSALA.put("photo:" + id, value, { metadata });
  await env.NUSALA.delete("pending:" + id);
  return new Response(JSON.stringify({ ok: true }), { headers: JSON_HEADERS });
}

async function getPhoto(id, env) {
  if (!/^[\w-]+$/.test(id)) return bad("bad id");
  const img = (await env.NUSALA.get("photo:" + id, "arrayBuffer")) || (await env.NUSALA.get("pending:" + id, "arrayBuffer"));
  if (!img) return new Response("not found", { status: 404 });
  return new Response(img, {
    headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" },
  });
}

async function deletePhoto(id, env) {
  await env.NUSALA.delete("photo:" + id);
  await env.NUSALA.delete("pending:" + id);
  return new Response(JSON.stringify({ ok: true }), { headers: JSON_HEADERS });
}

/* --- VAPID (ES256 JWT via WebCrypto) --- */

function b64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob((s + pad).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
}

async function vapidJwt(audience, env) {
  const pub = b64urlDecode(env.VAPID_PUBLIC); // 65 bytes: 0x04 || x || y
  const key = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC", crv: "P-256",
      x: b64url(pub.slice(1, 33)),
      y: b64url(pub.slice(33, 65)),
      d: env.VAPID_PRIVATE,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const enc = new TextEncoder();
  const header = b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url(enc.encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env.VAPID_SUBJECT || "mailto:ugo@iconarc.com",
  })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${header}.${claims}`));
  return `${header}.${claims}.${b64url(sig)}`;
}

async function sha256hex(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
