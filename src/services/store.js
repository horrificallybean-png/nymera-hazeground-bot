const fs = require('node:fs/promises');
const path = require('node:path');

// Set DATA_DIR=/app/data on Railway after mounting a persistent volume there.
const directory = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const file = path.join(directory, 'nymera-data.json');
const data = { users: {}, guilds: {}, warnings: {}, transactions: [], giveaways: {}, invites: {}, audit: [] };
let loaded = false;

async function load() {
  if (loaded) return;
  await fs.mkdir(directory, { recursive: true });
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
    Object.assign(data, parsed);
    data.users ||= {};
    data.guilds ||= {};
    data.warnings ||= {};
    data.transactions ||= [];
    data.giveaways ||= {};
    data.invites ||= {};
    data.audit ||= [];
  }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  loaded = true;
}

async function save() {
  await load();
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

function key(guildId, userId) { return `${guildId}:${userId}`; }

async function getUser(guildId, userId) {
  await load();
  const userKey = key(guildId, userId);
  if (!data.users[userKey]) {
    data.users[userKey] = { guildId, userId, spellmarks: 0, xp: 0, level: 1, reputation: 0, lastDailyAt: null, lastWeeklyAt: null, lastMonthlyAt: null, lastRepAt: null, lastXpAt: null, streak: 0, inventory: [] };
    await save();
  }
  return data.users[userKey];
}

async function getGuild(guildId) {
  await load();
  const defaults = { welcomeChannelId: null, goodbyeChannelId: null, activityChannelId: null, levelChannelId: null, levelRewards: [], deadChat: { channelId: null, roleId: null, idleHours: 12, lastHumanMessageAt: null, lastRevivalAt: null }, verification: { channelId: null, roleId: null }, shop: [], logChannelId: null, linkFilter: false, lastActivityDate: null, lastEventAt: null };
  if (!data.guilds[guildId]) data.guilds[guildId] = defaults;
  else Object.assign(data.guilds[guildId], defaults, data.guilds[guildId]);
  data.guilds[guildId].deadChat ||= { ...defaults.deadChat };
  return data.guilds[guildId];
}

module.exports = { data, getUser, getGuild, save };
