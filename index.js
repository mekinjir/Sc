//====( CREATED : @mekinjir X ai gpt Claude deepsek )===\\

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const https = require("https");
const yts = require("yt-search");
const os = require("os");
const { Octokit } = require("@octokit/rest");
const TelegramBot = require("node-telegram-bot-api");

const BOT_TOKEN = "8697896117:AAFpVbFDTnAelrfXdeeha8oFFdHSIpmNghc"; // Ganti dengan token bot

// ----- ( jangan ubah kalo gapaham) ------ \\
const DEVELOPER_FILE = "developers.json";
const ADMIN_FILE = "admins.json";
const RESELLER_FILE = "ressellers.json";
const MODERATOR_FILE = "mods.json";
const CEO_FILE = "ceo.json";
const OWNER_FILE = "owners.json";
const GITHUB_REPO = "mekinjir/Database";
const GITHUB_FILE_PATH = "token.json";
const GITHUB_PAT = "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"; 

const GITHUB_RAW_URL = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/${GITHUB_FILE_PATH}?timestamp=${Date.now()}`;
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_FILE_PATH}`;


async function fetchTokens() {
  try {
    const response = await axios.get(GITHUB_RAW_URL, { headers: { "Cache-Control": "no-cache" } });
    return response.data?.tokens || [];
  } catch (error) {
    return [];
  }
}

async function updateTokens(newTokens) {
  try {
    const { data } = await axios.get(GITHUB_API_URL, {
      headers: { Authorization: `token ${GITHUB_PAT}` },
    });

    const updatedContent = Buffer.from(JSON.stringify({ tokens: newTokens }, null, 2)).toString("base64");

    await axios.put(
      GITHUB_API_URL,
      { message: "Update token list", content: updatedContent, sha: data.sha },
      { headers: { Authorization: `token ${GITHUB_PAT}` } }
    );

    return true;
  } catch (error) {
    return false;
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return text.toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getMainRole(userId) {
  if (isDeveloper(userId)) return "👑 DEVELOPER";
  if (isOwner(userId)) return "🎖️ OWNER";
  if (isCeo(userId)) return "👔 CEO";
  if (isModerator(userId)) return "⚔️ MODERATOR";
  if (isAdmin(userId)) return "🎭 PARTNER";
  if (isReseller(userId))  return "💰 RESELLER";
  return "👤 NO ROLE";
}

let GROUP_ONLY = false;

const BLOCK_FILE = "./block.json";

function loadBlocked() {
  if (!fs.existsSync(BLOCK_FILE)) {
    fs.writeFileSync(BLOCK_FILE, "[]");
  }
  return new Set(JSON.parse(fs.readFileSync(BLOCK_FILE)));
}

let blockedUsers = loadBlocked();

function saveBlocked() {
  fs.writeFileSync(BLOCK_FILE, JSON.stringify([...blockedUsers], null, 2));
}

function blockUser(id) {
  blockedUsers.add(id);
  saveBlocked();
}

function unblockUser(id) {
  blockedUsers.delete(id);
  saveBlocked();
}

function getBlocked() {
  return [...blockedUsers];
}

function checkBlocked(msg, bot) {
  const userId = msg.from.id;
  if (isDeveloper(userId)) return true;

  if (blockedUsers.has(userId)) {
    bot.sendMessage(msg.chat.id, "⛔ You have been blocked by a bot user");
    return false;
  }
  return true;
}

function checkGroupOnly(msg, bot) {
  if (GROUP_ONLY && msg.chat.type === "private") {
    bot.sendMessage(
      msg.chat.id,
      "❌ Bot ini hanya dapat digunakan di group!"
    ).then(sent => {
      setTimeout(() => {
        bot.deleteMessage(msg.chat.id, sent.message_id).catch(() => {});
        bot.deleteMessage(msg.chat.id, msg.message_id).catch(() => {});
      }, 3000);
    });
    return false;
  }
  return true;
}

function txt(m) {
  if (!m) return "";
  return (m.text || m.caption || "").trim();
}

function parseSecs(s) {
  if (typeof s === "number") return s;
  if (!s || typeof s !== "string") return 0;
  return s
    .split(":")
    .map(n => parseInt(n, 10))
    .reduce((a, v) => a * 60 + v, 0);
}

const topVideos = async (q) => {
  const r = await yts.search(q);
  const list = Array.isArray(r) ? r : (r.videos || []);
  return list
    .filter(v => {
      const sec = typeof v.seconds === "number"
        ? v.seconds
        : parseSecs(v.timestamp || v.duration?.timestamp || v.duration);
      return !v.live && sec > 0 && sec <= 1200;
    })
    .slice(0, 5)
    .map(v => ({
      url: v.url,
      title: v.title
    }));
};

function normalizeYouTubeUrl(raw) {
  if (!raw || typeof raw !== "string") return "";
  let u = raw.trim();

  const shorts = u.match(/shorts\/([A-Za-z0-9_-]+)/i);
  if (shorts) return `https://www.youtube.com/watch?v=${shorts[1]}`;

  const short = u.match(/youtu\.be\/([A-Za-z0-9_-]+)/i);
  if (short) return `https://www.youtube.com/watch?v=${short[1]}`;

  const watch = u.match(/v=([A-Za-z0-9_-]+)/i);
  if (watch) return `https://www.youtube.com/watch?v=${watch[1]}`;

  return u;
}

async function downloadToTemp(url, ext = ".mp3") {
  const file = path.join(os.tmpdir(), `music_${Date.now()}${ext}`);
  const res = await axios.get(url, {
    responseType: "stream",
    timeout: 180000
  });

  await new Promise((resolve, reject) => {
    const w = fs.createWriteStream(file);
    res.data.pipe(w);
    w.on("finish", resolve);
    w.on("error", reject);
  });

  return file;
}

function cleanup(f) {
  try { fs.unlinkSync(f); } catch {}
}

function safeDelete(bot, chatId, messageId) {
  return bot.deleteMessage(chatId, messageId).catch(() => {});
}

function safeStopPoll(bot, chatId, messageId) {
  return bot.stopPoll(chatId, messageId).catch(() => {});
}

async function uploadToCatbox(fileUrl) {
  const params = new URLSearchParams();
  params.append("reqtype", "urlupload");
  params.append("url", fileUrl);

  try {
    const { data } = await axios.post(
      "https://catbox.moe/user/api.php",
      params,
      {
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        timeout: 30000,
      }
    );

    return data;
  } catch (err) {
    return err?.response?.data || err.message || err;
  }
}

async function clearAllTokens() {
  try {
    const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_FILE_PATH}`;

    const getFile = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${GITHUB_PAT}`,
        Accept: "application/vnd.github+json"
      }
    });

    const sha = getFile.data.sha;
    const content = JSON.parse(
      Buffer.from(getFile.data.content, "base64").toString()
    );

    if (!content.tokens || content.tokens.length === 0) {
      return { status: false, message: "❌ ☇ Tidak Ada Token Bot Di Dalam Database!!" };
    }

    content.tokens = [];

    await axios.put(
      url,
      {
        message: "Clear all tokens",
        content: Buffer.from(JSON.stringify(content, null, 2)).toString("base64"),
        sha: sha
      },
      {
        headers: {
          Authorization: `Bearer ${GITHUB_PAT}`,
          Accept: "application/vnd.github+json"
        }
      }
    );

    return { status: true };
  } catch (err) {
    console.error("Clear Token Error:", err.response?.data || err.message);
    return { status: false, message: "Gagal menghapus token." };
  }
}

const QUOTA_FILE = "./quota.json";
const DEFAULT_QUOTA = 5;

if (!fs.existsSync(QUOTA_FILE)) {
  fs.writeFileSync(QUOTA_FILE, "{}");
}

function loadQuota() {
  return JSON.parse(fs.readFileSync(QUOTA_FILE, "utf8"));
}

function saveQuota(data) {
  fs.writeFileSync(QUOTA_FILE, JSON.stringify(data, null, 2));
}

function getQuota(userId) {
  const data = loadQuota();
  if (!data[userId]) {
    data[userId] = DEFAULT_QUOTA;
    saveQuota(data);
  }
  return data[userId];
}

