const { Schema, model } = require('mongoose');
const guildSchema = new Schema({ guildId: { type: String, unique: true }, settings: { type: Schema.Types.Mixed, default: {} }, shop: { type: [Schema.Types.Mixed], default: [] }, levelRewards: { type: [Schema.Types.Mixed], default: [] } }, { timestamps: true });
module.exports = model('Guild', guildSchema);
