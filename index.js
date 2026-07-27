const GITHUB_PR_REGEX = /https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/g;

const WHITELISTED_USERS = [
  "aasthaandani", "abhinash-portpro", "abhishekkamati1", "adamportpro",
  "aditya-portpro", "aidang295", "ajit-qa", "alexa0712", "alexeyaudasamora",
  "amanchy", "amitt77", "andyee11", "animesh-pp", "anjalrai-pp",
  "ankit-portpro", "ankush-portpro", "anniechounra14", "annieedholm-eng",
  "annmarie-cmyk", "austin396", "bhusan-dev", "bibash2", "bibekshah220",
  "bprabin811", "briannatennant-sys", "bugthedebugger", "captain-csr",
  "captain-qa-india", "charlotte531", "chirag-portpro", "coralyz-sys",
  "corey-svg", "devarsheee12", "dharmeshportpro", "dhruv-italiya1746",
  "digvijayportpro", "dilippatel-dotcom", "diplap-del", "djemish1",
  "douglasportpro", "esayas-portpro", "eshure-portpro", "fenildev",
  "gflores-pp", "gracy-wq", "harrison-sketch", "harsh-1095", "harsh-portpro",
  "hmonpara", "jacobportpro", "jamesbarr-pixel", "jasonmckenzie-crypto",
  "jaymeenjogiya", "jimmylopez-code", "jinish014", "joanneabsher",
  "joe-wick", "jolynn-portpro", "jordanmckenzie-creator",
  "josephgreenwell-code", "josephreynolds-del", "jrathbun7259",
  "kandelkapi1", "katherine-crypto", "kdburch", "kenrosenthal-png",
  "kevin-portpro", "khimananda-portpro", "kiraw97", "kjesmin",
  "kristen-frakes", "kushal1715", "kushalbaj", "lamadev7",
  "landonwalshportpro", "lindsey-blip", "lori-creator", "mahimasinghp",
  "mandipportpro", "meghan-ops", "michaelbenton-portpro", "milan-portpro",
  "milesv", "morganportpro", "nabin12", "nee2zz", "nelson491",
  "nihar-padhi-portpro", "nikki270", "niraj-gautam", "nirajan995",
  "ombeladiya1854", "osan-rai", "parthikk", "portpro-sanjay", "portpro-tms",
  "prabeshio", "prajjwal440", "prashant-portpro", "prashantghartimagar",
  "prasiddha9999", "priya-portpro", "pukar-portpro", "rachael-netizen",
  "rahulpandya-portpro", "rajanmaurya26", "ramsthapit", "riyapradhan-cpu",
  "robbie-im", "rohanprajapatitachi", "ryanportpro", "sanjayportpro",
  "sarma-chsaps", "sawsankpro", "shelby-wq", "shemallika", "shikha-patel14",
  "shishir111222", "shweta-portpro", "sibendra-portpro", "sjdpk", "smit033",
  "smriti-portpro", "sparth033", "sumankhadkaportpro", "surajgm",
  "suresh-nv", "sushicodee", "swetha-svg", "swos-ti", "system-portpro",
  "taukirsheikh", "terrell67", "thenotoriousmec", "tlaug", "tonipisano",
  "tylerpoffenberger", "tyracarr", "viikas", "vinicio-ops", "viralrkyada",
  "walkerportpro", "wiblebenjamin", "ybabiya", "ykpro25", "bikas", "kapil",
  "parbat", "prassidha"
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

async function postMessage(channel, thread_ts, text, botToken) {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${botToken}` },
    body: JSON.stringify({ channel, thread_ts, text }),
  });
  const data = await res.json();
  if (!data.ok) console.error("[slack] postMessage error:", data.error);
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

      if (!allowed) {
        await postMessage(
          event.channel, event.ts,
          `⚠️ The author of <https://github.com/${pr.owner}/${pr.repo}/pull/${pr.pull_number}|${pr.repo}#${pr.pull_number}> (\`${author}\`) is not whitelisted — skipped auto-approval.`,
          env.SLACK_BOT_TOKEN
        );
        continue;
      }

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