function addQuota(userId, amount) {
  const data = loadQuota();
  data[userId] = (data[userId] || DEFAULT_QUOTA) + amount;
  saveQuota(data);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

function loadDeveloper() {
  if (!fs.existsSync(DEVELOPER_FILE)) return { developers: [] };
  return JSON.parse(fs.readFileSync(DEVELOPER_FILE));
}

function loadOwner() {
  if (!fs.existsSync(OWNER_FILE)) return { owners: [] };
  return JSON.parse(fs.readFileSync(OWNER_FILE));
}

function loadAdmins() {
  if (!fs.existsSync(ADMIN_FILE)) return { admins: [] };
  return JSON.parse(fs.readFileSync(ADMIN_FILE));
}

function loadModerators() {
  if (!fs.existsSync(MODERATOR_FILE)) return { moderators: [] };
  return JSON.parse(fs.readFileSync(MODERATOR_FILE));
}

function loadResellers() {
  if (!fs.existsSync(RESELLER_FILE)) return { resellers: [] };
  return JSON.parse(fs.readFileSync(RESELLER_FILE));
}

function loadCeos() {
  if (!fs.existsSync(CEO_FILE)) return { ceos: [] };
  return JSON.parse(fs.readFileSync(CEO_FILE));
}

function saveOwner(data) {
  fs.writeFileSync(OWNER_FILE, JSON.stringify(data, null, 2));
}

function saveAdmins(data) {
  fs.writeFileSync(ADMIN_FILE, JSON.stringify(data, null, 2));
}

function saveModerators(data) {
  fs.writeFileSync(MODERATOR_FILE, JSON.stringify(data, null, 2));
}

function saveResellers(data) {
  fs.writeFileSync(RESELLER_FILE, JSON.stringify(data, null, 2));
}

function saveCeos(data) {
  fs.writeFileSync(CEO_FILE, JSON.stringify(data, null, 2));
}

function isDeveloper(userId) {
  return loadDeveloper().developers.includes(userId);
}

function isOwner(userId) {
  return loadOwner().owners.includes(userId);
}

function isAdmin(userId) {
  return loadAdmins().admins.includes(userId);
}

function isModerator(userId) {
  return loadModerators().moderators.includes(userId);
}

function isReseller(userId) {
  return loadResellers().resellers.includes(userId);
}

function isCeo(userId) {
  return loadCeos().ceos.includes(userId);
}

function hasAccess(userId) {
  return isOwner(userId) || isAdmin(userId) || isReseller(userId) || isModerator(userId) || isCeo(userId) || isDeveloper(userId);
}

    const MENU_IMAGE = "https://files.catbox.moe/lg5if1.mp4";

// ---- ( Main Menu ---- \\

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const DEVELOPER_ID = 7867226245;
const startedUsers = new Set();

const MAIN_MENU_TEXT = `
<blockquote><pre>⬡═―⊱「 V O I D   I N V I C T U S 」⊰―═⬡</pre></blockquote>
–(⌭) Helloo I am a Database Bot to 
access the script so that it can be used
スパムしないでください
<blockquote><pre>⬡═―⊱「 INFORMATION 」⊰―═⬡</pre></blockquote>
⩥ Author: @Mekinjir
⩥ Version: Database
⩥ Prefix: (/)
⩥ Language: JavaScript
<blockquote>( ! ) 𝚂𝚎𝚕𝚕𝚎𝚌𝚝 𝚃𝚑𝚎 𝙼𝚎𝚗𝚞 𝙱𝚞𝚝𝚝𝚘𝚗 𝙱𝚎𝚕𝚘𝚠</blockquote>
`;

const MAIN_MENU_BUTTONS = {
  inline_keyboard: [
   [{ text: "「 𝐌𝐄𝐍𝐔 」", callback_data: "access_menu", style: "success" },
    { text: "「 𝐃𝐄𝐕𝐄𝐋𝐎𝐏𝐄𝐑 」", callback_data: "developer_menu", style: "danger" }]
  ]
};

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const userMsgId = msg.message_id;

  if (!checkBlocked(msg, bot)) return;

  if (msg.chat.type === "private" && !startedUsers.has(userId)) {
    startedUsers.add(userId);

    const firstName = msg.from.first_name || "-";
    const lastName = msg.from.last_name || "";
    const username = msg.from.username
      ? `@${msg.from.username}`
      : "Unknown";

    const time = new Date().toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta"
    });

    const ownerNotif = `
<blockquote><pre>🚨 NOTIFICATION START PRIVATE</pre></blockquote>
────────────────────────
👤 <b>Name:</b> ${firstName} ${lastName}
🔗 <b>Username:</b> ${username}
🆔 <b>User ID:</b> <code>${userId}</code>
💬 <b>Chat:</b> Private
🕒 <b>Waktu:</b> ${time}
`;

    // Notifikasi START PRIVATE hanya dikirim ke semua Developer
    const developers = loadDeveloper().developers || [];
    for (const developerId of developers) {
      bot.sendMessage(String(developerId), ownerNotif, {
        parse_mode: "HTML"
      }).catch(() => {});
    }
  }

  if (!checkGroupOnly(msg, bot)) return;

  if (!hasAccess(userId)) {
    const denyMsg = await bot.sendMessage(
      chatId,
      "❌ You Don't Have Access ( ! )"
    );

    setTimeout(() => {
      bot.deleteMessage(chatId, denyMsg.message_id).catch(() => {});
      bot.deleteMessage(chatId, userMsgId).catch(() => {});
    }, 3000);

    return;
  }

  const loadingMsg = await bot.sendMessage(
    chatId,
`<b>⏳ Initializing Opens the Main Menu...</b>

▰▱▱▱▱▱▱▱▱▱ 10%`,
    { parse_mode: "HTML" }
  );

  const steps = [
    "▰▰▱▱▱▱▱▱▱▱ 20%",
    "▰▰▰▱▱▱▱▱▱▱ 30%",
    "▰▰▰▰▱▱▱▱▱▱ 40%",
    "▰▰▰▰▰▱▱▱▱▱ 50%",
    "▰▰▰▰▰▰▱▱▱▱ 60%",
    "▰▰▰▰▰▰▰▱▱▱ 70%",
    "▰▰▰▰▰▰▰▰▱▱ 80%",
    "▰▰▰▰▰▰▰▰▰▱ 90%",
    "▰▰▰▰▰▰▰▰▰▰ 100%"
  ];

  for (const step of steps) {
    await new Promise(res => setTimeout(res, 300));
    await bot.editMessageText(
`<b>⏳ Initializing Opens the Main Menu...</b>

${step}`,
      {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: "HTML"
      }
    ).catch(() => {});
  }

  setTimeout(async () => {
    await bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});

    await bot.sendVideo(chatId, MENU_IMAGE, {
      caption: MAIN_MENU_TEXT,
      parse_mode: "HTML",
      reply_markup: MAIN_MENU_BUTTONS
    }).catch(() => {});
  }, 300);
});

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;

  let replyText;
  let replyMarkup;

  switch (data) {

    case "access_menu":
      replyText = `
<blockquote><pre>⬡═―⊱ 〣 ACCESS MENU 〣 ⊰―═⬡</pre></blockquote>
▢ /adduser - ID
▢ /deluser - ID
▢ /addtoken - Token Bot
▢ /deltoken - Token Bot
▢ /myrole - Melihat Akses Roles
<blockquote><pre>⬡═―⊱ 〣 OTHER MENU 〣 ⊰―═⬡</pre></blockquote>
▢ /tourl - Reply Photo|Video
▢ /afk - Input Text
▢ /play - Input Text
▢ /iqc - Input †êx†
▢ /sendbokep - Ytta
▢ /tiktoksearch - search video tiktok
▢ /listharga - Melihat Daftar Harga Script
▢ /linkgb - Mengambil Link Group
╘═────────────────────═▣
`;
      replyMarkup = {
        inline_keyboard: [
          [{ text: "⟲ Back To Main", callback_data: "main_menu", style: "success" }]
        ]
      };
      break;
    
    case "developer_menu":
    if (!isDeveloper(query.from.id)) {
      return bot.answerCallbackQuery(query.id, {
        text: "⛔ Khusus Developer",
        show_alert: true
      });
    }

  replyText = `
<blockquote><pre>⬡═―⊱ 〣 DEVELOPER MENU 〣 ⊰―═⬡</pre></blockquote>
▢ /block - ID
▢ /unblock - ID
▢ /grouponly - On|Off
▢ /listblock - Melihat Daftar Block Pengguna User
▢ /cleartoken - Menghapus Semua Bot Token
▢ /listtoken - mengecek semua token
▢ /share - Mengirim Pesan To Group
╘═────────────────────═▣
`;

  replyMarkup = {
    inline_keyboard: [
      [{ text: "⟲ Back To Main", callback_data: "main_menu", style: "success" }]
    ]
  };

  break;

    case "main_menu":
      replyText = MAIN_MENU_TEXT;
      replyMarkup = MAIN_MENU_BUTTONS;
      break;

    default:
      return bot.answerCallbackQuery(query.id, {
        text: "Menu tidak tersedia",
        show_alert: true
      });
  }

  await bot.answerCallbackQuery(query.id).catch(() => {});

  await bot.editMessageCaption(replyText, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: "HTML",
    reply_markup: replyMarkup
  }).catch(() => {});
});

async function restartRolePoll(bot, session) {
  const poll = await bot.sendPoll(
    session.chatId,
    session.title,
    session.pollOptions,
    {
      is_anonymous: false,
      allows_multiple_answers: false
    }
  ).catch(() => null);

  if (!poll?.poll?.id) return;

  rolePollSessions.set(poll.poll.id, {
    ...session,
    pollMessageId: poll.message_id
  });
}

const rolePollSessions =
  global.rolePollSessions instanceof Map
    ? global.rolePollSessions
    : (global.rolePollSessions = new Map());

