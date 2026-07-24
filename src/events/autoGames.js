const { awardSpellmarks } = require('../services/economy');
module.exports = async message => {
  const game = message.client.autoGames?.get(message.channelId);
  if (!game || message.author.bot) return;
  const answer = message.content.trim().toLowerCase();
  if ((game.type === 'word' && answer !== game.answer) || (game.type === 'number' && Number(answer) !== game.answer)) return;
  message.client.autoGames.delete(message.channelId);
  await awardSpellmarks(message.guild.id, message.author.id, game.reward, `Automatic ${game.type} game`);
  await message.channel.send(`✦ ${message.author} solved Nymera’s ${game.type} game and earns **${game.reward} Spellmarks**!`);
};
