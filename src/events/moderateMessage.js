const { getGuild } = require('../services/store');

const urlPattern = /https?:\/\/\S+/i;
module.exports = async message => {
  if (!message.guild || message.author.bot || !message.member) return;
  const settings = await getGuild(message.guild.id);
  if (!settings.linkFilter || !urlPattern.test(message.content) || message.member.permissions.has('ManageMessages')) return;
  if (message.deletable) await message.delete();
  const notice = await message.channel.send(`${message.author}, links are not permitted in this channel.`).catch(() => null);
  if (notice) setTimeout(() => notice.delete().catch(() => {}), 5000);
};
