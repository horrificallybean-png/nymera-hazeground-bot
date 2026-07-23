const { Schema, model } = require('mongoose');
const giveawaySchema = new Schema({ guildId: { type: String, index: true }, channelId: String, messageId: String, prize: String, endsAt: Date, hostId: String, entries: { type: [String], default: [] }, requirements: { type: Schema.Types.Mixed, default: {} }, ended: { type: Boolean, default: false }, winnerId: String }, { timestamps: true });
module.exports = model('Giveaway', giveawaySchema);
