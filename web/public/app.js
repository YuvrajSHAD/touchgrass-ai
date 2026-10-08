const $ = (id) => document.getElementById(id);

const state = {
  code: localStorage.getItem("tg_code"),
  userId: localStorage.getItem("tg_user"),
  name: localStorage.getItem("tg_name") || "",
  interests: JSON.parse(localStorage.getItem("tg_interests") || "[]"),
  radiusKm: Number(localStorage.getItem("tg_radius") || 1),
  free: false,
  deferredInstall: null
};

const setup = $("setup");
const app = $("app");

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 3200);
}

function saveState() {
  localStorage.setItem("tg_code", state.code || "");
  localStorage.setItem("tg_user", state.userId || "");
  localStorage.setItem("tg_name", state.name || "");
  localStorage.setItem("tg_interests", JSON.stringify(state.interests));
  localStorage.setItem("tg_radius", String(state.radiusKm));
}

function showApp() {
  setup.classList.add("hidden");
  app.classList.remove("hidden");
  $("groupCode").textContent = state.code;
}

function parseInterests() {
  return $("interests").value.split(",").map(x => x.trim()).filter(Boolean).slice(0, 12);
}

async function json(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Geolocation is not supported."));
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      e => reject(new Error(e.message || "Location permission denied.")),
      { enableHighAccuracy: false, maximumAge: 120000, timeout: 10000 }
    );
  });
}

async function updatePresence() {
  if (!state.code || !state.userId || !state.free) return;
  try {
    const pos = await getLocation();
    const result = await json("/api/presence", {
      method: "POST",
      body: JSON.stringify({
        code: state.code,
        userId: state.userId,
        lat: pos.lat,
        lon: pos.lon,
        free: true,
        radiusKm: state.radiusKm,
        interests: state.interests
      })
    });
    renderNearby(result.nearby || []);
    $("presenceStatus").textContent = result.nearby?.length
      ? "A friend is within your chosen radius."
      : "You're marked free. No nearby friend yet.";
  } catch (e) {
    $("presenceStatus").textContent = e.message;
  }
}

function renderNearby(nearby) {
  const el = $("friends");
  if (!nearby.length) {
    el.innerHTML = '<p class="muted">No nearby friends yet.</p>';
    return;
  }
  el.innerHTML = nearby.map(f =>
    `<div class="friend"><strong>${escapeHtml(f.name)}</strong><span>${f.distanceKm} km away</span></div>`
  ).join("");
}

async function refreshMembers() {
  if (!state.code || !state.userId) return;
  try {
    const data = await json(`/api/groups/${encodeURIComponent(state.code)}/members?userId=${encodeURIComponent(state.userId)}`);
    const onlineFree = data.members.filter(m => !m.isSelf && m.online && m.free);
    // Do not show location unless the server has confirmed proximity.
    if (!onlineFree.length && !state.free) renderNearby([]);
  } catch {}
}

async function createCircle() {
  state.name = $("name").value.trim() || "Friend";
  state.interests = parseInterests();
  state.radiusKm = Number($("radius").value);

  try {
    const data = await json("/api/groups", {
      method: "POST",
      body: JSON.stringify({
        name: state.name,
        interests: state.interests,
        radiusKm: state.radiusKm
      })
    });
    state.code = data.code;
    state.userId = data.userId;
    saveState();
    showApp();
    await enablePushIfPossible();
    toast("Circle created.");
  } catch (e) {
    $("setupStatus").textContent = e.message;
  }
}

async function joinCircle() {
  state.name = $("name").value.trim() || "Friend";
  state.interests = parseInterests();
  state.radiusKm = Number($("radius").value);
  const code = $("joinCode").value.trim().toUpperCase();

  try {
    const data = await json("/api/groups/join", {
      method: "POST",
      body: JSON.stringify({
        code,
        name: state.name,
        interests: state.interests,
        radiusKm: state.radiusKm
      })
    });
    state.code = data.code;
    state.userId = data.userId;
    saveState();
    showApp();
    await enablePushIfPossible();
    toast("Joined the circle.");
  } catch (e) {
    $("setupStatus").textContent = e.message;
  }
}

