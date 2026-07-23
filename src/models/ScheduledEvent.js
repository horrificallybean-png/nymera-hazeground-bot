const { Schema, model } = require('mongoose');
const scheduledEventSchema = new Schema({ guildId: { type: String, index: true }, channelId: String, type: String, enabled: { type: Boolean, default: true }, cron: String, timezone: String, roleId: String, lastRunAt: Date, nextRunAt: { type: Date, index: true }, settings: { type: Schema.Types.Mixed, default: {} } }, { timestamps: true });
module.exports = model('ScheduledEvent', scheduledEventSchema);
