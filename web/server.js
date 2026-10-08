import "dotenv/config";
import express from "express";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: "64kb" }));
app.use(express.static(path.join(__dirname, "public")));

const PORT = Number(process.env.PORT || 3000);
const PRESENCE_TTL_MS = 10 * 60 * 1000;

const groups = new Map();

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
  return [...new Set(
    interests.map(x => String(x).trim().toLowerCase()).filter(Boolean)
  )].slice(0, 12);
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

function templateSuggestion({ interests = [], nearbyFriend = false, duration = 20 }) {
  const interest = interests[Math.floor(Math.random() * interests.length)];

  if (nearbyFriend) {
    if (interest) {
      return `Find your friend and turn ${duration} minutes of ${interest} into something you do together.`;
    }
    return `Your friend is close. Meet outside and take ${duration} minutes to wander somewhere neither of you normally goes.`;
  }

  if (interest) {
    return `Take ${duration} minutes outside and turn your interest in ${interest} into a reason to explore.`;
  }

  return `Take ${duration} minutes and walk somewhere you normally pass without noticing.`;
}

async function llmSuggestion({
  interests = [],
  nearbyFriend = false,
  duration = 20
}) {
  const base = process.env.LLM_BASE_URL;
  if (!base) {
    return templateSuggestion({ interests, nearbyFriend, duration });
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Number(process.env.LLM_TIMEOUT_MS || 15000)
  );

  const prompt = [
    "You are SideQuest, a tiny local AI whose only job is to give a person one good reason to leave their screen.",
    "",
    `TIME AVAILABLE: ${duration} minutes`,
    `USER INTERESTS: ${interests.join(", ") || "none"}`,
    `A FRIEND IS CURRENTLY NEARBY: ${nearbyFriend ? "YES" : "NO"}`,
    "",
    "Create ONE simple outdoor side quest.",
    "",
    "Rules:",
    "- It must make sense for a normal person to actually do.",
    "- Personalize with an interest when useful.",
    "- If a friend is nearby, make meeting them an appealing option.",
    "- Do not require an app, equipment, research, weather, or a destination.",
    "- Do not mention AI.",
    "- Do not say 'go outside' or 'enjoy the fresh air'.",
    "- Do not give a list.",
    "- Do not ask a question.",
    "- Keep it to one or two short sentences.",
    "- Make it immediately actionable.",
    "",
    "Return ONLY the side quest."
  ].join("\n");

  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(process.env.LLM_API_KEY
          ? { Authorization: `Bearer ${process.env.LLM_API_KEY}` }
          : {})
      },
      body: JSON.stringify({
        model: process.env.LLM_MODEL || "ggml-org/Qwen3-1.7B-GGUF:Q4_K_M",
        messages: [
          {
            role: "system",
            content: "You are SideQuest. Output only one short, human outdoor side quest."
          },
          { role: "user", content: `${prompt}\n/no_think` }
        ],
        temperature: 0.85,
        top_p: 0.9,
        max_tokens: 90
      })
    });

    if (!response.ok) throw new Error(`LLM HTTP ${response.status}`);

    const data = await response.json();
    let text = data?.choices?.[0]?.message?.content?.trim();

    if (text) {
      text = text
        .replace(/\*\*/g, "")
        .replace(/^SideQuest:\s*/i, "")
        .replace(/^Outdoor Activity:\s*/i, "")
        .trim();
    }

    return text || templateSuggestion({ interests, nearbyFriend, duration });
  } catch (error) {
    console.error("LLM ERROR:", error);
    return templateSuggestion({ interests, nearbyFriend, duration });
  } finally {
    clearTimeout(timeout);
  }
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "touchgrass-web",
    llmConfigured: Boolean(process.env.LLM_BASE_URL),
    groups: groups.size
  });
});

app.get("/api/config", (_req, res) => {
  res.json({
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

  if (!group) {
    return res.status(404).json({ error: "That circle doesn't exist anymore." });
  }

  if (group.members.size >= 12) {
    return res.status(409).json({ error: "This circle is full." });
  }

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
  const code = req.params.code.toUpperCase();
  const userId = String(req.query.userId || "");

  if (!getMember(code, userId)) {
    return res.status(403).json({ error: "Not a member of this circle." });
  }

  res.json({ members: publicMembers(code, userId) });
});

app.post("/api/location", (req, res) => {
  const code = String(req.body.code || "").toUpperCase();
  const userId = String(req.body.userId || "");
  const member = getMember(code, userId);

  if (!member) {
    return res.status(403).json({ error: "Not a member of this circle." });
  }

  const lat = Number(req.body.lat);
  const lon = Number(req.body.lon);

  if (!validCoords(lat, lon)) {
    return res.status(400).json({ error: "Invalid coordinates." });
  }

  member.lat = roundedCoord(lat);
  member.lon = roundedCoord(lon);
  member.interests = cleanInterests(req.body.interests);
  member.updatedAt = Date.now();

  res.json({ ok: true });
});

app.post("/api/presence", async (req, res) => {
  const code = String(req.body.code || "").toUpperCase();
  const userId = String(req.body.userId || "");
  const member = getMember(code, userId);

  if (!member) {
    return res.status(403).json({ error: "Not a member of this circle." });
  }

  const lat = Number(req.body.lat);
  const lon = Number(req.body.lon);

  if (!validCoords(lat, lon)) {
    return res.status(400).json({ error: "Invalid coordinates." });
  }

  member.lat = roundedCoord(lat);
  member.lon = roundedCoord(lon);
  member.free = Boolean(req.body.free);
  member.radiusKm = Math.min(
    Math.max(Number(req.body.radiusKm) || member.radiusKm, 0.1),
    25
  );
  member.interests = cleanInterests(req.body.interests);
  member.updatedAt = Date.now();

  const nearby = [];
  const group = groups.get(code);

  for (const other of group.members.values()) {
    if (other.id === userId || !other.free || !other.lat || !other.lon) continue;

    const km = haversineKm(member.lat, member.lon, other.lat, other.lon);
    const radius = Math.min(member.radiusKm, other.radiusKm);

    if (
      km <= radius &&
      Date.now() - other.updatedAt < PRESENCE_TTL_MS
    ) {
      nearby.push({
        id: other.id,
        name: other.name,
        distanceKm: Number(km.toFixed(2)),
        interests: other.interests
      });
    }
  }

  res.json({ ok: true, nearby });
});

app.post("/api/suggestion", async (req, res) => {
  const interests = cleanInterests(req.body.interests);
  const duration = Math.min(Math.max(Number(req.body.duration) || 20, 5), 180);
  const nearbyFriend = Boolean(req.body.nearbyFriend);

  const suggestion = await llmSuggestion({
    interests,
    nearbyFriend,
    duration
  });

  res.json({ suggestion });
});

app.listen(PORT, () => {
  console.log(`TouchGrass running on http://localhost:${PORT}`);
});