bot.onText(/^\/(adduser|deluser) (\d+)$/, async (msg, match) => {
  if (!match) return;

  const chatId = msg.chat.id;
  const fromId = msg.from.id;
  const command = match[1];
  const targetId = Number(match[2]);

  if (!checkBlocked(msg, bot)) return;

  if (
    !isOwner(fromId) &&
    !isAdmin(fromId) &&
    !isModerator(fromId) &&
    !isCeo(fromId) &&
    !isDeveloper(fromId)
  ) {
    return bot.sendMessage(chatId, "❌ You Don't Have Access ( ! )");
  }

  const isAdd = command === "adduser";

  const pollOptions = [
    "RESELLER",
    "PARTNER",
    "MODERATOR",
    "CEO",
    "OWNER"
  ];

  const title = isAdd
    ? "Please Select a Role To Added"
    : "Please Select a Role To Deleted";

  let targetUsername = "Unknown";

  try {
    const targetChat = await bot.getChat(targetId);

    if (targetChat?.username) {
      targetUsername = `@${targetChat.username}`;
    } else if (targetChat?.first_name) {
      targetUsername = targetChat.first_name;
      if (targetChat.last_name) {
        targetUsername += ` ${targetChat.last_name}`;
      }
    }
  } catch {}

  const caption = `
<blockquote>┏━━━━━━━━━━━━━━━━━━━━═༉
║👤 Users : ${targetUsername}
║🆔 ID    : ${targetId}
┗━━━━━━━━━━━━━━━━━━━━═༉</blockquote>`;

  const mainMsg = await bot.sendPhoto(
    chatId,
    "https://files.catbox.moe/algmno.jpg",
    {
      caption: caption,
      parse_mode: "HTML"
    }
  ).catch(() => null);

  if (!mainMsg) return;

  const pollMsg = await bot.sendPoll(chatId, title, pollOptions, {
    is_anonymous: false,
    allows_multiple_answers: false
  }).catch(() => null);

  if (!pollMsg?.poll?.id) return;

  rolePollSessions.set(pollMsg.poll.id, {
    chatId: chatId,
    pollMessageId: pollMsg.message_id,
    mainMessageId: mainMsg.message_id,
    executorId: fromId,
    targetId: targetId,
    isAdd: isAdd,
    pollOptions: pollOptions,
    title: title
  });
});

bot.on("poll_answer", async (answer) => {
  if (!answer?.poll_id) return;

  const pollId = answer.poll_id;
  if (!rolePollSessions.has(pollId)) return;

  const session = rolePollSessions.get(pollId);
  if (!session) return;

  const {
    chatId,
    pollMessageId,
    mainMessageId,
    executorId,
    targetId,
    isAdd
  } = session;

  if (!answer.option_ids?.length) return;

  if (answer.user.id !== executorId) {
    const username = answer.user.username
      ? `@${answer.user.username}`
      : answer.user.first_name || "User";

    await bot.sendMessage(
      chatId,
`⛔ <b>Akses Ditolak</b>

👤 ${username}
<i>Polling ini bukan milik kamu</i>`,
      { parse_mode: "HTML" }
    ).catch(() => {});

    if (typeof safeStopPoll === "function") {
      await safeStopPoll(bot, chatId, pollMessageId).catch(() => {});
    }

    await bot.deleteMessage(chatId, pollMessageId).catch(() => {});
    await bot.deleteMessage(chatId, mainMessageId).catch(() => {});

    rolePollSessions.delete(pollId);

    await restartRolePoll(bot, session);
    return;
  }

  const roles = ["RESELLER", "PARTNER", "MODERATOR", "CEO", "OWNER"];
  const roleName = roles[answer.option_ids[0]];
  if (!roleName) return;

  let list;
  let saveFn;
  let key;

  if (roleName === "RESELLER") {
    list = loadResellers();
    saveFn = saveResellers;
    key = "resellers";
  } else if (roleName === "PARTNER") {
    list = loadAdmins();
    saveFn = saveAdmins;
    key = "admins";
  } else if (roleName === "MODERATOR") {
    list = loadModerators();
    saveFn = saveModerators;
    key = "moderators";
  } else if (roleName === "CEO") {
    list = loadCeos();
    saveFn = saveCeos;
    key = "ceos";
  } else if (roleName === "OWNER") {
    list = loadOwner();
    saveFn = saveOwner;
    key = "owners";
  }

  if (!Array.isArray(list[key])) list[key] = [];

  const userId = executorId;

  const denied =
    (roleName === "RESELLER" && !(isAdmin(userId) || isOwner(userId) || isModerator(userId) || isCeo(userId) || isDeveloper(userId))) ||
    (roleName === "PARTNER" && !(isOwner(userId) || isCeo(userId) || isModerator(userId) || isDeveloper(userId))) ||
    (roleName === "MODERATOR" && !(isOwner(userId) || isCeo(userId) || isDeveloper(userId))) ||
    (roleName === "CEO" && !(isOwner(userId) || isDeveloper(userId))) ||
    (roleName === "OWNER" && !isDeveloper(userId));

  let text = "";

  if (denied) {
    text = "❌ <b>Tidak Mempunyai Akses!</b>";
  } else if (isAdd) {
    if (list[key].includes(targetId)) {
      text = `⚠️ <b>User sudah ${roleName}!</b>`;
    } else {
      list[key].push(targetId);
      saveFn(list);
      text = `<b>✅ Role berhasil ditambahkan!</b>
───────────────────
👤 ID   : ${targetId}
🔮 Role : <b>${roleName}</b>
☇ Oleh : ${answer.user.first_name}`;
    }
  } else {
    if (!list[key].includes(targetId)) {
      text = `⚠️ <b>User bukan ${roleName}!</b>`;
    } else {
      list[key] = list[key].filter(id => id !== targetId);
      saveFn(list);
      text = `<b>🗑️ Role berhasil dihapus</b>
───────────────────
👤 ID   : ${targetId}
🔮 Role : <b>${roleName}</b>
☇ Oleh : ${answer.user.first_name}`;
    }
  }

  await bot.sendMessage(chatId, text, { parse_mode: "HTML" }).catch(() => {});
  await bot.deleteMessage(chatId, pollMessageId).catch(() => {});
  await bot.deleteMessage(chatId, mainMessageId).catch(() => {});

  rolePollSessions.delete(pollId);
});

function maskToken(token) {
  const front = 12;
  if (token.length <= front) return token;

  const start = token.slice(0, front);
  const masked = "...";

  return start + masked;
}

const pendingTokens =
  global.pendingTokens instanceof Map
    ? global.pendingTokens
    : (global.pendingTokens = new Map());

const verifyPollV2 =
  global.verifyPollV2 instanceof Map
    ? global.verifyPollV2
    : (global.verifyPollV2 = new Map());

const verifyLocks =
  global.verifyLocks instanceof Set
    ? global.verifyLocks
    : (global.verifyLocks = new Set());

bot.onText(/\/addtoken (.+)/, async (msg, match) => {
  try {
    if (!match?.[1]) return;
    if (!checkBlocked(msg, bot)) return;
    if (!checkGroupOnly(msg, bot)) return;

    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const firstName = msg.from.first_name || "User";
    const time = new Date().toLocaleString("id-ID");
    const newToken = match[1].trim();

    if (!hasAccess(userId)) {
      return bot.sendMessage(chatId, "❌ You Don't Have Access ( ! )");
    }

    const quota = getQuota(userId);
    if (quota <= 0) {
      const MAX_QUOTA = 5;
      return bot.sendMessage(
        chatId,
`⚠️ <b>Batas Kuota Tercapai</b>

📊 <b>Kuota Anda:</b> ${MAX_QUOTA}/${MAX_QUOTA}
🎯 <b>Sisa Kuota:</b> 0

<i>Silakan hubungi Admin
untuk menambah kuota.</i>`,
        { parse_mode: "HTML" }
      );
    }

    const tokens = (await fetchTokens()) || [];
    if (tokens.includes(newToken)) {
      return bot.sendMessage(chatId, "⚠️ Bot Token Already Exists");
    }

    if (pendingTokens.has(userId)) {
      clearTimeout(pendingTokens.get(userId)?.timeout);
      pendingTokens.delete(userId);
    }

    const timeout = setTimeout(() => {
      pendingTokens.delete(userId);
    }, 15000);

    const addedMsg = await bot.sendPhoto(
      chatId,
      "https://files.catbox.moe/925c99.jpg",
      {
        caption: `✅ <u><b>Token Successfully Added</b></u>

⬡═━═━━━━━━━━━━━━━═━═⬡
👤 <b>Added By:</b> ${firstName}
🔑 <b>Token:</b> ${maskToken(newToken)}
📡 <b>Sisa Kuota:</b> ${quota}
🕒 <b>Time:</b> ${time}
⬡═━═━━━━━━━━━━━━━═━═⬡

<u><b>ⓘ Select The Polling Below</b></u>`,
        parse_mode: "HTML"
      }
    );

    const pollMsg = await bot.sendPoll(
      chatId,
      "Verify Token to activate it or Cancel Token to deactivate it.",
      ["🔍 Verify Token", "❌ Cancel Token"],
      {
        is_anonymous: false,
        allows_multiple_answers: false
      }
    );

    pendingTokens.set(userId, {
      token: newToken,
      chatId,
      messageId: pollMsg.message_id,
      addedMessageId: addedMsg.message_id,
      timeout
    });

    verifyPollV2.set(pollMsg.poll.id, {
      userId,
      token: newToken,
      chatId,
      messageId: pollMsg.message_id,
      addedMessageId: addedMsg.message_id,
      timeout
    });

  } catch (err) {
    console.error("addtoken error:", err);
  }
});

