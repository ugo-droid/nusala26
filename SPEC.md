# NUSALA 26 Convention App — Build Spec

Installable PWA for the 29th Nnewi USA Convention, July 23–26 2026, Embassy Suites El Segundo.
Deploy target: **nusala26.pages.dev** (Cloudflare account already connected).
Deadline: live by **Wednesday July 22 evening**. Convention starts Thursday.

Build phase-by-phase. Each phase ends deployable. No frameworks, no build step, no npm dependencies in the client. Plain HTML/CSS/JS + Cloudflare Pages Functions.

---

## Stack

- **Cloudflare Pages** project `nusala26`, static files at repo root, API in `functions/`.
- **KV namespace `NUSALA`** bound to Pages. Keys:
  - `data` — the entire app content as one JSON blob (schema below)
  - `sub:<base64url endpoint hash>` — one push subscription per key
- **Secrets** (Pages env vars): `ADMIN_PASSWORD` = `NUSALA2026`, `VAPID_PUBLIC`, `VAPID_PRIVATE`, `VAPID_SUBJECT` = `mailto:ugo@iconarc.com`.
  Generate VAPID pair once with WebCrypto (P-256) in a local node script; paste into dashboard. Also hardcode `VAPID_PUBLIC` in `app.js` (it's public).

## Files (complete list — do not add more)

```
index.html        app shell: all 4 views in one page (home/schedule/speakers/info), JS toggles
style.css         design system below
app.js            fetch data, render, poll, push subscribe, share
sw.js             service worker: cache shell, network-first data, push handler
manifest.json     PWA manifest
admin.html        admin backend (self-contained, own inline JS is fine)
functions/api/[[path]].js   all endpoints in one file
assets/           logos, hero (already extracted), icons
```

## API (`functions/api/[[path]].js`)

| Route | Method | Auth | Action |
|---|---|---|---|
| `/api/data` | GET | none | KV `data`, `Cache-Control: no-store` |
| `/api/data` | POST | yes | validate JSON.parse + required top-level keys, write KV |
| `/api/subscribe` | POST | none | store push subscription in KV |
| `/api/notify` | POST | yes | body `{title, body}` → Web Push to all `sub:*` keys; delete subs that return 404/410 |

Auth: header `x-admin-key` compared to `ADMIN_PASSWORD`. Wrong key → 401. This is a community event app, not a bank — no sessions, no JWT. `// ponytail: shared password auth, upgrade never`

Web Push on Workers: no `web-push` npm lib. Implement VAPID manually with WebCrypto — ES256-sign JWT `{aud: endpoint origin, exp: now+12h, sub: VAPID_SUBJECT}`, headers `Authorization: vapid t=<jwt>, k=<VAPID_PUBLIC>`, `TTL: 86400`. Send **payload-less** POST (empty body) — skips aes128gcm encryption entirely, ~40 lines saved. `sw.js` push handler fetches `/api/data` and shows latest announcement as the notification. `// ponytail: payload-less push, add encryption never — data fetch covers it`

Notify loop: subscriptions fanout with `Promise.allSettled`, batches of 50. Hundreds of users max — fine.

## data.json schema + seed

Seed KV `data` with exactly this (schedule transcribed from the revised program PDF; handwritten markups applied):

```json
{
  "updated": "2026-07-21T17:00:00Z",
  "donateUrl": "",
  "announcements": [
    { "id": 1, "time": "2026-07-21T17:00:00Z", "text": "Welcome to NUSALA 26! Add this app to your home screen to get updates." }
  ],
  "venue": {
    "name": "Embassy Suites by Hilton",
    "address": "1440 E Imperial Ave, El Segundo, CA 90245",
    "room": "Barcelona Room",
    "phone": "310-433-4020",
    "email": "nnewiusa@yahoo.com"
  },
  "days": [
    { "date": "2026-07-23", "label": "Thursday", "events": [
      { "id": "t1", "start": "12:00", "end": "19:00", "title": "Arrival of convention participants" },
      { "id": "t2", "start": "14:00", "end": "18:00", "title": "Registration" },
      { "id": "t3", "start": "19:00", "end": "21:00", "title": "Welcome reception" },
      { "id": "t4", "start": "21:00", "end": "22:00", "title": "Executive and delegates meeting" }
    ]},
    { "date": "2026-07-24", "label": "Friday", "events": [
      { "id": "f1", "start": "07:00", "end": "08:30", "title": "Breakfast" },
      { "id": "f2", "start": "09:30", "end": "10:30", "title": "Opening ceremony" },
      { "id": "f3", "start": "10:30", "end": "13:00", "title": "Chapter reports", "note": "All chapters" },
      { "id": "f4", "start": "13:00", "end": "14:00", "title": "Lunch" },
      { "id": "f5", "start": "14:30", "end": "17:00", "title": "Family tour and exploration of Los Angeles" },
      { "id": "f6", "start": "18:00", "end": "19:30", "title": "Young adult mixer", "note": "Ages 21–35" },
      { "id": "f7", "start": "19:30", "end": "20:30", "title": "Dinner" },
      { "id": "f8", "start": "20:30", "end": "23:00", "title": "Cultural night", "note": "Dr. Chinyelu Izuchukwu · Dr. Blessing Nwosu" }
    ]},
    { "date": "2026-07-25", "label": "Saturday", "events": [
      { "id": "s1", "start": "07:00", "end": "08:30", "title": "Registration" },
      { "id": "s2", "start": "07:30", "end": "08:30", "title": "Breakfast" },
      { "id": "s3", "start": "09:00", "end": "11:00", "title": "Session 1: Panel discussion", "note": "Engaging Nnewi business leaders and diaspora executives — Chimezie Metu, Kenny Uba, Dr. Ezinne Onwuatuegwu, Tobenna Mbelu" },
      { "id": "s4", "start": "11:15", "end": "13:00", "title": "Session 2: Presentations", "note": "Mr. Jacob / Mrs. Madubuko, Chimezie Metu, Mayor Pro Tem Alex Monteiro (City of Hawthorne), Kez. Udezue, Kenny Uba" },
      { "id": "s5", "start": "13:30", "end": "14:30", "title": "Keynote: Dr. Ike Okwuosa MD", "note": "Relationship forum — building strong families and community bonds" },
      { "id": "s6", "start": "14:30", "end": "16:00", "title": "Children's activities · NUSA Multi-Purpose Blvd presentation" },
      { "id": "s7", "start": "16:00", "end": "17:00", "title": "Financial literacy gameshow", "note": "Learn · Play · Win" },
      { "id": "s8", "start": "17:00", "end": "18:30", "title": "Fundraising event", "note": "Investing in Nnewi's future" },
      { "id": "s9", "start": "19:00", "end": "21:00", "title": "Election", "note": "Nnewi USA national elections" },
      { "id": "s10", "start": "19:30", "end": "23:59", "title": "Gala night", "note": "Buffet dinner · cultural performances (Mazi Dozie Okonkwo, moderator Chiazam Mbelu) · awards · raffle draw · dance" }
    ]},
    { "date": "2026-07-26", "label": "Sunday", "events": [
      { "id": "u1", "start": "07:30", "end": "08:30", "title": "Breakfast" },
      { "id": "u2", "start": "09:00", "end": "10:30", "title": "Thanksgiving / church service" },
      { "id": "u3", "start": "10:30", "end": "11:00", "title": "Delegates meeting / closing" },
      { "id": "u4", "start": "13:00", "end": "23:59", "title": "Departures" }
    ]}
  ],
  "speakers": [
    { "name": "Dr. Ike Okwuosa MD", "role": "Keynote speaker", "bio": "", "photo": "" },
    { "name": "Chimezie Metu", "role": "Panelist / presenter", "bio": "", "photo": "" },
    { "name": "Kenny Uba", "role": "Panelist / presenter", "bio": "", "photo": "" },
    { "name": "Dr. Ezinne Onwuatuegwu", "role": "Panelist", "bio": "", "photo": "" },
    { "name": "Tobenna Mbelu", "role": "Panelist", "bio": "", "photo": "" },
    { "name": "Mayor Pro Tem Alex Monteiro", "role": "City of Hawthorne", "bio": "", "photo": "" },
    { "name": "Mazi Dozie Okonkwo", "role": "Gala night", "bio": "", "photo": "" },
    { "name": "Chiazam Mbelu", "role": "Gala moderator", "bio": "", "photo": "" }
  ]
}
```

PDF markups were ambiguous in spots (opening ceremony time, gala start 6:30 vs 7:30, Sat afternoon overlaps). Seed as above; **admin fixes live via backend** — that is the whole point of the backend. Flag these three to the user at handoff.

## Design (locked — matches approved mockup)

- Colors: bg `#241452`, deep accent `#170c38`, gold `#f6b21b`, cream card `#fdf9f0`, card heading `#26215c`, card body `#5f5e5a`, muted lavender `#cfc4f0`, secondary card `#3b2a75`.
- **Older-crowd rules: base font 18px, event titles 20px, min tap target 48px, contrast AA on every pair, no thin weights.**
- Home: header (logo `assets/logo-nusala.png` + "29th Nnewi USA Convention · July 23–26") over hero strip `assets/hero-top.png` (darkened overlay `rgba(23,12,56,.55)` so gold text reads); "Up next" card (computed from schedule vs device clock, gold left border); Schedule / Venue / Donate / Share cream card buttons; announcements list (purple cards, gold bell).
- Every page footer: flat LA skyline SVG silhouette (`#170c38` buildings, gold window dots, palm silhouettes) sitting behind fixed bottom nav (`rgba(20,10,45,.92)`).
- Bottom nav: Home · Schedule · Speakers · Info. Gold = active, lavender = inactive, icon + 12px label.
- Schedule view: 4 day chips (Thu/Fri/Sat/Sun), cream event cards, time in gold-brown `#854f0b`, current event highlighted gold-tint.
- Speakers: cream cards, initials circle if no photo.
- Info: venue card with `tel:`, `mailto:`, Google Maps link (`https://maps.google.com/?q=1440+E+Imperial+Ave,+El+Segundo,+CA+90245`), sponsors section (render only if data later gains it — skip UI otherwise), contact.
- Donate button: hidden when `donateUrl` empty.
- Share: `navigator.share({title, url})`, fallback `navigator.clipboard.writeText` + "Link copied".
- View switching: hash router — `location.hash` + one `render()` — no library.

## PWA

- `manifest.json`: name "NUSALA 26", short_name "NUSALA 26", `display: standalone`, `background_color: #241452`, `theme_color: #241452`, icons 192 + 512 (generate from `assets/logo-crest.png` on purple rounded square — ImageMagick or PIL).
- `sw.js`: on install cache shell files; fetch handler: `/api/` network-only, else cache-first; `push` event → `fetch('/api/data')` → `showNotification(latest announcement)`; `notificationclick` → focus/open `/`.
- App polls `/api/data` every 60s while visible (`document.visibilitychange` aware); if `updated` changed → re-render + slide-down banner with newest announcement.
- First visit prompt (dismissible, remember in localStorage): iOS → "Tap Share → Add to Home Screen for updates"; Android/desktop → button that calls saved `beforeinstallprompt`.
- After install/first load, ask notification permission behind a "Get updates" button tap (never auto-prompt).

## Admin (`admin.html`)

Single page, desktop-and-phone friendly, same big-text styling. Password field → stored in localStorage → sent as `x-admin-key` on every request. Sections:

1. **Announcements** — list, add (textarea), delete. "Post" and "Post + notify everyone" buttons.
2. **Schedule** — day tabs; each event row: time inputs (`<input type="time">`), title, note, location, delete button; "Add event" per day. Drag-sort not needed — render sorted by start time.
3. **Speakers** — add/edit/remove name, role, bio, photo URL.
4. **Settings** — donate URL field.
5. Sticky **Save** bar → POST whole JSON. Confirm dialog on delete. That's it.

`// ponytail: whole-blob save, last-writer-wins. One admin exists. Add versioning never.`

## Phases (each ends with deploy + check)

1. **Shell + design**: index.html/style.css/app.js with seeded data inlined as fallback, all 4 views, skyline, nav. Deploy static.
2. **API + KV**: functions file, seed KV, app fetches live data. Check: edit KV via wrangler → app updates.
3. **Admin**: admin.html full CRUD. Check: change a time in admin → phone app shows it within 60s.
4. **PWA + push**: manifest, sw.js, VAPID, subscribe, notify. Check: install on one iPhone (Add to Home Screen) + one Android, send test push from admin, both receive.
5. **Polish**: icons, share, install prompts, Lighthouse PWA pass, real-device font-size sanity check.

## Runnable check (per ponytail)

One `test.html` page (or node script) hitting: GET /api/data returns valid schema; POST /api/data without key → 401; with key → 200 and readback matches. Assert-based, no framework.

## Handoff notes for the user

- Admin URL: `nusala26.pages.dev/admin.html` — password `NUSALA2026`. Do not post the URL publicly.
- Three seeded times were ambiguous in the PDF markups — verify in admin: Friday opening ceremony (9:30–10:30?), Saturday gala start (6:30 or 7:30 pm), Saturday afternoon overlaps (election 7–9 pm vs gala 7:30).
- Speaker photos/bios and sponsor logos: add via admin (photos as URLs) or drop files in assets + redeploy.
- If the user supplies clean logo PNGs later, replace `assets/logo-nusala.png` / `logo-crest.png` (current ones are 300dpi crops from the PDF, good enough).

## Skipped (deliberate)

- Accounts, favorites/my-agenda, multi-admin, edit history, image upload, analytics, custom domain, framework, database. Add none of them for a 4-day event.
- Push payload encryption — payload-less push + data fetch covers it.
