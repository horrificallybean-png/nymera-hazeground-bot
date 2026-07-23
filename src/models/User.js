const { Schema, model } = require('mongoose');
const userSchema = new Schema({ guildId: { type: String, index: true }, userId: { type: String, index: true }, spellmarks: { type: Number, default: 0 }, xp: { type: Number, default: 0 }, level: { type: Number, default: 1 }, reputation: { type: Number, default: 0 }, inventory: { type: [String], default: [] }, cooldowns: { type: Map, of: Date, default: {} } }, { timestamps: true });
userSchema.index({ guildId: 1, userId: 1 }, { unique: true });
module.exports = model('User', userSchema);