bot.on("poll_answer", async (answer) => {
  if (!answer?.poll_id) return;
  if (!verifyPollV2.has(answer.poll_id)) return;

  const data = verifyPollV2.get(answer.poll_id);
  if (!data) return;

  const user = answer.user;
  const userId = user.id;

  if (verifyLocks.has(userId)) return;
  verifyLocks.add(userId);

  try {
    const {
      token,
      chatId,
      messageId,
      addedMessageId,
      timeout,
      userId: ownerId
    } = data;

    if (userId !== ownerId) {
      const username = user.username
        ? `@${user.username}`
        : user.first_name || "User";

      await bot.stopPoll(chatId, messageId).catch(() => {});
      await bot.deleteMessage(chatId, messageId).catch(() => {});

      const newPoll = await bot.sendPoll(
        chatId,
        "Verify Token to activate it or Cancel Token to deactivate it.",
        ["🔍 Verify Token", "❌ Cancel Token"],
        {
          is_anonymous: false,
          allows_multiple_answers: false
        }
      );
      
      verifyPollV2.delete(answer.poll_id);
      verifyPollV2.set(newPoll.poll.id, {
        ...data,
        messageId: newPoll.message_id
      });

      await bot.sendMessage(
        chatId,
`⛔ <b>Akses Ditolak</b>
👤 ${username}
<i>Polling ini bukan milik kamu</i>`,
        { parse_mode: "HTML" }
      ).catch(() => {});

      return;
    }

    const selected = answer.option_ids?.[0];
    if (selected === undefined) return;

    await bot.deleteMessage(chatId, messageId).catch(() => {});
    if (addedMessageId) {
      await bot.deleteMessage(chatId, addedMessageId).catch(() => {});
    }

    if (selected === 1) {
      clearTimeout(timeout);
      pendingTokens.delete(userId);
      verifyPollV2.delete(answer.poll_id);

      await bot.sendMessage(chatId, "❌ Verifikasi Token Dibatalkan");
      return;
    }

    // === VERIFY SUCCESS ===
const tokens = (await fetchTokens()) || [];

if (!tokens.includes(token)) {
  tokens.push(token);
  await updateTokens(tokens);
}

// kurangi quota
getQuota(userId, 1);

// cleanup
clearTimeout(timeout);
pendingTokens.delete(userId);
verifyPollV2.delete(answer.poll_id);

// format user
const maskedToken = maskToken(token);
const firstName = user.first_name || "User";
const username = user.username
  ? `@${user.username}`
  : firstName;

const time = new Date().toLocaleString("id-ID");

// === MESSAGE KE USER ===
await bot.sendMessage(
  chatId,
`✅ <u><b>Token Successfully Verification</b></u>

━━━━━━━━━━━━━━━━━━━━━⟢
🔑 <b>Token:</b> ${maskedToken}
🕒 <b>Status:</b> 🟢 Active
━━━━━━━━━━━━━━━━━━━━━⟢
⌬ <b>Username:</b> ${username}
╰⊱ <b>UserId:</b> ${userId}
━━━━━━━━━━━━━━━━━━━━━⟢
𝘠𝘰𝘶𝘳 𝘵𝘰𝘬𝘦𝘯 𝘩𝘢𝘴 𝘣𝘦𝘦𝘯 𝘴𝘶𝘤𝘤𝘦𝘴𝘴𝘧𝘶𝘭𝘭𝘺 𝘷𝘦𝘳𝘪𝘧𝘪𝘤𝘢𝘵𝘪𝘰𝘯 𝘢𝘯𝘥 𝘪𝘴 𝘯𝘰𝘸 𝘢𝘤𝘵𝘪𝘷𝘦.`,
  { parse_mode: "HTML" }
);

await bot.sendMessage(
  chatId,
  `✅ Token kamu berhasil diverifikasi, ${firstName}`
);

// === NOTIF ACC TOKEN BARU KE DEVELOPER ===
const developers = loadDeveloper().developers || [];
const tokenNotif = `📥 <b>ACC TOKEN BARU</b>

━━━━━━━━━━━━━━━━━━━━━⟢
👤 <b>User:</b> ${username}
🆔 <b>User ID:</b> ${userId}
🔑 <b>Token:</b> ${maskedToken}
🕒 <b>Waktu:</b> ${time}
━━━━━━━━━━━━━━━━━━━━━⟢`;

for (const developerId of developers) {
  await bot.sendMessage(String(developerId), tokenNotif, {
    parse_mode: "HTML"
  }).catch(() => {});
}

  } catch (err) {
    console.error("verify token error:", err);
  } finally {
    verifyLocks.delete(userId);
  }
});

bot.onText(/^\/addkuota (\d+) (\d+)$/, (msg, match) => {
  const chatId = msg.chat.id;
  const fromId = msg.from.id;

  if (!isDeveloper(fromId)) {
    return bot.sendMessage(chatId, "⛔ Command khusus developer");
  }

  const targetId = match[1];
  const amount = Number(match[2]);

  if (amount <= 0) {
    return bot.sendMessage(chatId, "❌ Jumlah kuota tidak valid");
  }

  addQuota(targetId, amount);

  const total = getQuota(targetId);

  bot.sendMessage(
    chatId,
`✅ Kuota Berhasil Ditambahkan

👤 User ID : ${targetId}
➕ Ditambah : ${amount}
📦 Total   : ${total}`
  );
});

bot.onText(/\/deltoken (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;
  const firstName = msg.from.first_name || "Unknown";
  const delToken = match[1].trim();
  
  if (!checkBlocked(msg, bot)) return;
  
  if (!checkGroupOnly(msg, bot)) return;

  if (!hasAccess(msg.from.id)) {
    return bot.sendMessage(chatId, "❌ You Don't Have Access ( ! )");
  }

  let tokens = await fetchTokens();
  if (!tokens.includes(delToken)) {
    return bot.sendMessage(chatId, "⚠️ 𝙱𝚘𝚝 𝚃𝚘𝚔𝚎𝚗 𝙽𝚘𝚝 𝙵𝚘𝚞𝚗𝚍");
  }

  tokens = tokens.filter(t => t !== delToken);
  const success = await updateTokens(tokens);

  const maskedToken = maskToken(delToken);

  if (success) {
    bot.sendMessage(
      chatId, `<pre>✅ ☇ Token Deleted Successfully</pre>`,
      { parse_mode: "HTML" }
    );
  } else {
    bot.sendMessage(
      chatId,
      `❌ *Failed to Delete Token*\n` +
      `──────────────────────\n` +
      `Terjadi kesalahan saat menghapus token.\n` +
      `Silakan coba lagi nanti.`,
      { parse_mode: "Markdown" }
    );
  }
});

const TARGET_GROUP_ID = -1003580264149;

bot.onText(/\/share(?:\s+([\s\S]+))?/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = match[1]?.trim();

  if (!isDeveloper(userId)) {
    return bot.sendMessage(chatId, "❌ Anda Bukan Developer ( ! )");
  }

  if (!text) {
    return bot.sendMessage(chatId, "❗ Contoh:\n/share Halo semua");
  }

  const shareText = `
<b>📢 PESAN DARI DEVELOPER 🚨</b>

━━━━━━━━━━━━━━━━━━━━━
${text}
━━━━━━━━━━━━━━━━━━━━━

`.trim();

  try {
    await bot.sendMessage(TARGET_GROUP_ID, shareText, {
      parse_mode: "HTML",
      disable_web_page_preview: true
    });

    await bot.sendMessage(chatId, "✅ Berhasil di-share ke grup tujuan");
  } catch (err) {
    console.error("Share Error:", err.message);
    bot.sendMessage(chatId, "❌ Gagal mengirim ke grup");
  }
});

bot.onText(/\/listtoken/, async (msg) => {
  const chatId = msg.chat.id;
  const tokens = await fetchTokens();

  if (!checkBlocked(msg, bot)) return;
  if (!checkGroupOnly(msg, bot)) return;

  if (!hasAccess(msg.from.id))
    return bot.sendMessage(chatId, "❌ You Don't Have Access ( ! )");

  if (!tokens || tokens.length === 0)
    return bot.sendMessage(chatId, "⚠️ Tidak ada token tersimpan.");

  let tokenList = tokens
    .map((t, i) => {
      const tokenStr = String(
        typeof t === "object" && t !== null
          ? t.token ?? t.value ?? t.key ?? ""
          : t
      );

      return `${i + 1}. \`${tokenStr.slice(0, 12)}...\`
────────────────────`;
    })
    .join("\n");

  bot.sendMessage(
    chatId,
`📜 *DAFTAR TOKEN BOT*
━━━━━━━━━━━━━━━━━━━━
${tokenList}

📦 *Total Token Bot:* ${tokens.length}`,
    { parse_mode: "Markdown" }
  );
});

