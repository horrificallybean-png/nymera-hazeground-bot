const { Schema, model } = require('mongoose');
const conversationSchema = new Schema({ guildId: { type: String, index: true }, userId: { type: String, index: true }, messages: { type: [{ role: String, content: String, at: Date }], default: [] } }, { timestamps: true });
conversationSchema.index({ guildId: 1, userId: 1 }, { unique: true });
module.exports = model('Conversation', conversationSchema);
