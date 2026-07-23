const { Schema, model } = require('mongoose');
const ticketSchema = new Schema({ guildId: { type: String, index: true }, channelId: { type: String, unique: true }, openerId: String, claimedBy: String, category: String, status: { type: String, default: 'open', index: true }, transcript: String }, { timestamps: true });
module.exports = model('Ticket', ticketSchema);
