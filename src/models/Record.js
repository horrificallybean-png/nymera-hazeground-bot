const { Schema, model } = require('mongoose');
const recordSchema = new Schema({ guildId: { type: String, index: true }, type: { type: String, index: true }, actorId: String, targetId: String, data: Schema.Types.Mixed }, { timestamps: true });
module.exports = model('Record', recordSchema);
