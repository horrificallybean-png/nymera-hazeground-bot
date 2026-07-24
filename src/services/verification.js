const Guild = require('../models/Guild');

async function getVerification(guildId) {
  const guild = await Guild.findOne({ guildId }).lean();
  return guild?.settings?.verification || { channelId: null, roleId: null };
}

async function setVerification(guildId, verification) {
  await Guild.findOneAndUpdate(
    { guildId },
    { $set: { guildId, 'settings.verification': verification } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

module.exports = { getVerification, setVerification };