async function toggleFree() {
  if (!state.free) {
    try {
      await getLocation(); // trigger permission before changing UI
    } catch (e) {
      $("presenceStatus").textContent = e.message;
      return;
    }
  }
  state.free = !state.free;
  $("freeBtn").textContent = state.free ? "I'm not free" : "I'm free 🌱";
  if (state.free) {
    $("presenceStatus").textContent = "Sharing a rounded location while you're free.";
    await updatePresence();
  } else {
    $("presenceStatus").textContent = "Location sharing stopped.";
  }
}

async function makeSuggestion() {
  $("suggestBtn").disabled = true;
  $("suggestion").classList.remove("hidden");
  $("suggestion").textContent = "Thinking…";
  try {
    let pos = null;
    try { pos = await getLocation(); } catch {}
    const data = await json("/api/suggestion", {
      method: "POST",
      body: JSON.stringify({
        interests: state.interests,
        lat: pos?.lat,
        lon: pos?.lon,
        nearbyFriend: false
      })
    });
    $("suggestion").textContent = data.suggestion;
  } catch (e) {
    $("suggestion").textContent = e.message;
  } finally {
    $("suggestBtn").disabled = false;
  }
}

async function checkWeather() {
  $("weatherBtn").disabled = true;
  $("weather").classList.remove("hidden");
  $("weather").textContent = "Checking…";
  try {
    const pos = await getLocation();
    const data = await json("/api/check-weather", {
      method: "POST",
      body: JSON.stringify({ lat: pos.lat, lon: pos.lon, interests: state.interests })
    });
    const w = data.weather;
    const weatherLine = w
      ? `${Math.round(w.temperatureC)}°C · feels ${Math.round(w.feelsLikeC)}°C · ${w.cloudCover}% cloud · ${w.windKmh} km/h wind`
      : "Weather unavailable";
    $("weather").innerHTML = `<strong>${escapeHtml(weatherLine)}</strong><br>${escapeHtml(data.suggestion)}`;
  } catch (e) {
    $("weather").textContent = e.message;
  } finally {
    $("weatherBtn").disabled = false;
  }
}

async function enablePushIfPossible() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
  const config = await json("/api/config");
  if (!config.pushConfigured || !config.vapidPublicKey) return;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;
    const registration = await navigator.serviceWorker.register("/sw.js");
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.vapidPublicKey)
    });
    await json("/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify({ userId: state.userId, subscription })
    });
  } catch (e) {
    console.warn("Push setup skipped:", e);
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));
}

$("createBtn").addEventListener("click", createCircle);
$("joinBtn").addEventListener("click", joinCircle);
$("freeBtn").addEventListener("click", toggleFree);
$("suggestBtn").addEventListener("click", makeSuggestion);
$("weatherBtn").addEventListener("click", checkWeather);

$("copyCode").addEventListener("click", async () => {
  await navigator.clipboard.writeText(state.code);
  toast("Invite code copied.");
});

$("leaveBtn").addEventListener("click", () => {
  localStorage.clear();
  location.reload();
});

window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  state.deferredInstall = e;
  $("installBtn").classList.remove("hidden");
});

$("installBtn").addEventListener("click", async () => {
  if (!state.deferredInstall) return;
  state.deferredInstall.prompt();
  await state.deferredInstall.userChoice;
  state.deferredInstall = null;
  $("installBtn").classList.add("hidden");
});

async function init() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(console.warn);

  if (state.code && state.userId) {
    $("name").value = state.name;
    $("interests").value = state.interests.join(", ");
    $("radius").value = String(state.radiusKm);
    showApp();
    await enablePushIfPossible();
    await refreshMembers();
  }
}

setInterval(() => {
  if (state.free) updatePresence();
  refreshMembers();
}, 60000);

init();
