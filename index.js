const GITHUB_PR_REGEX = /https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/g;

const WHITELISTED_USERS = [
  "amit", "bibek", "bikas", "suman", "bhusan", "kapil",
  "suraj", "parbat", "sibendra", "ram", "prassidha", "rohan",
  "mandip", "kushal", "viikas", "taukir", "amanchy", "prashantghartimagar",
  "abhishek","animesh","bibash kadel","bibash2"
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

async function isAlreadyApprovedByMe(pr, token) {
  const me = await ghRequest("/user", "GET", null, token);
  const myLogin = me.login.toLowerCase();
  const reviews = await ghRequest(
    `/repos/${pr.owner}/${pr.repo}/pulls/${pr.pull_number}/reviews`,
    "GET", null, token
  );
  const mine = reviews.filter(
    (r) => r.user?.login?.toLowerCase() === myLogin &&
      (r.state === "APPROVED" || r.state === "CHANGES_REQUESTED" || r.state === "DISMISSED")
  );
  if (!mine.length) return false;
  return mine[mine.length - 1].state === "APPROVED";
}

async function addReaction(channel, timestamp, botToken, userToken) {
  const payload = JSON.stringify({ channel, timestamp, name: "white_check_mark" });
  const headers = { "Content-Type": "application/json" };

  const botRes = await fetch("https://slack.com/api/reactions.add", {
    method: "POST",
    headers: { ...headers, Authorization: `Bearer ${botToken}` },
    body: payload,
  });
  const botData = await botRes.json();
  if (botData.ok || botData.error === "already_reacted") return;

  if (!userToken) { console.error("[slack] reaction error:", botData.error); return; }
  const userRes = await fetch("https://slack.com/api/reactions.add", {
    method: "POST",
    headers: { ...headers, Authorization: `Bearer ${userToken}` },
    body: payload,
  });
  const userData = await userRes.json();
  if (!userData.ok && userData.error !== "already_reacted") {
    console.error("[slack] reaction error (user token):", userData.error);
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

function parsePrUrl(url) {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!m) return null;
  return { owner: m[1], repo: m[2], pull_number: m[3] };
}

function ephemeral(text) {
  return new Response(JSON.stringify({ response_type: "ephemeral", text }), {
    headers: { "Content-Type": "application/json" },
  });
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

      if (await isAlreadyApprovedByMe(pr, env.GITHUB_TOKEN)) {
        await addReaction(event.channel, event.ts, env.SLACK_BOT_TOKEN, env.SLACK_USER_TOKEN);
        console.log(`[bot] already approved PR by "${author}", skipping`);
        continue;
      }

      await ghRequest(
        `/repos/${pr.owner}/${pr.repo}/pulls/${pr.pull_number}/reviews`,
        "POST", { event: "APPROVE" }, env.GITHUB_TOKEN
      );
      await addReaction(event.channel, event.ts, env.SLACK_BOT_TOKEN, env.SLACK_USER_TOKEN);
      console.log(`[bot] approved PR by "${author}"`);
    } catch (err) {
      console.error(`[bot] failed ${pr.owner}/${pr.repo}#${pr.pull_number}:`, err.message);
    }
  }
}

async function handleSlashApprove(request, rawBody, env) {
  const valid = await verifySlackSignature(request, rawBody, env.SLACK_SIGNING_SECRET);
  if (!valid) return new Response("Unauthorized", { status: 401 });

  const params = new URLSearchParams(rawBody);
  const prUrl = (params.get("text") || "").trim();
  const userName = params.get("user_name") || "unknown";

  if (!prUrl) return ephemeral("Usage: `/approve <GitHub PR URL>`");

  const pr = parsePrUrl(prUrl);
  if (!pr) return ephemeral(`❌ Invalid PR URL. Example: \`/approve https://github.com/owner/repo/pull/123\``);

  try {
    if (await isAlreadyApprovedByMe(pr, env.GITHUB_TOKEN)) {
      console.log(`[slash] already approved ${prUrl} by ${userName}, skipping`);
      return ephemeral(`✅ Already approved.\n${prUrl}`);
    }
    await ghRequest(
      `/repos/${pr.owner}/${pr.repo}/pulls/${pr.pull_number}/reviews`,
      "POST", { event: "APPROVE" }, env.GITHUB_TOKEN
    );
    console.log(`[slash] approved ${prUrl} by ${userName}`);
    return ephemeral(`✅ PR approved!\n${prUrl}`);
  } catch (err) {
    console.error(`[slash] failed ${prUrl}:`, err.message);
    return ephemeral(`❌ GitHub error: ${err.message}`);
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    const url = new URL(request.url);
    const rawBody = await request.text();

    // Slack slash command: POST /approve
    if (url.pathname === "/approve") {
      return handleSlashApprove(request, rawBody, env);
    }

    // Slack Events API: POST /
    let payload;
    try { payload = JSON.parse(rawBody); } catch { return new Response("Bad Request", { status: 400 }); }

    // url_verification has no sensitive data — safe before sig check
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