// ===== COMMAND /play =====
async function handlerPlay(bot, message, prefix) {
  let loading
  try {
    const chatId = message.chatId || message.chat?.id
    const text = message.text || message.message || ""
    const query = text.split(" ").slice(1).join(" ").trim()

    if (!query) {
      return bot.sendMessage(chatId, {
        message: `<blockquote>⚠️ <b>Format:</b> ${prefix}play [ kata kunci ]</blockquote>`,
        parseMode: "html",
        replyTo: message.id
      })
    }

    loading = await bot.sendMessage(chatId, {
      message: `<blockquote>🚀 Mencari judul: <b>${escapeHtml(query)}</b>\nMohon tunggu...</blockquote>`,
      parseMode: "html",
      replyTo: message.id
    })

    // === SEARCH ===
    const searchUrl = `https://api.siputzx.my.id/api/s/spotify?query=${encodeURIComponent(query)}`
    const searchRes = await axios.get(searchUrl, { timeout: 15000 })
    const searchData = searchRes.data

    if (!searchData?.status || !searchData?.data?.length) {
      await bot.deleteMessages(chatId, [loading.id], { revoke: true }).catch(() => {})
      return bot.sendMessage(chatId, {
        message: `<blockquote>❌ Tidak ditemukan hasil untuk: <b>${escapeHtml(query)}</b></blockquote>`,
        parseMode: "html",
        replyTo: message.id
      })
    }

    const track = searchData.data[0]
    const trackUrl = track.track_url || track.url
    const title = (track.title || "Unknown").slice(0, 120)
    const artist = (track.artist || "").slice(0, 120)
    const cover = track.thumbnail || null

    if (!trackUrl) throw new Error("URL lagu tidak tersedia")

    // === DOWNLOAD ===
    const dUrl = `https://api.siputzx.my.id/api/d/spotify?url=${encodeURIComponent(trackUrl)}`
    const downRes = await axios.get(dUrl, { timeout: 20000 })
    const downData = downRes.data

    const mp3Link = downData?.data?.mp3DownloadLink
    if (!mp3Link) throw new Error("Link MP3 tidak ditemukan")

    const fileResp = await axios.get(mp3Link, {
      responseType: "arraybuffer",
      timeout: 60000,
      maxContentLength: 200 * 1024 * 1024
    })

    const size = fileResp.data.length
    const MAX = 60 * 1024 * 1024

    await bot.deleteMessages(chatId, [loading.id], { revoke: true }).catch(() => {})

    // === FILE KEGEDEAN ===
    if (size > MAX) {
      return bot.sendMessage(chatId, {
        message: `<blockquote>✅ Ditemukan: <b>${escapeHtml(title)}</b>\n❌ File terlalu besar\n<a href="${mp3Link}">Download MP3</a>\n© ʙʏ ɢʟᴏʀʏ ᴇxɪᴛᴜꜱ</blockquote>`,
        parseMode: "html",
        replyTo: message.id
      })
    }

    // === SEND AUDIO ===
    await bot.sendMessage(chatId, {
      audio: Buffer.from(fileResp.data),
      caption: `<blockquote><b>📝 Judul:</b> ${escapeHtml(title)}\n<b>👤 Artist:</b> ${escapeHtml(artist)}\n© ʙʏ ɢʟᴏʀʏ ᴇxɪᴛᴜꜱ</blockquote>`,
      title,
      performer: artist,
      fileName: `${title}.mp3`,
      thumb: cover,
      parseMode: "html",
      replyTo: message.id
    })

  } catch (err) {
    console.error("play error:", err)
    const chatId = message.chatId || message.chat?.id

    if (loading?.id) {
      await bot.deleteMessages(chatId, [loading.id], { revoke: true }).catch(() => {})
    }

    await bot.sendMessage(chatId, {
      message: `<blockquote>❌ Gagal memutar lagu\nDetail: ${escapeHtml(err.message || String(err))}</blockquote>`,
      parseMode: "html",
      replyTo: message.id
    })
  }
}

// ===== LISTENER =====
bot.on("message", async (message) => {
  try {
    const prefix = "/"
    const text = message.text || ""

    if (!text.startsWith(prefix)) return

    const command = text.slice(prefix.length).trim().split(/\s+/)[0].toLowerCase()

    if (command === "play") {
      await handlerPlay(bot, message, prefix)
    }

  } catch (err) {
    console.error("index error:", err)
  }
})

bot.onText(/^\/tourl$/i, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const replyMsg = msg.reply_to_message;

  if (!replyMsg) {
    return bot.sendMessage(
      chatId,
      "🪧 ☇ Format: /tourl (reply dengan foto atau video)",
      { reply_to_message_id: msg.message_id }
    );
  }

  let fileId = null;

  if (replyMsg.photo && replyMsg.photo.length) {
    fileId = replyMsg.photo[replyMsg.photo.length - 1].file_id;
  } else if (replyMsg.video) {
    fileId = replyMsg.video.file_id;
  } else if (replyMsg.video_note) {
    fileId = replyMsg.video_note.file_id;
  } else {
    return bot.sendMessage(
      chatId,
      "❌ ☇ Hanya mendukung foto atau video",
      { reply_to_message_id: msg.message_id }
    );
  }

  const loadingFrames = [
    "▰▱▱▱▱▱▱▱▱▱",
    "▰▰▱▱▱▱▱▱▱▱",
    "▰▰▰▱▱▱▱▱▱▱",
    "▰▰▰▰▱▱▱▱▱▱",
    "▰▰▰▰▰▱▱▱▱▱",
    "▰▰▰▰▰▰▱▱▱▱",
    "▰▰▰▰▰▰▰▱▱▱",
    "▰▰▰▰▰▰▰▰▱▱",
    "▰▰▰▰▰▰▰▰▰▱",
    "▰▰▰▰▰▰▰▰▰▰"
  ];

  const waitMsg = await bot.sendMessage(chatId, `
 ⏳ ☇ Proccessing......\n${loadingFrames[0]}`,
    { reply_to_message_id: msg.message_id }
  );

  let loadingIndex = 0;
  const loadingInterval = setInterval(() => {
    loadingIndex = (loadingIndex + 1) % loadingFrames.length;
    bot.editMessageText(`
 ⏳ ☇ Proccessing......\n${loadingFrames[loadingIndex]}`,
      {
        chat_id: chatId,
        message_id: waitMsg.message_id
      }
    ).catch(() => {});
  }, 400);

  try {
    const file = await bot.getFile(fileId);
    const fileLink = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;

    const uploadedUrl = await uploadToCatbox(fileLink);

    clearInterval(loadingInterval);

    if (
      typeof uploadedUrl === "string" &&
      /^https?:\/\/files\.catbox\.moe\//i.test(uploadedUrl.trim())
    ) {
      await bot.sendMessage(
        chatId,
        `
🔗 ☇ ᴜᴘʟᴏᴀᴅ ꜱᴜᴄᴄᴇꜱꜱꜰᴜʟʟʏ
──────────────────
${uploadedUrl.trim()}
<b><u>⎋ ᴠᴏɪᴅ ɪɴᴠɪᴄᴛᴜs</u></b>`,
        {
          reply_to_message_id: msg.message_id,
          parse_mode: "HTML"
        }
      );
    } else {
      await bot.sendMessage(
        chatId,
        "❌ ☇ Gagal upload ke Catbox.\n" +
          String(uploadedUrl).slice(0, 200),
        { reply_to_message_id: msg.message_id }
      );
    }
  } catch (e) {
    clearInterval(loadingInterval);

    const msgError = e?.response?.status
      ? `❌ ☇ Error ${e.response.status} saat unggah ke Catbox`
      : "❌ ☇ Gagal unggah, coba lagi.";

    await bot.sendMessage(chatId, msgError, {
      reply_to_message_id: msg.message_id
    });
  } finally {
    setTimeout(() => {
      bot.deleteMessage(chatId, waitMsg.message_id).catch(() => {});
    }, 1000);
  }
});

bot.onText(/\/info/, async (msg) => {
  try {
    const chatId = msg.chat.id;
    const user = msg.from;
    const userId = user.id;
    const username = user.username ? `@${user.username}` : "Unknown";
    const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");

    const userLink = `<a href="tg://user?id=${userId}">Link Click Here</a>`;

    const text = `
<blockquote>⬡═—⊱ ⎧  USER INFO  ⎭ ⊰—═⬡</blockquote>
⎋ ID : <code>${userId}</code>
⎋ Username : ${username}
⎋ Full Name : ${fullName || "Unknown"}
⎋ User Link : ${userLink}
`;

    await bot.sendMessage(chatId, text, {
      parse_mode: "HTML",
      disable_web_page_preview: true
    });
  } catch (err) {
    console.error("Error:", err);
  }
});

bot.onText(/\/block (\d+)/, (msg, match) => {
  const userId = msg.from.id;

  if (!isDeveloper(userId)) {
    return bot.sendMessage(msg.chat.id, "❌ Kamu bukan owner");
  }

  const targetId = Number(match[1]);
  blockUser(targetId);

  bot.sendMessage(msg.chat.id, `✅ User ${targetId} berhasil diblokir`);
});

bot.onText(/\/listblock/, (msg) => {
  const userId = msg.from.id;

  if (!isDeveloper(userId)) {
    return bot.sendMessage(msg.chat.id, "❌ Kamu bukan owner");
  }

  const list = getBlocked();
  if (list.length === 0) {
    return bot.sendMessage(msg.chat.id, "📭 Tidak ada user terblokir");
  }

  const text = list.map(id => `🚫 ID: ${id}`).join("\n");
  bot.sendMessage(msg.chat.id, `🚫 *Daftar User Terblokir:*\n${text}`, {
    parse_mode: "Markdown"
  });
});

bot.onText(/\/unblock (\d+)/, (msg, match) => {
  const userId = msg.from.id;

  if (!isDeveloper(userId)) {
    return bot.sendMessage(msg.chat.id, "❌ Kamu bukan owner");
  }

  const targetId = Number(match[1]);
  unblockUser(targetId);

  bot.sendMessage(msg.chat.id, `✅ User ${targetId} dibuka blokir`);
});

