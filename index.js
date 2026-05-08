const GITHUB_PR_REGEX = /https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/g;

const WHITELISTED_USERS = [
  "amit", "bibek", "bikas", "suman", "bhusan", "kapil",
  "suraj", "parbat", "sibendra", "ram", "prassidha", "rohan",
  "mandip", "kushal", "viikas", "taukir", "amanchy", "prashantghartimagar",
  "abhishek",
].map((u) => u.toLowerCase());

async function verifySlackSignature(request, rawBody, signingSecret) {
  const timestamp = request.headers.get("x-slack-request-timestamp");
  const signature = request.headers.get("x-slack-signature");
  if (!timestamp || !signature) return false;
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp, 10)) > 300) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`v0:${timestamp}:${rawBody}`));
  const hex = "v0=" + [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === signature;
}

async function ghRequest(path, method = "GET", body, token) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `token ${token}`,
      "User-Agent": "slack-pr-bot",
      Accept: "application/vnd.github.v3+json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(`GitHub ${method} ${path} → ${res.status}`);
  return res.json();
}

async function addReaction(channel, timestamp, botToken) {
  const res = await fetch("https://slack.com/api/reactions.add", {
    method: "POST",
    headers: { Authorization: `Bearer ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ channel, timestamp, name: "white_check_mark" }),
  });
  const data = await res.json();
  if (!data.ok && data.error !== "already_reacted") {
    console.error("[slack] reaction error:", data.error);
  }
}

function extractPRLinks(text) {
  const hits = [];
  const re = new RegExp(GITHUB_PR_REGEX.source, "g");
  let m;
  while ((m = re.exec(text)) !== null) {
    hits.push({ owner: m[1], repo: m[2], pull_number: parseInt(m[3], 10) });
  }
  return hits;
}

async function handleMessage(event, env) {
  const text = event.text || "";
  const prLinks = extractPRLinks(text);
  if (!prLinks.length) return;

  const watchChannels = env.WATCH_CHANNELS
    ? env.WATCH_CHANNELS.split(",").map((c) => c.trim()).filter(Boolean)
    : [];

  const isDM = event.channel_type === "im";
  const isWatched =
    (event.channel_type === "channel" || event.channel_type === "group") &&
    watchChannels.includes(event.channel);

  if (!isDM && !isWatched) return;

  for (const pr of prLinks) {
    try {
      const data = await ghRequest(
        `/repos/${pr.owner}/${pr.repo}/pulls/${pr.pull_number}`,
        "GET", null, env.GITHUB_TOKEN
      );
      const author = data.user.login.toLowerCase();
      const allowed = WHITELISTED_USERS.some((name) => author.includes(name));
      console.log(`[github] ${pr.owner}/${pr.repo}#${pr.pull_number} author=${author} allowed=${allowed}`);

      if (!allowed) continue;

      await ghRequest(
        `/repos/${pr.owner}/${pr.repo}/pulls/${pr.pull_number}/reviews`,
        "POST", { event: "APPROVE" }, env.GITHUB_TOKEN
      );
      await addReaction(event.channel, event.ts, env.SLACK_BOT_TOKEN);
      console.log(`[bot] approved PR by "${author}"`);
    } catch (err) {
      console.error(`[bot] failed ${pr.owner}/${pr.repo}#${pr.pull_number}:`, err.message);
    }
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    const rawBody = await request.text();
    const payload = JSON.parse(rawBody);

    // url_verification has no sensitive data — safe to respond before sig check
    if (payload.type === "url_verification") {
      return new Response(JSON.stringify({ challenge: payload.challenge }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const valid = await verifySlackSignature(request, rawBody, env.SLACK_SIGNING_SECRET);
    if (!valid) return new Response("Unauthorized", { status: 401 });

    if (payload.type === "event_callback" && payload.event?.type === "message" && !payload.event?.subtype) {
      ctx.waitUntil(handleMessage(payload.event, env));
    }

    return new Response("OK");
  },
};
