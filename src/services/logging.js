const { getGuild, data, save } = require('./store');
const { nymeraEmbed, COLORS } = require('../lib/theme');

async function audit(guild, title, detail) {
  const entry = { guildId: guild.id, title, detail, at: new Date().toISOString() };
  data.audit.push(entry); if (data.audit.length > 500) data.audit.shift(); await save();
  const settings = await getGuild(guild.id); const channel = settings.logChannelId && guild.channels.cache.get(settings.logChannelId);
  if (channel?.isTextBased()) await channel.send({ embeds: [nymeraEmbed(title, detail, COLORS.danger)] }).catch(() => {});
}
module.exports = { audit };