bot.onText(/\/grouponly (on|off)/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const mode = match[1].toLowerCase();

  if (!isDeveloper(userId)) {
    return bot.sendMessage(chatId, "❌ Perintah ini hanya untuk Owner!");
  }

  GROUP_ONLY = mode === "on";

  const statusText = GROUP_ONLY ? "🟢 ON (Group Only)" : "🔴 OFF (Private Allowed)";

  bot.sendMessage(
    chatId,
`⚙️ <b>GROUP ONLY MODE</b>

Status: <b>${statusText}</b>`,
    { parse_mode: "HTML" }
  );
});

bot.onText(/\/listharga/i, async (msg) => {

  if (!checkBlocked(msg, bot)) return;

  if (!checkGroupOnly(msg, bot)) return;

  const chatId = msg.chat.id;

  const photosurl = "https://files.catbox.moe/ukoqfb.jpg";

  const HARGA_MAIN = `
<blockquote>╔════════════════════
║ <u>⧼ V O I D   I N V I C T U S ⧽</u>
╠════════════════════
║ <u>⧼ 𝐋𝐈𝐒𝐓 𝐇𝐀𝐑𝐆𝐀 𝐒𝐂𝐑𝐈𝐏𝐓 ⧽</u>
╠════════════════════
║⌬ FREE UPDATE: Rp 5.000/5K
║⌬ RESELLER: Rp 10.000/10K
║⌬ PARTNER: Rp 15.000/15K
║⌬ MODERATOR: Rp 20.000/20K
║⌬ CEO: Rp 25.000/25K
║⌬ OWNER: Rp 30.000/30K
╠════════════════════
║⚠️NOTE: NO MERUSAK HARGA 
║SCRIPT SESUAI DENGAN
║HARGA NYA TERIMAKASIH‼️
╚═════════════════════</blockquote>
`;

  await bot.sendPhoto(chatId, photosurl, {
    caption: HARGA_MAIN,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "☇ Contacts 📞", url: "https://t.me/Mekinjir" }
        ]
      ]
    }
  });
});

bot.onText(/\/myrole/, async (msg) => {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const role = getMainRole(msg.from.id);
    
  if (!checkBlocked(msg, bot)) return;

  if (!checkGroupOnly(msg, bot)) return;

    const photoUrls = "https://files.catbox.moe/3grcd5.jpg"; 

    const caption = `
┏═━━━━━━━━━━━━━━━━━═⬡
┃<b>🧩 INFORMATION ROLE AKUN</b>
┗═━━━━━━━━━━━━━━━━━═⬡
┏═━━━━━━━━━━━━━━━━━═⬡
┃<b>🆔 ID :</b> ${userId}
┃<b>💼 Role : ${role}</b>
┗═━━━━━━━━━━━━━━━━━═⬡
`;

    await bot.sendPhoto(chatId, photoUrls, {
      caption: caption,
      parse_mode: "HTML"
    });

  } catch (err) {
    console.error("error:", err);
    bot.sendMessage(msg.chat.id, "❌ Terjadi kesalahan saat mengecek role.");
  }
});

bot.onText(/^\/iqc(?:\s+(.+))?$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const msgId = msg.message_id;
  const textMsg = match[1];

  if (!textMsg) {
    return bot.sendMessage(
      chatId,
      "🪧 Format salah.\n\nContoh:\n`/iqc Name | 21:45 | 77 | TELKOMSEL`",
      {
        parse_mode: "Markdown",
        reply_to_message_id: msgId
      }
    ).catch(() => {});
  }

  const parts = textMsg.split("|").map(p => p.trim());
  const text = parts[0];
  const time = parts[1] || "00:00";
  const battery = parts[2] || "100";
  const carrier = parts[3] || "TELKOMSEL";

  const apiUrl =
    `https://brat.siputzx.my.id/iphone-quoted?` +
    `time=${encodeURIComponent(time)}` +
    `&messageText=${encodeURIComponent(text)}` +
    `&carrierName=${encodeURIComponent(carrier)}` +
    `&batteryPercentage=${encodeURIComponent(battery)}` +
    `&signalStrength=4&emojiStyle=apple`;

  try {
    await bot.sendChatAction(chatId, "upload_photo").catch(() => {});

    const response = await axios.get(apiUrl, { responseType: "arraybuffer" });
    const buffer = Buffer.from(response.data);
    
    await bot.sendPhoto(
      chatId,
      buffer,
      {
        caption:
`\`\`\`
⬡═⊱ VOID INVICTUS ⊰═⬡
━━━━━━━━━━━━━━━━━━━━⟢
「 ⚆ 」IPhone Generate
━━━━━━━━━━━━━━━━━━━━⟢
Chat : \`${text}\`
Time : ${time}
Baterry : ${battery}%
Kartu : ${carrier}
━━━━━━━━━━━━━━━━━━━━⟢
\`\`\``,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "「 αµƭɦσɾ 」", url: "https://t.me/Mekinjir" }]
          ]
        },
        reply_to_message_id: msgId
      }
    );

  } catch (e) {
    console.error("❌ Error:", e.message);
    bot.sendMessage(
      chatId,
      "❌ Terjadi kesalahan saat memproses gambar.",
      { reply_to_message_id: msgId }
    ).catch(() => {});
  }
});

const tiktokCache = new Map(); 

bot.onText(/\/tiktoksearch(?:\s+(.+))?/, async (msg, match) => {  
    const chatId = msg.chat.id;  
    const msgId = msg.message_id;  
    const userId = msg.from.id;  

    try {  
        const keyword = match && match[1] ? match[1].trim() : null;  

        if (!keyword) {  
            return bot.sendMessage(  
                chatId,  
                "🪧 Masukkan kata kunci!\nContoh: `/tiktoksearch epep`",  
                { parse_mode: "Markdown", reply_to_message_id: msgId }  
            );  
        }  

        const loading = await bot.sendMessage(chatId, "⏳ SEARCHING VIDEO TIKTOK...");  

        const searchUrl =  
            `https://www.tikwm.com/api/feed/search?keywords=${encodeURIComponent(keyword)}&count=5`;  

        const res = await axios.get(searchUrl, { timeout: 20000 });  
        const data = res.data;  

        const videos =  
            data?.data?.videos ||  
            data?.data?.list ||  
            data?.data?.aweme_list ||  
            data?.data ||  
            [];  

        if (!Array.isArray(videos) || videos.length === 0) {  
            await bot.deleteMessage(chatId, loading.message_id).catch(() => {});  
            return bot.sendMessage(chatId, "⚠️ Tidak ada hasil ditemukan.");  
        }  

        const topVideos = videos.slice(0, 5);  
        const uniqueKey = Math.random().toString(36).slice(2, 10);  

        tiktokCache.set(uniqueKey, {  
            data: topVideos,  
            expire: Date.now() + (10 * 60 * 1000)  
        });  

        await bot.deleteMessage(chatId, loading.message_id).catch(() => {});  
        
        const buttons = topVideos.map((v, i) => ([{
            text: `${i + 1}. ${(v.title || "Tanpa Judul").slice(0, 30)}`,
            callback_data: `tt_${uniqueKey}_${i}_${userId}`
        }]));

        await bot.sendMessage(
            chatId,
            `📌 Ditemukan ${topVideos.length} hasil untuk:\n${keyword}\n\nPilih video:`,
            {
                reply_markup: {
                    inline_keyboard: buttons
                }
            }
        );

    } catch (err) {  
        console.error("❌ TikTok Search Error:", err.message);  
        bot.sendMessage(chatId, "⚠️ Gagal mengambil hasil pencarian TikTok.");  
    }  
});

bot.on("callback_query", async (query) => {
    try {
        const data = query.data;
        if (!data.startsWith("tt_")) return;

        const [_, cacheKey, index, userId] = data.split("_");

        if (query.from.id != userId) {
            return bot.answerCallbackQuery(query.id, {
                text: "⚠️ Ini bukan tombol kamu!",
                show_alert: true
            });
        }

        const cachedObj = tiktokCache.get(cacheKey);
        if (!cachedObj) {
            return bot.answerCallbackQuery(query.id, {
                text: "⚠️ Cache expired!",
                show_alert: true
            });
        }

        const v = cachedObj.data[index];
        if (!v) {
            return bot.answerCallbackQuery(query.id, {
                text: "⚠️ Data tidak valid!",
                show_alert: true
            });
        }

        await bot.answerCallbackQuery(query.id);

        const chatId = query.message.chat.id;

        await bot.deleteMessage(chatId, query.message.message_id).catch(() => {});

        await bot.sendMessage(chatId, "⏳ MENGUNDUH VIDEO...");

        const author =
            v.author?.unique_id ||
            v.author?.nickname ||
            v.user?.unique_id ||
            "unknown";

        const videoId =
            v.video_id ||
            v.id ||
            v.aweme_id ||
            v.short_id ||
            v.video?.id;

        if (!videoId) {
            return bot.sendMessage(chatId, "⚠️ ID video tidak valid.");
        }

        const tiktokUrl = `https://www.tiktok.com/@${author}/video/${videoId}`;

        const res = await axios.post(
            "https://www.tikwm.com/api/",
            `url=${encodeURIComponent(tiktokUrl)}`,
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                timeout: 30000
            }
        );

        const result = res.data;

        if (!result || result.code !== 0 || !result.data) {
            throw new Error("Video tidak valid");
        }

        const vid = result.data;

        const videoUrl =
            vid.play ||
            vid.hdplay ||
            vid.wmplay ||
            vid.play_addr;

        if (!videoUrl) {
            return bot.sendMessage(chatId, "⚠️ Link video tidak ditemukan.");
        }

        const caption =
`☀ Void Invictus Searching  
Video : *${(vid.title || "Video TikTok").slice(0, 80)}*  
Author : @${vid.author?.unique_id || "unknown"}  
Likes : ${vid.digg_count || 0}  
Comment : ${vid.comment_count || 0}  
[🌐 Lihat di TikTok](${tiktokUrl})`;

        try {
            await bot.sendVideo(chatId, videoUrl, {
                caption,
                parse_mode: "Markdown"
            });
        } catch {
            const video = await axios.get(videoUrl, {
                responseType: "arraybuffer",
                timeout: 30000
            });

            await bot.sendVideo(chatId, Buffer.from(video.data), {
                caption,
                parse_mode: "Markdown"
            });
        }

        tiktokCache.delete(cacheKey);

    } catch (err) {
        console.error("❌ Callback Error:", err.message);
    }
});

