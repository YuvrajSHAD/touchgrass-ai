const $ = (id) => document.getElementById(id);

const state = {
  code: localStorage.getItem("tg_code"),
  userId: localStorage.getItem("tg_user"),
  name: localStorage.getItem("tg_name") || "",
  interests: JSON.parse(localStorage.getItem("tg_interests") || "[]"),
  radiusKm: Number(localStorage.getItem("tg_radius") || 1),
  free: false,
  duration: 20,
  deferredInstall: null
};

const setup = $("setup");
const app = $("app");

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2800);
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
  $("hello").textContent = `${state.name || "Ready"}, what's the move?`;
  $("interestList").textContent = state.interests.length
    ? state.interests.join("  ·  ")
    : "Nothing saved. That's fine.";
}

function parseInterests() {
  return $("interests").value
    .split(",")
    .map(x => x.trim())
    .filter(Boolean)
    .slice(0, 12);
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
    if (!navigator.geolocation) {
      return reject(new Error("Location isn't available on this device."));
    }

    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      e => reject(new Error(e.message || "Location permission denied.")),
      {
        enableHighAccuracy: false,
        maximumAge: 120000,
        timeout: 10000
      }
    );
  });
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
    toast("Circle ready.");
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
    toast("You're in.");
  } catch (e) {
    $("setupStatus").textContent = e.message;
  }
}

function renderNearby(nearby) {
  const el = $("friends");
  $("friendCount").textContent = nearby.length;

  if (!nearby.length) {
    el.innerHTML = '<p class="empty">Nobody nearby yet.</p>';
    return;
  }

  el.innerHTML = nearby.map(f => {
    const vibe = f.interests?.length
      ? ` · ${escapeHtml(f.interests[0])}`
      : "";

    return `
      <div class="friend">
        <div>
          <strong>${escapeHtml(f.name)}</strong>
          <span>${vibe}</span>
        </div>
        <small>${f.distanceKm} km</small>
      </div>
    `;
  }).join("");
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
      ? "Someone's close. You could actually meet."
      : "You're out. Waiting for your people.";
  } catch (e) {
    $("presenceStatus").textContent = e.message;
  }
}

async function refreshMembers() {
  if (!state.code || !state.userId) return;

  try {
    const data = await json(
      `/api/groups/${encodeURIComponent(state.code)}/members?userId=${encodeURIComponent(state.userId)}`
    );

    const onlineFree = data.members.filter(
      m => !m.isSelf && m.online && m.free
    );

    if (!state.free) renderNearby(onlineFree.map(m => ({
      id: m.id,
      name: m.name,
      distanceKm: "near",
      interests: m.interests
    })));
  } catch {}
}

async function toggleFree() {
  if (!state.free) {
    try {
      await getLocation();
    } catch (e) {
      $("presenceStatus").textContent = e.message;
      return;
    }
  }

  state.free = !state.free;
  $("freeBtn").textContent = state.free ? "I'M HEADING IN ↗" : "I'M OUTSIDE ↗";

  if (state.free) {
    $("presenceStatus").textContent = "Finding your people…";
    await updatePresence();
  } else {
    $("presenceStatus").textContent = "You're no longer marked outside.";
    renderNearby([]);
  }
}

async function makeSuggestion() {
  $("suggestBtn").disabled = true;
  $("suggestion").innerHTML = '<span class="thinking">Finding your sidequest…</span>';

  try {
    const nearby = await getNearbyNow();
    const data = await json("/api/suggestion", {
      method: "POST",
      body: JSON.stringify({
        interests: state.interests,
        duration: state.duration,
        nearbyFriend: nearby.length > 0
      })
    });

    $("suggestion").textContent = data.suggestion;
  } catch (e) {
    $("suggestion").textContent = e.message;
  } finally {
    $("suggestBtn").disabled = false;
  }
}

async function getNearbyNow() {
  if (!state.code || !state.userId) return [];

  try {
    const pos = await getLocation();

    const result = await json("/api/presence", {
      method: "POST",
      body: JSON.stringify({
        code: state.code,
        userId: state.userId,
        lat: pos.lat,
        lon: pos.lon,
        free: state.free,
        radiusKm: state.radiusKm,
        interests: state.interests
      })
    });

    if (state.free) renderNearby(result.nearby || []);
    return result.nearby || [];
  } catch {
    return [];
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[c]));
}

document.querySelectorAll(".duration").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".duration").forEach(b => b.classList.remove("active"));
    button.classList.add("active");
    state.duration = Number(button.dataset.min);
    $("suggestion").innerHTML = '<span class="quiet">Now give me a reason.</span>';
  });
});

$("createBtn").addEventListener("click", createCircle);
$("joinBtn").addEventListener("click", joinCircle);
$("freeBtn").addEventListener("click", toggleFree);
$("suggestBtn").addEventListener("click", makeSuggestion);

$("copyCode").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(state.code);
    toast("Circle code copied.");
  } catch {
    toast(`Circle: ${state.code}`);
  }
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
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(console.warn);
  }

  if (state.code && state.userId) {
    $("name").value = state.name;
    $("interests").value = state.interests.join(", ");
    $("radius").value = String(state.radiusKm);
    showApp();
    await refreshMembers();
  }
}

setInterval(() => {
  if (state.free) updatePresence();
  refreshMembers();
}, 60000);

init();
