const { getUser, save } = require('../services/store');
const { getGuild } = require('../services/store');
const { getGuildSettings, updateGuildSettings } = require('../services/guildSettings');

const XP_COOLDOWN = 60_000;
module.exports = async message => {
  if (!message.guild || message.author.bot || message.content.length < 3) return;
  const now = new Date();
  const persistentSettings = await getGuildSettings(message.guild.id);
  await updateGuildSettings(message.guild.id, { deadChat: { lastHumanMessageAt: now.toISOString() } });
  const settings = await getGuild(message.guild.id);
  settings.levelChannelId ||= persistentSettings.levelChannelId;
  const user = await getUser(message.guild.id, message.author.id);
  if (user.lastXpAt && now - new Date(user.lastXpAt) < XP_COOLDOWN) return;
  user.lastXpAt = now;
  user.xp += 10;
  const needed = user.level * 100;
  if (user.xp >= needed) {
    user.xp -= needed;
    user.level += 1;
    const announcementChannel = settings.levelChannelId ? message.guild.channels.cache.get(settings.levelChannelId) : message.channel;
    if (announcementChannel?.isTextBased()) await announcementChannel.send(`✦ ${message.author}, the veil recognizes your growth. You have reached **Level ${user.level}**.`);
    for (const reward of settings.levelRewards.filter(entry => entry.level <= user.level)) {
      const role = message.guild.roles.cache.get(reward.roleId);
      if (role?.editable && !message.member.roles.cache.has(role.id)) await message.member.roles.add(role, `Reached Nymera level ${user.level}`).catch(() => {});
    }
  }
  await save();
};
