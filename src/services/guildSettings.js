const Guild = require('../models/Guild');

const DEFAULT_SETTINGS = {
  welcomeChannelId: null,
  goodbyeChannelId: null,
  activityChannelId: null,
  levelChannelId: null,
  logChannelId: null,
  linkFilter: false,
  lastActivityDate: null,
  lastEventAt: null,
  verification: { channelId: null, roleId: null },
  deadChat: { channelId: null, roleId: null, idleHours: 12, lastHumanMessageAt: null, lastRevivalAt: null }
};

function normalize(settings = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    verification: { ...DEFAULT_SETTINGS.verification, ...(settings.verification || {}) },
    deadChat: { ...DEFAULT_SETTINGS.deadChat, ...(settings.deadChat || {}) }
  };
}

async function getGuildSettings(guildId) {
  const guild = await Guild.findOne({ guildId }).lean();
  return normalize(guild?.settings);
}

async function updateGuildSettings(guildId, patch) {
  const current = await getGuildSettings(guildId);
  const settings = normalize({
    ...current,
    ...patch,
    deadChat: patch.deadChat ? { ...current.deadChat, ...patch.deadChat } : current.deadChat,
    verification: patch.verification ? { ...current.verification, ...patch.verification } : current.verification
  });
  await Guild.findOneAndUpdate({ guildId }, { $set: { guildId, settings } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  return settings;
}

module.exports = { getGuildSettings, updateGuildSettings };