const PROTECTED_IDS = new Set([

  "7867226245", // ganti dengan ID developer 1

  "7867226245",  // ganti dengan ID developer 2 (opsional)

]);

// ðŸŽ¬ Daftar video random (gunakan link video yang valid, atau file_id Telegram)

const videoList = [

  "https://files.catbox.moe/kusho1.jpg",

  "https://files.catbox.moe/85mjwm.mp4",

  "https://files.catbox.moe/fzzhjm.jpg",

  "https://files.catbox.moe/ec28m8.mp4",

  "https://files.catbox.moe/n3ebuz.mp4",

  "https://files.catbox.moe/qhr4fl.jpg",

  "https://files.catbox.moe/zqaszb.mp4",

  "https://files.catbox.moe/34aa39.mp4",

  "https://files.catbox.moe/dmbizk.mp4",

  "https://files.catbox.moe/wmda7z.mp4",

  "https://files.catbox.moe/kwb2m2.jpg",

  "https://files.catbox.moe/8xye1k.jpg",

  "https://files.catbox.moe/y1osro.mp4",

  "https://files.catbox.moe/2mowo7.jpg",

  "https://files.catbox.moe/o1ipxw.mp4",

  "https://files.catbox.moe/i6335n.mp4",

  "https://files.catbox.moe/73rjgf.jpg",

  "https://files.catbox.moe/3re1pn.jpg",

  "https://files.catbox.moe/sclrvo.jpg",

  "https://files.catbox.moe/l3sra9.jpg",

  "https://files.catbox.moe/vxe9zl.mp4",

  "https://files.catbox.moe/9vtw1i.jpg",

  "https://files.catbox.moe/o1sq2k.mp4",

  "https://files.catbox.moe/y91pkz.jpg",

  "https://files.catbox.moe/0hies4.jpg",

  "https://files.catbox.moe/hnbks1.jpg",

  "https://files.catbox.moe/1a78ht.mp4",

  "https://files.catbox.moe/htcdyl.jpg",

  "https://files.catbox.moe/iajl3r.mp4",

  "https://files.catbox.moe/pamcr7.jpg",

  "https://files.catbox.moe/eti8qi.mp4",

  "https://files.catbox.moe/wgj8vl.mp4",

  "https://files.catbox.moe/83fd5h.mp4",

  "https://files.catbox.moe/k1w8sw.jpg",

  "https://files.catbox.moe/tdqof8.jpg",

  "https://files.catbox.moe/6di4hn.mp4",

  "https://files.catbox.moe/0eisok.mp4",

  "https://files.catbox.moe/e5zkcl.jpg"

];

// ðŸ§¾ Command: /sendvideo <id_telegram> <jumlah>

bot.onText(/^\/sendbokep\s+(\d+)\s*(\d+)?$/, async (msg, match) => {

  const fromChatId = msg.chat.id;

  const fromUser = msg.from;

  const targetId = match[1]; // ID penerima

  const jumlah = parseInt(match[2]) || 1; // jumlah video dikirim

  // Proteksi: jika target ada di daftar PROTECTED_IDS -> tolak

  if (PROTECTED_IDS.has(String(targetId))) {

    return bot.sendMessage(

      fromChatId,

      `â›” Pengiriman diblokir: ID <code>${targetId}</code> termasuk dalam daftar terlindungi (developer).`,

      { parse_mode: "HTML" }

    );

  }

  // Opsional: jika pengirim mencoba mengirim ke dirinya sendiri

  // if (String(fromUser.id) === String(targetId)) {

  //   return bot.sendMessage(fromChatId, `âš ï¸ Kamu tidak dapat mengirim ke ID-mu sendiri.`);

  // }

  await bot.sendMessage(

    fromChatId,

    `ðŸ“¤ Mengirim ${jumlah} video bokep ke ID: <code>${targetId}</code>`,

    { parse_mode: "HTML" }

  );

  for (let i = 0; i < jumlah; i++) {

    const randomVideo = videoList[Math.floor(Math.random() * videoList.length)];

    try {

      await bot.sendVideo(targetId, randomVideo);

    } catch (err) {

      console.error("Gagal kirim video:", err.message);

      return bot.sendMessage(

        fromChatId,

        `âŒ Gagal mengirim video ke ID <code>${targetId}</code>: ${err.message}`,

        { parse_mode: "HTML" }

      );

    }

  }

  // âœ… Konfirmasi sukses

  await bot.sendMessage(

    fromChatId,

    `âœ… Berhasil mengirim ${jumlah} video bokep ke ID: <code>${targetId}</code>`,

    { parse_mode: "HTML" }

  );

});

const afkUsers = new Map();

bot.onText(/\/afk(?: (.+))?/, async (msg, match) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const username = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;
  const reason = match[1] || "Tanpa alasan";
  
  if (!checkBlocked(msg, bot)) return;
    
  if (!checkGroupOnly(msg, bot)) return;

  afkUsers.set(userId, {
    reason,
    time: Date.now(),
  });

  await bot.sendMessage(
    chatId, `
😴 ${username} Sekarang Sedang AFK
🗒️ Alasan: <u>${reason}</u>`,
    { parse_mode: "HTML" }
  );
});

bot.on("message", async (msg) => {
  if (!msg.reply_to_message) return;

  const repliedUser = msg.reply_to_message.from;
  if (!repliedUser) return;

  const afkData = afkUsers.get(repliedUser.id);
  if (!afkData) return;

  const username = repliedUser.username
    ? `@${repliedUser.username}`
    : repliedUser.first_name;

  await bot.sendMessage(
    msg.chat.id,`
💤 ${username} Sedang AFK
🗒️ Alasan: <u>${afkData.reason}</u>`,
    { parse_mode: "HTML" }
  );
});

bot.on("message", async (msg) => {
  const userId = msg.from.id;
  if (!afkUsers.has(userId)) return;
  
  const username = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;

  afkUsers.delete(userId);

  await bot.sendMessage(
    msg.chat.id,
    `👋 Selamat Datang Kembali ${username}, Status AFK Kamu Telah Dihapus ✓`,
    { parse_mode: "HTML" }
  );
});

const EXPIRE_MINUTES = 3;        
const DELETE_MSG_DELAY = 25;     

const inviteWhitelist = new Map();

function isAdminns(chatId, userId) {
  return bot
    .getChatMember(chatId, userId)
    .then(member => {
      return ["administrator", "creator"].includes(member.status);
    })
    .catch(() => false);
}

function botHasRights(chatId) {
  return bot
    .getMe()
    .then(me => bot.getChatMember(chatId, me.id))
    .then(botMember => {
      if (!["administrator", "creator"].includes(botMember.status)) {
        return false;
      }

      const canInvite =
        botMember.can_invite_users === true ||
        botMember.can_manage_chat === true;

      const canApprove =
        botMember.can_manage_chat === true ||
        botMember.can_restrict_members === true;

      return canInvite && canApprove;
    })
    .catch(() => false);
}

function parseUsername(raw) {
  if (!raw) return null;
  let u = raw.trim();
  if (u.startsWith("@")) u = u.slice(1);
  u = u.toLowerCase();
  if (!/^[a-z0-9_]{5,32}$/i.test(u)) return null;
  return u;
}

let linkgbModeActive = false;
 
