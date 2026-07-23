const { getGuild } = require('../services/store');
const { nymeraEmbed } = require('../lib/theme');
const { audit } = require('../services/logging');

module.exports = async member => {
  const settings = await getGuild(member.guild.id);
  const channel = settings.goodbyeChannelId && member.guild.channels.cache.get(settings.goodbyeChannelId);
  if (channel?.isTextBased()) await channel.send({ embeds: [nymeraEmbed('A Shadow Departs', `${member.user.username} has faded beyond the veil. May the path ahead be gentle.`)] });
  await audit(member.guild, 'Member Left', `${member.user.username} left the server.`);
};
