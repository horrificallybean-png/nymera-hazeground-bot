const Conversation = require('../models/Conversation');
async function history(guildId, userId) { const c = await Conversation.findOneAndUpdate({ guildId, userId }, { $setOnInsert: { guildId, userId } }, { upsert: true, new: true }); return c.messages.slice(-12); }
async function append(guildId, userId, role, content) { const c = await Conversation.findOneAndUpdate({ guildId, userId }, { $push: { messages: { $each: [{ role, content, at: new Date() }], $slice: -20 } } }, { upsert: true, new: true }); return c; }
module.exports = { history, append };
