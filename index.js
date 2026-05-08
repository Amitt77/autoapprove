require("dotenv").config();
const { App } = require("@slack/bolt");
const { WebClient } = require("@slack/web-api");
const { Octokit } = require("@octokit/rest");

// ─── Environment & Config ─────────────────────────────────────────────────────

const config = {
  slack: {
    userToken  : process.env.SLACK_USER_TOKEN,  // xoxp- : read your personal DMs
    botToken   : process.env.SLACK_BOT_TOKEN,   // xoxb- : reserved / future use
    appToken   : process.env.SLACK_APP_TOKEN,   // xapp- : socket mode connection
  },
  github: {
    token      : process.env.GITHUB_TOKEN,      // classic PAT with repo scope
  },
  // ── Whitelist ───────────────────────────────────────────────────────────────
  // Partial GitHub usernames — matches if the PR author's username contains any entry.
  // e.g. "bibek" matches "bibekshah220"
  whitelistedGithubUsers: [
    "amit",
    "bibek",
    "bikas",
    "suman",
    "bhusan",
    "kapil",
    "suraj",
    "parbat",
    "sibendra",
    "ram",
    "prassidha",
    "rohan",
    "mandip",
    "kushal",
    "kushal",
    "viikas",
    "taukir",
    "amanchy",
    "prashantghartimagar"
  ].map((u) => u.toLowerCase()),

  // ── Optional channel watching ───────────────────────────────────────────────
  // Add Slack channel IDs here to also watch for PR links in those channels.
  // The bot must be invited to each channel first (/invite @bot-name).
  // Leave empty to disable.
  watchChannels: process.env.WATCH_CHANNELS
    ? process.env.WATCH_CHANNELS.split(",").map((c) => c.trim()).filter(Boolean)
    : [],
};

const GITHUB_PR_REGEX = /https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/g;

// ─── Clients ──────────────────────────────────────────────────────────────────

const app = new App({
  token     : config.slack.botToken,
  appToken  : config.slack.appToken,
  socketMode: true,
});

const octokit = new Octokit({ auth: config.github.token });
const userClient = config.slack.userToken ? new WebClient(config.slack.userToken) : null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extracts all GitHub PR links from a message text */
function extractPRLinks(text) {
  const matches = [];
  let match;
  const regex = new RegExp(GITHUB_PR_REGEX.source, "g");
  while ((match = regex.exec(text)) !== null) {
    matches.push({
      owner      : match[1],
      repo       : match[2],
      pull_number: parseInt(match[3], 10),
    });
  }
  return matches;
}

/** Fetches the PR author's GitHub username */
async function getGitHubPRAuthor({ owner, repo, pull_number }) {
  const { data } = await octokit.pulls.get({ owner, repo, pull_number });
  return data.user.login.toLowerCase();
}

/** Approves a GitHub PR */
async function approveGitHubPR({ owner, repo, pull_number }) {
  await octokit.pulls.createReview({ owner, repo, pull_number, event: "APPROVE" });
  console.log(`[github] Approved ${owner}/${repo}#${pull_number}`);
}

/** Adds a ✅ reaction. Tries bot first, falls back to user token. */
async function addCheckmarkReaction(client, channel, timestamp) {
  const args = { channel, timestamp, name: "white_check_mark" };
  try {
    await client.reactions.add(args);
  } catch (err) {
    if (!userClient) throw err;
    if (err.data?.error === "already_reacted") return;
    console.log(`[bot] bot reaction failed (${err.data?.error}), retry with user token`);
    await userClient.reactions.add(args);
  }
}

// ─── Core handler ─────────────────────────────────────────────────────────────

async function handleMessage({ message, client, isDM }) {
  const text   = message.text || "";
  const userId = message.user;

  if (!userId || message.subtype === "bot_message") return;

  const prLinks = extractPRLinks(text);
  if (prLinks.length === 0) return;

  for (const pr of prLinks) {
    try {
      const author       = await getGitHubPRAuthor(pr);
      const isWhitelisted = config.whitelistedGithubUsers.some((name) => author.includes(name));

      console.log(`[github] PR ${pr.owner}/${pr.repo}#${pr.pull_number} — author: ${author} — whitelisted: ${isWhitelisted} — via: ${isDM ? "DM" : "channel"}`);

      if (!isWhitelisted) {
        console.log(`[bot] Ignored — "${author}" is not in the whitelist`);
        continue;
      }

      await approveGitHubPR(pr);
      console.log(`[bot] channel=${message.channel} ts=${message.ts} type=${message.channel_type}`);
      await addCheckmarkReaction(client, message.channel, message.ts);
      console.log(`[bot] ✅ Approved and reacted on PR by "${author}"`);
    } catch (err) {
      console.error(`[bot] Failed for ${pr.owner}/${pr.repo}#${pr.pull_number}:`, err.message);
    }
  }
}

// ─── DM listener (primary) ────────────────────────────────────────────────────

app.message(async ({ message, client }) => {
  if (message.channel_type !== "im") return;
  await handleMessage({ message, client, isDM: true });
});

// ─── Channel listener (optional) ─────────────────────────────────────────────
// Activated by adding channel IDs to WATCH_CHANNELS in .env

if (config.watchChannels.length > 0) {
  app.message(async ({ message, client }) => {
    if (message.channel_type !== "channel" && message.channel_type !== "group") return;
    if (!config.watchChannels.includes(message.channel)) return;
    await handleMessage({ message, client, isDM: false });
  });
}

// ─── Start ────────────────────────────────────────────────────────────────────

(async () => {
  await app.start();
  console.log("⚡ Slack PR bot is running via Socket Mode");
  console.log(`   Whitelisted GitHub users : ${config.whitelistedGithubUsers.join(", ") || "(none set)"}`);
  console.log(`   Channel watching         : ${config.watchChannels.length > 0 ? config.watchChannels.join(", ") : "disabled"}`);
})();