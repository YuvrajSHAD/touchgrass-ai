import "dotenv/config";
import express from "express";
import webpush from "web-push";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "64kb" }));
app.use(express.static(path.join(__dirname, "public")));

const PORT = Number(process.env.PORT || 3000);
const PRESENCE_TTL_MS = 10 * 60 * 1000;
const DAILY_LIMIT = 3;
const QUIET_START = 22; // 10 PM
const QUIET_END = 7;    // 7 AM

const groups = new Map();       // code -> { members: Map(userId, member) }
const subscriptions = new Map(); // userId -> push subscription
const notificationState = new Map(); // userId -> { day, count }

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

function id() {
  return crypto.randomBytes(9).toString("base64url");
}

function groupCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

function cleanName(name) {
  return String(name || "Friend").trim().slice(0, 40) || "Friend";
}

function cleanInterests(interests) {
  if (!Array.isArray(interests)) return [];
  return [...new Set(interests.map(x => String(x).trim().toLowerCase()).filter(Boolean))].slice(0, 12);
}

function validCoords(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) &&
    lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function roundedCoord(value) {
  return Math.round(value * 1000) / 1000;
}

function haversineKm(aLat, aLon, bLat, bLon) {
  const R = 6371;
  const rad = x => x * Math.PI / 180;
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function currentDay() {
  return new Date().toISOString().slice(0, 10);
}

function canNotify(userId) {
  const state = notificationState.get(userId);
  const day = currentDay();
  if (!state || state.day !== day) return true;
  return state.count < DAILY_LIMIT;
}

function markNotified(userId) {
  const day = currentDay();
  const state = notificationState.get(userId);
  if (!state || state.day !== day) {
    notificationState.set(userId, { day, count: 1 });
  } else {
    state.count += 1;
  }
}

function quietHours() {
  const hour = new Date().getHours();
  return hour >= QUIET_START || hour < QUIET_END;
}

function getMember(code, userId) {
  return groups.get(code)?.members.get(userId);
}

function publicMembers(code, requesterId) {
  const group = groups.get(code);
  if (!group) return [];
  return [...group.members.values()].map(m => ({
    id: m.id,
    name: m.name,
    free: m.free,
    radiusKm: m.radiusKm,
    interests: m.interests,
    online: Date.now() - m.updatedAt < PRESENCE_TTL_MS,
    isSelf: m.id === requesterId
  }));
}

async function getWeather(lat, lon) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lat);
  url.searchParams.set("longitude", lon);
  url.searchParams.set("current", "temperature_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m");
  url.searchParams.set("timezone", "auto");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Weather HTTP ${response.status}`);
  return response.json();
}

function weatherSummary(weather) {
  const c = weather?.current;
  if (!c) return null;
  return {
    temperatureC: c.temperature_2m,
    feelsLikeC: c.apparent_temperature,
    precipitation: c.precipitation,
    weatherCode: c.weather_code,
    cloudCover: c.cloud_cover,
    windKmh: c.wind_speed_10m
  };
}

function templateSuggestion({ interests = [], weather = null, nearbyFriend = false }) {
  const interest = interests[0];
  if (nearbyFriend) {
    if (interest) return `Your friend is nearby. Invite them for a short ${interest} break outside.`;
    return "A friend is nearby. This is a good time for a short walk and an in-person catch-up.";
  }
  if (weather && weather.precipitation > 0) {
    return "It looks wet outside. If it clears, take a short walk and look for something you normally miss.";
  }
  if (weather && weather.cloudCover < 25) {
    return "The sky is relatively clear. Step outside for 10 minutes and find a good place to look up.";
  }
  if (interest) return `Take a 20-minute outdoor break around your interest: ${interest}.`;
  return "Take a 15-minute walk somewhere you normally pass without noticing.";
}

async function llmSuggestion({ interests, weather, nearbyFriend }) {
  const base = process.env.LLM_BASE_URL;
  if (!base) return templateSuggestion({ interests, weather, nearbyFriend });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.LLM_TIMEOUT_MS || 3000));

  const prompt = [
    "You are TouchGrass, a privacy-first outdoor nudge assistant.",
    "Create ONE concise outdoor suggestion that gets the user away from their screen.",
    "Do not encourage dangerous activity. Do not claim precise weather beyond the supplied data.",
    "Never ask the user to keep checking the app.",
    `Interests: ${interests.join(", ") || "none"}`,
    `Nearby friend: ${nearbyFriend ? "yes" : "no"}`,
    `Weather: ${JSON.stringify(weather || {})}`,
    "Return only the suggestion, maximum 45 words."
  ].join("\n");

  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(process.env.LLM_API_KEY ? { Authorization: `Bearer ${process.env.LLM_API_KEY}` } : {})
      },
      body: JSON.stringify({
        model: process.env.LLM_MODEL || "gemma-3-1b",
        messages: [
          { role: "system", content: "You generate brief, safe outdoor nudges." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 100
      })
    });
    if (!response.ok) throw new Error(`LLM HTTP ${response.status}`);
    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    return text || templateSuggestion({ interests, weather, nearbyFriend });
  } catch {
    return templateSuggestion({ interests, weather, nearbyFriend });
  } finally {
    clearTimeout(timeout);
  }
}

async function sendPush(userId, payload) {
  const subscription = subscriptions.get(userId);
  if (!subscription || !process.env.VAPID_PUBLIC_KEY) return false;
  if (!canNotify(userId) || quietHours()) return false;

  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    markNotified(userId);
    return true;
  } catch (error) {
    if (error.statusCode === 404 || error.statusCode === 410) {
      subscriptions.delete(userId);
    }
    return false;
  }
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "touchgrass-web",
    llmConfigured: Boolean(process.env.LLM_BASE_URL),
    pushConfigured: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
    groups: groups.size
  });
});

app.get("/api/config", (_req, res) => {
  res.json({
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY || null,
    pushConfigured: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
    llmConfigured: Boolean(process.env.LLM_BASE_URL)
  });
});

app.post("/api/groups", (req, res) => {
  const code = groupCode();
  const userId = id();
  groups.set(code, { members: new Map() });
  groups.get(code).members.set(userId, {
    id: userId,
    name: cleanName(req.body.name),
    radiusKm: Math.min(Math.max(Number(req.body.radiusKm) || 1, 0.1), 25),
    interests: cleanInterests(req.body.interests),
    lat: null,
    lon: null,
    free: false,
    updatedAt: Date.now()
  });
  res.json({ code, userId });
});

app.post("/api/groups/join", (req, res) => {
  const code = String(req.body.code || "").trim().toUpperCase();
  const group = groups.get(code);
  if (!group) return res.status(404).json({ error: "Group not found or expired." });
  if (group.members.size >= 12) return res.status(409).json({ error: "Group is full." });

  const userId = id();
  group.members.set(userId, {
    id: userId,
    name: cleanName(req.body.name),
    radiusKm: Math.min(Math.max(Number(req.body.radiusKm) || 1, 0.1), 25),
    interests: cleanInterests(req.body.interests),
    lat: null,
    lon: null,
    free: false,
    updatedAt: Date.now()
  });
  res.json({ code, userId });
});

app.get("/api/groups/:code/members", (req, res) => {
  const userId = String(req.query.userId || "");
  if (!getMember(req.params.code.toUpperCase(), userId)) {
    return res.status(403).json({ error: "Not a member." });
  }
  res.json({ members: publicMembers(req.params.code.toUpperCase(), userId) });
});

app.post("/api/presence", async (req, res) => {
  const code = String(req.body.code || "").toUpperCase();
  const userId = String(req.body.userId || "");
  const member = getMember(code, userId);
  if (!member) return res.status(403).json({ error: "Not a group member." });

  const lat = Number(req.body.lat);
  const lon = Number(req.body.lon);
  if (!validCoords(lat, lon)) return res.status(400).json({ error: "Invalid coordinates." });

  member.lat = roundedCoord(lat);
  member.lon = roundedCoord(lon);
  member.free = Boolean(req.body.free);
  member.radiusKm = Math.min(Math.max(Number(req.body.radiusKm) || member.radiusKm, 0.1), 25);
  member.interests = cleanInterests(req.body.interests);
  member.updatedAt = Date.now();

  let nearby = [];
  const group = groups.get(code);
  for (const other of group.members.values()) {
    if (other.id === userId || !other.free || !other.lat || !other.lon) continue;
    const km = haversineKm(member.lat, member.lon, other.lat, other.lon);
    const radius = Math.min(member.radiusKm, other.radiusKm);
    if (km <= radius && Date.now() - other.updatedAt < PRESENCE_TTL_MS) {
      nearby.push({ id: other.id, name: other.name, distanceKm: Number(km.toFixed(2)) });
    }
  }

  if (member.free && nearby.length) {
    const weather = await safeWeather(member.lat, member.lon);
    const suggestion = await llmSuggestion({
      interests: member.interests,
      weather,
      nearbyFriend: true
    });
    await sendPush(userId, {
      title: "🌱 TouchGrass: friend nearby",
      body: suggestion,
      tag: "friend-nearby"
    });
  }

  res.json({ ok: true, nearby });
});

async function safeWeather(lat, lon) {
  try {
    return weatherSummary(await getWeather(lat, lon));
  } catch {
    return null;
  }
}

app.post("/api/push/subscribe", (req, res) => {
  const { userId, subscription } = req.body;
  if (!userId || !subscription?.endpoint) {
    return res.status(400).json({ error: "userId and subscription required." });
  }
  subscriptions.set(String(userId), subscription);
  res.json({ ok: true });
});

app.post("/api/suggestion", async (req, res) => {
  const interests = cleanInterests(req.body.interests);
  const lat = Number(req.body.lat);
  const lon = Number(req.body.lon);
  let weather = null;
  if (validCoords(lat, lon)) weather = await safeWeather(lat, lon);

  const suggestion = await llmSuggestion({
    interests,
    weather,
    nearbyFriend: Boolean(req.body.nearbyFriend)
  });
  res.json({ suggestion, weather });
});

app.post("/api/check-weather", async (req, res) => {
  const lat = Number(req.body.lat);
  const lon = Number(req.body.lon);
  if (!validCoords(lat, lon)) return res.status(400).json({ error: "Valid coordinates required." });
  const weather = await safeWeather(lat, lon);
  const suggestion = await llmSuggestion({
    interests: cleanInterests(req.body.interests),
    weather,
    nearbyFriend: false
  });
  res.json({ weather, suggestion });
});

app.use((req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`TouchGrass running on http://localhost:${PORT}`);
});