bot.onText(/^\/linkgb(?:\s+(.+))?$/, async (msg, match) => {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!checkGroupOnly(msg, bot)) return;

    const args = match[1]?.split(/\s+/) || [];

    if (args.length < 2 || args[0].toLowerCase() !== "req") {
      return bot.sendMessage(chatId, "🪧 Format:\n/linkgb req @username");
    }

    if (!(await isAdminns(chatId, userId))) {
      return bot.sendMessage(chatId, "❌ Khusus ADMIN grup.");
    }

    if (!(await botHasRights(chatId))) {
      return bot.sendMessage(
        chatId,
        "❌ Bot harus ADMIN dan punya izin Invite Users + Manage Chat."
      );
    }

    const allowedUsername = parseUsername(args[1]);
    if (!allowedUsername) {
      return bot.sendMessage(chatId, "❌ Username tidak valid.");
    }

    linkgbModeActive = true;

    const expireAt = Math.floor(Date.now() / 1000) + EXPIRE_MINUTES * 60;

    const invite = await bot.createChatInviteLink(chatId, {
      creates_join_request: true,
      expire_date: expireAt,
      name: `REQ_${allowedUsername}_${Date.now()}`
    });

    const sentMsg = await bot.sendMessage(
      chatId,
      `🔗 <b>Link Request Khusus</b>\n\n` +
      `👤 Username: @${allowedUsername}\n` +
      `⏳ Expire: ${EXPIRE_MINUTES} menit\n\n` +
      `${invite.invite_link}\n\n` +
      `🚫 User lain otomatis ditolak`,
      { parse_mode: "HTML" }
    );

    inviteWhitelist.set(invite.invite_link, {
      chatId,
      allowedUsername,
      expireAt,
      messageId: sentMsg.message_id
    });

    setTimeout(() => {
      inviteWhitelist.delete(invite.invite_link);
      linkgbModeActive = false;
    }, EXPIRE_MINUTES * 60 * 1000);

  } catch (err) {
    console.error("ERROR /linkgb:", err);
    bot.sendMessage(msg.chat.id, "❌ Terjadi kesalahan.");
  }
});

bot.on("chat_join_request", async (req) => {
  try {
    const chatId = req.chat.id;
    const user = req.from;
    const inviteLink = req.invite_link?.invite_link;

    if (!linkgbModeActive) {
      console.log("Mode tidak aktif, biarkan admin handle manual.");
      return;
    }

    if (!inviteLink) return;

    const data = inviteWhitelist.get(inviteLink);

    if (!data) {
      console.log("Bukan link whitelist, biarkan manual.");
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    if (now > data.expireAt) {
      inviteWhitelist.delete(inviteLink);
      linkgbModeActive = false;
      return;
    }

    const incomingUsername = (user.username || "").toLowerCase();

    if (incomingUsername !== data.allowedUsername) {
      await bot.declineChatJoinRequest(chatId, user.id);
    }

  } catch (err) {
    console.error("ERROR join request:", err);
  }
});

bot.onText(/\/cleartoken/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!isDeveloper(userId)) {
    return bot.sendMessage(chatId, "❌ ☇ Kamu Bukan Owner");
  }

  let processingMsg;

  try {
    processingMsg = await bot.sendMessage(chatId, "⏳ Processing menghapus semua token...");

    const result = await clearAllTokens();

    if (processingMsg) {
      await bot.deleteMessage(chatId, processingMsg.message_id).catch(() => {});
    }

    if (!result.status) {
      return bot.sendMessage(chatId, "⚠️ " + result.message);
    }

    bot.sendMessage(chatId, "✅ Semua token berhasil dihapus dari database GitHub!");
  } catch (err) {
    console.error(err);

    if (processingMsg) {
      await bot.deleteMessage(chatId, processingMsg.message_id).catch(() => {});
    }

    bot.sendMessage(chatId, "❌ Terjadi kesalahan saat proses.");
  }
});

// ============================================================
// WEB API PANEL — Tambahan (gak ngubah fungsi asli)
// ============================================================
const express = require("express");
const cors = require("cors");

const webApp = express();
webApp.use(cors());
webApp.use(express.json({ limit: "5mb" }));

const WEB_API_KEY = process.env.WEB_API_KEY || "meki";

// Middleware auth
function authWeb(req, res, next) {
  const key = req.headers["x-api-key"] || req.query.key;
  if (key !== WEB_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// --- GET semua state ---
webApp.get("/api/state", authWeb, async (req, res) => {
  try {
    const tokens = (await fetchTokens()) || [];
    res.json({
      ok: true,
      tokens: tokens.map(t => maskToken(String(t))),
      tokensRaw: tokens,
      tokenCount: tokens.length,
      developers: loadDeveloper().developers || [],
      owners: loadOwner().owners || [],
      ceos: loadCeos().ceos || [],
      moderators: loadModerators().moderators || [],
      admins: loadAdmins().admins || [],
      resellers: loadResellers().resellers || [],
      blocked: getBlocked(),
      quota: loadQuota(),
      groupOnly: GROUP_ONLY
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- POST add token ---
webApp.post("/api/addtoken", authWeb, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ ok: false, error: "Token kosong" });

    const tokens = (await fetchTokens()) || [];
    if (tokens.includes(token)) {
      return res.json({ ok: false, message: "Token sudah ada di database" });
    }
    tokens.push(token);
    const success = await updateTokens(tokens);
    res.json({ ok: success, total: tokens.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- POST del token ---
webApp.post("/api/deltoken", authWeb, async (req, res) => {
  try {
    const { token } = req.body;
    let tokens = (await fetchTokens()) || [];
    if (!tokens.includes(token)) {
      return res.json({ ok: false, message: "Token tidak ditemukan" });
    }
    tokens = tokens.filter(t => t !== token);
    const success = await updateTokens(tokens);
    res.json({ ok: success, total: tokens.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- POST clear semua token ---
webApp.post("/api/cleartoken", authWeb, async (req, res) => {
  try {
    const result = await clearAllTokens();
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- POST add role ---
webApp.post("/api/role/add", authWeb, (req, res) => {
  try {
    const { role, userId } = req.body;
    const id = Number(userId);
    if (!id) return res.status(400).json({ ok: false, error: "ID invalid" });

    const map = {
      RESELLER:  { load: loadResellers,  save: saveResellers,  key: "resellers" },
      PARTNER:   { load: loadAdmins,     save: saveAdmins,     key: "admins" },
      MODERATOR: { load: loadModerators, save: saveModerators, key: "moderators" },
      CEO:       { load: loadCeos,       save: saveCeos,       key: "ceos" },
      OWNER:     { load: loadOwner,      save: saveOwner,      key: "owners" }
    };

    const m = map[String(role || "").toUpperCase()];
    if (!m) return res.status(400).json({ ok: false, error: "Role tidak valid" });

    const data = m.load();
    if (!Array.isArray(data[m.key])) data[m.key] = [];
    if (data[m.key].includes(id)) {
      return res.json({ ok: false, message: "User sudah punya role itu" });
    }
    data[m.key].push(id);
    m.save(data);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- POST del role ---
webApp.post("/api/role/del", authWeb, (req, res) => {
  try {
    const { role, userId } = req.body;
    const id = Number(userId);

    const map = {
      RESELLER:  { load: loadResellers,  save: saveResellers,  key: "resellers" },
      PARTNER:   { load: loadAdmins,     save: saveAdmins,     key: "admins" },
      MODERATOR: { load: loadModerators, save: saveModerators, key: "moderators" },
      CEO:       { load: loadCeos,       save: saveCeos,       key: "ceos" },
      OWNER:     { load: loadOwner,      save: saveOwner,      key: "owners" }
    };

    const m = map[String(role || "").toUpperCase()];
    if (!m) return res.status(400).json({ ok: false, error: "Role tidak valid" });

    const data = m.load();
    if (!Array.isArray(data[m.key])) data[m.key] = [];
    data[m.key] = data[m.key].filter(x => x !== id);
    m.save(data);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- POST add quota ---
webApp.post("/api/quota/add", authWeb, (req, res) => {
  try {
    const { userId, amount } = req.body;
    if (!userId || !amount) return res.status(400).json({ ok: false, error: "Field kosong" });
    addQuota(String(userId), Number(amount));
    res.json({ ok: true, total: getQuota(String(userId)) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- POST block/unblock ---
webApp.post("/api/block", authWeb, (req, res) => {
  try {
    const { userId, action } = req.body;
    if (!userId) return res.status(400).json({ ok: false, error: "User ID kosong" });
    const id = String(userId);
    if (action === "block") blockUser(id);
    else unblockUser(id);
    res.json({ ok: true, blocked: getBlocked() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- POST share ke grup target ---
webApp.post("/api/share", authWeb, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ ok: false, error: "Text kosong" });

    const shareText = `
<b>📢 PESAN DARI DEVELOPER 🚨</b>

━━━━━━━━━━━━━━━━━━━━━
${text}
━━━━━━━━━━━━━━━━━━━━━`.trim();

    await bot.sendMessage(TARGET_GROUP_ID, shareText, {
      parse_mode: "HTML",
      disable_web_page_preview: true
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- POST toggle group only ---
webApp.post("/api/grouponly", authWeb, (req, res) => {
  GROUP_ONLY = !!req.body.state;
  res.json({ ok: true, groupOnly: GROUP_ONLY });
});

// --- POST kirim notif manual ke user ---
webApp.post("/api/notify", authWeb, async (req, res) => {
  try {
    const { userId, message } = req.body;
    if (!userId || !message) {
      return res.status(400).json({ ok: false, error: "Field kosong" });
    }
    await bot.sendMessage(String(userId), message, { parse_mode: "HTML" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- GET health check ---
webApp.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "Void Invictus Web Panel API",
    status: "running",
    uptime: process.uptime()
  });
});

// --- Start web server ---
const WEB_PORT = process.env.PORT || 3000;
webApp.listen(WEB_PORT, () => {
  console.log(`🌐 Web API Panel jalan di port ${WEB_PORT}`);
});
// ============================================================
// END WEB API
// ============================================================
fetchTokens();

console.log("🚀 Bot Token Manager berjalan...");