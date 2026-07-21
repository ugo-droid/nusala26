/* NUSALA 26 app */
const VAPID_PUBLIC = "BPudFSGdFk_UUztosZU-KJy4GXpT_OU-zu9HgNjmTLTxhkQNLImcSaIOU38BSb90ihrRBjP-ilQeAucyWgAvRx0"; // replaced in phase 4

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let DATA = null;
let selectedDay = null;

const BELL = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>';

async function loadData(first) {
  let d = null;
  try {
    const r = await fetch("/api/data", { cache: "no-store" });
    if (r.ok) d = await r.json();
  } catch (e) {}
  if (!d) {
    try {
      const r = await fetch("data.json", { cache: "no-store" });
      if (r.ok) d = await r.json();
    } catch (e) {}
  }
  if (!d || !d.days) return;
  const changed = DATA && DATA.updated !== d.updated;
  DATA = d;
  render();
  if (changed && d.announcements && d.announcements.length) {
    showBanner(d.announcements[0].text);
  }
}

function showBanner(text) {
  const b = $("#banner");
  b.textContent = text;
  b.classList.add("show");
  clearTimeout(b._t);
  b._t = setTimeout(() => b.classList.remove("show"), 8000);
}

function fmtTime(hm) {
  const [h, m] = hm.split(":").map(Number);
  const ap = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, "0")} ${ap}` : `${h12} ${ap}`;
}

function eventState(day, ev, now) {
  const s = new Date(`${day.date}T${ev.start}:00`);
  const e = new Date(`${day.date}T${ev.end}:00`);
  if (now >= s && now < e) return "now";
  if (now < s) return "future";
  return "past";
}

function findUpNext() {
  const now = new Date();
  let current = null, next = null;
  for (const day of DATA.days) {
    for (const ev of day.events) {
      const st = eventState(day, ev, now);
      if (st === "now" && !current) current = { day, ev, now: true };
      if (st === "future" && !next) next = { day, ev, now: false };
    }
    if (current || next) break;
  }
  return current || next;
}

function render() {
  renderHome();
  renderSchedule();
  renderSpeakers();
  renderInfo();
}

function renderHome() {
  const up = findUpNext();
  $("#upnext").innerHTML = up
    ? `<div class="card upnext">
        <div class="label">${up.now ? "Happening now" : "Up next"} · ${esc(up.day.label)} ${fmtTime(up.ev.start)}</div>
        <h3>${esc(up.ev.title)}</h3>
        ${up.ev.note ? `<div class="meta">${esc(up.ev.note)}</div>` : ""}
      </div>`
    : `<div class="card upnext"><div class="label">NUSALA 26</div><h3>See you next year!</h3></div>`;

  const donate = $("#btn-donate");
  if (DATA.donateUrl) {
    donate.href = DATA.donateUrl;
    donate.classList.remove("hidden");
  } else donate.classList.add("hidden");

  $("#announcements").innerHTML = (DATA.announcements || [])
    .slice()
    .sort((a, b) => new Date(b.time) - new Date(a.time))
    .map((a) => `<div class="announce">${BELL}<div>${esc(a.text)}
        <span class="when">${new Date(a.time).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}</span>
      </div></div>`)
    .join("") || '<div class="announce"><div>No announcements yet.</div></div>';
}

function renderSchedule() {
  if (!selectedDay) {
    const today = new Date().toISOString().slice(0, 10);
    selectedDay = (DATA.days.find((d) => d.date === today) || DATA.days[0]).date;
  }
  $("#day-chips").innerHTML = DATA.days
    .map((d) => `<button class="${d.date === selectedDay ? "on" : ""}" data-day="${d.date}">${esc(d.label.slice(0, 3))}</button>`)
    .join("");
  $("#day-chips").querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => { selectedDay = b.dataset.day; renderSchedule(); })
  );

  const day = DATA.days.find((d) => d.date === selectedDay);
  const now = new Date();
  $("#day-events").innerHTML =
    `<h2 class="section-title">${esc(day.label)}, July ${Number(day.date.slice(8))}</h2>` +
    day.events
      .slice()
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((ev) => `<div class="card event ${eventState(day, ev, now) === "now" ? "now" : ""}">
          <div class="time">${fmtTime(ev.start)} – ${fmtTime(ev.end)}</div>
          <h3>${esc(ev.title)}</h3>
          ${ev.note ? `<div class="note">${esc(ev.note)}</div>` : ""}
          ${ev.location ? `<div class="note">📍 ${esc(ev.location)}</div>` : ""}
        </div>`)
      .join("");
}

function renderSpeakers() {
  $("#speaker-list").innerHTML = (DATA.speakers || [])
    .map((sp) => {
      const ini = sp.name.split(/\s+/).filter((w) => /^[A-Z]/.test(w)).map((w) => w[0]).slice(0, 2).join("");
      return `<div class="card speaker">
        ${sp.photo ? `<img src="${esc(sp.photo)}" alt="">` : `<div class="ini">${esc(ini)}</div>`}
        <div><h3>${esc(sp.name)}</h3><div class="meta">${esc(sp.role || "")}</div>
        ${sp.bio ? `<div class="bio">${esc(sp.bio)}</div>` : ""}</div>
      </div>`;
    })
    .join("");
}

function renderInfo() {
  const v = DATA.venue;
  const mapUrl = "https://maps.google.com/?q=" + encodeURIComponent(v.address);
  const PIN = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><path d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>';
  $("#info-body").innerHTML = `
    <div class="card">
      <h3>${esc(v.name)}</h3>
      <div class="meta">${esc(v.room)} · main convention room</div>
      <a class="info-row" href="${mapUrl}" target="_blank" rel="noopener">${PIN}${esc(v.address)}</a>
      <a class="info-row" href="tel:${esc(v.phone)}">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><path d="M4 4h5l2 5-3 2a13 13 0 0 0 5 5l2-3 5 2v5a2 2 0 0 1-2 2A18 18 0 0 1 2 6a2 2 0 0 1 2-2z"/></svg>
        ${esc(v.phone)}</a>
      <a class="info-row" href="mailto:${esc(v.email)}">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 7l10 7 10-7"/></svg>
        ${esc(v.email)}</a>
    </div>` + renderUpdates() + renderSponsors();
}

function renderUpdates() {
  const ups = DATA.updates || [];
  if (!ups.length) return "";
  return `<h2 class="section-title">NUSA updates</h2>` +
    ups.map((u) => `<div class="card">
      ${u.img ? `<img class="update-img" src="${esc(u.img)}" alt="" loading="lazy" onerror="this.remove()">` : ""}
      <h3>${esc(u.title)}</h3>
      ${u.text ? `<div class="note">${esc(u.text)}</div>` : ""}
      ${u.link ? `<a class="update-link" href="${esc(u.link)}" target="_blank" rel="noopener">Learn more</a>` : ""}
    </div>`).join("");
}

const TIERS = ["Presenting sponsor", "Platinum sponsor", "Gold sponsor", "Silver sponsor", "Community partner"];

function renderSponsors() {
  const sp = DATA.sponsors || [];
  if (!sp.length) return "";
  // ponytail: group by tier, known tiers in program order, anything else falls to the end
  const groups = new Map();
  for (const s of sp) {
    const tier = s.tier || "Sponsor";
    if (!groups.has(tier)) groups.set(tier, []);
    groups.get(tier).push(s);
  }
  const rank = (t) => { const i = TIERS.indexOf(t); return i === -1 ? TIERS.length : i; };
  const tile = (s) => {
    const inner = `${s.logo ? `<img src="${esc(s.logo)}" alt="${esc(s.name)}" loading="lazy" onerror="this.remove()">` : ""}<span>${esc(s.name)}</span>`;
    return s.url
      ? `<a class="sponsor" href="${esc(s.url)}" target="_blank" rel="noopener">${inner}</a>`
      : `<div class="sponsor">${inner}</div>`;
  };
  return `<h2 class="section-title">Thank you to our sponsors</h2>` +
    [...groups.entries()]
      .sort((a, b) => rank(a[0]) - rank(b[0]))
      .map(([tier, list]) => `<div class="tier-label">${esc(tier)}</div><div class="sponsor-grid">${list.map(tile).join("")}</div>`)
      .join("");
}

/* Photo wall */
let photosLoaded = false;

async function loadPhotos() {
  try {
    const r = await fetch("/api/photos", { cache: "no-store" });
    if (!r.ok) return;
    const { photos } = await r.json();
    $("#photo-grid").innerHTML = photos.length
      ? photos.map((p) => `<figure>
          <img src="/api/photo/${esc(p.id)}" alt="Convention photo" loading="lazy" onerror="this.closest('figure').remove()">
          ${p.n ? `<figcaption>${esc(p.n)}</figcaption>` : ""}
        </figure>`).join("")
      : '<p style="text-align:center;color:#cfc4f0;padding:20px;">No photos yet — be the first!</p>';
    photosLoaded = true;
  } catch (e) {}
}

$("#photo-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const status = $("#photo-status");
  status.textContent = "Uploading…";
  try {
    // ponytail: canvas resize to ≤1280px JPEG keeps uploads ~200KB on any phone camera
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.82));
    const name = $("#photo-name").value.trim();
    localStorage.setItem("photoName", name);
    const r = await fetch("/api/photos", {
      method: "POST",
      headers: { "content-type": "image/jpeg", "x-name": name },
      body: blob,
    });
    if (!r.ok) throw new Error();
    const j = await r.json();
    status.textContent = j.status === "live"
      ? "Posted! It can take a minute to appear for everyone."
      : "Submitted — it will appear after a quick review.";
    setTimeout(loadPhotos, 1500);
  } catch (err) {
    status.textContent = "Upload failed — try again";
  }
});
$("#photo-name").value = localStorage.getItem("photoName") || "";

/* Hash router */
function route() {
  const h = (location.hash || "#home").slice(1);
  const view = ["home", "schedule", "photos", "speakers", "info"].includes(h) ? h : "home";
  if (view === "photos" && !photosLoaded) loadPhotos();
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  $("#view-" + view).classList.add("active");
  document.querySelectorAll("nav a").forEach((a) => a.classList.toggle("on", a.dataset.nav === view));
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);

/* Share */
$("#btn-share").addEventListener("click", async () => {
  const share = { title: "NUSALA 26 — Nnewi USA Convention", url: location.origin };
  if (navigator.share) {
    try { await navigator.share(share); } catch (e) {}
  } else {
    await navigator.clipboard.writeText(share.url);
    showBanner("Link copied — paste it anywhere");
  }
});

/* Install hint */
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  maybeShowInstallHint();
});

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
}

function maybeShowInstallHint() {
  if (isStandalone() || localStorage.getItem("hideInstall")) return;
  const hint = $("#install-hint");
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  hint.innerHTML = `<button class="close" aria-label="Dismiss">×</button>` + (isIOS
    ? `<strong>Add this app to your phone:</strong> tap the Share button <strong>⎋</strong> below, then <strong>“Add to Home Screen”</strong>. You'll get schedule updates all weekend.`
    : `<strong>Add this app to your phone</strong> for one-tap access and updates all weekend.${deferredPrompt ? '<br><button class="go">Install app</button>' : ""}`);
  hint.classList.remove("hidden");
  hint.querySelector(".close").addEventListener("click", () => {
    hint.classList.add("hidden");
    localStorage.setItem("hideInstall", "1");
  });
  const go = hint.querySelector(".go");
  if (go) go.addEventListener("click", async () => {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    hint.classList.add("hidden");
  });
}

/* Push (activated in phase 4 when VAPID key is real) */
function urlB64ToUint8(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function setupPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || VAPID_PUBLIC.startsWith("__")) return;
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing || Notification.permission === "denied") return;
  const btn = $("#btn-notify");
  btn.classList.remove("hidden");
  btn.addEventListener("click", async () => {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8(VAPID_PUBLIC),
      });
      await fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub),
      });
      btn.classList.add("hidden");
      showBanner("You're set — updates will reach this phone");
    } catch (e) {
      showBanner("Couldn't enable notifications on this device");
    }
  }, { once: true });
}

/* Boot */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
  // ponytail: check for a new build whenever the app is opened, reload once when one takes over.
  // Without this an installed PWA can sit on old code for days.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (sessionStorage.getItem("swReloaded")) return;
    sessionStorage.setItem("swReloaded", "1");
    location.reload();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") navigator.serviceWorker.getRegistration().then((r) => r && r.update());
  });
}
loadData(true).then(() => { route(); maybeShowInstallHint(); setupPush(); });

/* ponytail: 60s poll while visible covers "live updates" for everyone; push is bonus */
setInterval(() => { if (document.visibilityState === "visible") loadData(); }, 60000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") loadData(); });
