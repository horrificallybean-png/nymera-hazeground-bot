const { getGuild, data, save } = require('../services/store');
const { nymeraEmbed } = require('../lib/theme');
const { audit } = require('../services/logging');

module.exports = async member => {
  const settings = await getGuild(member.guild.id);
  const channel = settings.welcomeChannelId && member.guild.channels.cache.get(settings.welcomeChannelId);
  if (channel?.isTextBased()) await channel.send({ embeds: [nymeraEmbed('A New Soul Arrives', `Welcome, ${member}. The Hazeground watches kindly. Seek `/help` when the mist confuses you.`)] });
  const invites = await member.guild.invites.fetch().catch(() => null);
  const previous = member.client.inviteCache?.get(member.guild.id) || new Map();
  if (invites) {
    const used = invites.find(invite => (invite.uses || 0) > (previous.get(invite.code) || 0));
    member.client.inviteCache.set(member.guild.id, new Map(invites.map(invite => [invite.code, invite.uses || 0])));
    if (used?.inviter) {
      const key = `${member.guild.id}:${used.inviter.id}`;
      data.invites[key] ||= { guildId: member.guild.id, userId: used.inviter.id, count: 0 };
      data.invites[key].count += 1; await save();
      await audit(member.guild, 'Invite Attributed', `${member} joined using an invite by ${used.inviter}.`);
    }
  }
  await audit(member.guild, 'Member Joined', `${member} joined the server.`);
};
