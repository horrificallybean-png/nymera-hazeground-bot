const User = require('../models/User');
const Guild = require('../models/Guild');

const DEFAULT_SETTINGS = {
  welcomeChannelId: null, goodbyeChannelId: null, activityChannelId: null,
  levelChannelId: null, logChannelId: null, linkFilter: false,
  verification: { channelId: null, roleId: null }, levelRewards: []
};

async function getUser(guildId, userId) {
  return User.findOneAndUpdate(
    { guildId, userId },
    { $setOnInsert: { guildId, userId } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function getGuild(guildId) {
  return Guild.findOneAndUpdate(
    { guildId },
    { $setOnInsert: { guildId, settings: DEFAULT_SETTINGS } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function addSpellmarks(guildId, userId, amount) {
  return User.findOneAndUpdate({ guildId, userId }, { $inc: { spellmarks: amount }, $setOnInsert: { guildId, userId } }, { upsert: true, new: true });
}

module.exports = { getUser, getGuild, addSpellmarks };
