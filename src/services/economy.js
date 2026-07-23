const { data, getUser, save } = require('./store');

async function awardSpellmarks(guildId, userId, amount, reason) {
  const user = await getUser(guildId, userId);
  user.spellmarks += amount;
  data.transactions.push({ guildId, userId, amount, reason, createdAt: new Date().toISOString() });
  await save();
  return user;
}

module.exports = { getUser, awardSpellmarks };
