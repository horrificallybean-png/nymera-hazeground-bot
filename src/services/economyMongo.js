const { getUser, addSpellmarks } = require('./mongoStore');
const Record = require('../models/Record');

async function award(guildId, userId, amount, reason, actorId = null) {
  const user = await addSpellmarks(guildId, userId, amount);
  await Record.create({ guildId, type: 'economy', actorId, targetId: userId, data: { amount, reason, balance: user.spellmarks } });
  return user;
}

async function transfer(guildId, fromId, toId, amount) {
  const sender = await getUser(guildId, fromId);
  if (sender.spellmarks < amount) throw new Error('Insufficient Spellmarks.');
  sender.spellmarks -= amount;
  await sender.save();
  await award(guildId, toId, amount, 'Member gift', fromId);
  await Record.create({ guildId, type: 'economy_transfer', actorId: fromId, targetId: toId, data: { amount } });
  return sender;
}

module.exports = { award, transfer };
