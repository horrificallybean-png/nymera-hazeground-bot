const { getGuildSettings, updateGuildSettings } = require('./guildSettings');
const { nymeraEmbed, COLORS } = require('../lib/theme');
const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');

const prophecies = [
  'A moonlit kindness will alter the shape of your week.',
  'The path through the fog is not the safest—only the truest.',
  'A hidden reward waits for the first soul brave enough to speak.',
  'Tonight, the old walls remember every promise made within them.'
];
const questions = [
  'What game should Nymera summon for the community tonight?',
  'Which corner of Spellbound Hazeground holds the best story?',
  'What title would you earn after one night in the Haze?',
  'What small victory deserves to be celebrated today?'
];

async function postDailyActivity(client) {
  const today = new Date().toISOString().slice(0, 10);
  for (const guild of client.guilds.cache.values()) {
    const settings = await getGuildSettings(guild.id);
    if (!settings.activityChannelId || settings.lastActivityDate === today) continue;
    const channel = guild.channels.cache.get(settings.activityChannelId);
    if (!channel?.isTextBased()) continue;
    const prophecy = prophecies[Math.floor(Math.random() * prophecies.length)];
    const question = questions[Math.floor(Math.random() * questions.length)];
    await channel.send({ embeds: [nymeraEmbed('Daily Prophecy', prophecy)] }).catch(() => {});
    await channel.send({ embeds: [nymeraEmbed('A Question from the Veil', question, COLORS.green)] }).catch(() => {});
    await updateGuildSettings(guild.id, { lastActivityDate: today });
  }
}

async function postRandomEvent(client) {
  for (const guild of client.guilds.cache.values()) {
    const settings = await getGuildSettings(guild.id);
    if (!settings.activityChannelId || (settings.lastEventAt && Date.now() - new Date(settings.lastEventAt) < 6 * 60 * 60 * 1000)) continue;
    const channel = guild.channels.cache.get(settings.activityChannelId);
    if (!channel?.isTextBased()) continue;
    const reward = 50 + Math.floor(Math.random() * 151);
    await channel.send({ embeds: [nymeraEmbed('A Treasure Stirs', `The mist reveals a communal treasure of **${reward} Spellmarks**. The first member to use `/hunt` may claim the glory.`, COLORS.green)] }).catch(() => {});
    await updateGuildSettings(guild.id, { lastEventAt: new Date().toISOString() });
  }
}

async function reviveQuietChats(client) {
  const prompts = [
    'The Haze has grown quiet. What is one small thing that made you smile today?',
    'A lantern flickers in the empty hall. Which game should Nymera summon next?',
    'The archives crave a confession: what gothic tale, game, or film has been haunting you lately?',
    'The moon is listening. Share a song that belongs on a Spellbound playlist.'
  ];
  for (const guild of client.guilds.cache.values()) {
    const settings = await getGuildSettings(guild.id);
    const deadChat = settings.deadChat;
    if (!deadChat?.channelId || !deadChat.lastHumanMessageAt) continue;
    const idleFor = Date.now() - new Date(deadChat.lastHumanMessageAt).getTime();
    const cooldown = 24 * 60 * 60 * 1000;
    if (idleFor < deadChat.idleHours * 60 * 60 * 1000 || (deadChat.lastRevivalAt && Date.now() - new Date(deadChat.lastRevivalAt).getTime() < cooldown)) continue;
    const channel = guild.channels.cache.get(deadChat.channelId);
    if (!channel?.isTextBased()) continue;
    const roleMention = deadChat.roleId ? `<@&${deadChat.roleId}> ` : '';
    await channel.send({ content: roleMention || undefined, embeds: [nymeraEmbed('The Haze Stirs', prompts[Math.floor(Math.random() * prompts.length)], COLORS.green)], allowedMentions: deadChat.roleId ? { roles: [deadChat.roleId] } : { parse: [] } }).catch(() => {});
    await updateGuildSettings(guild.id, { deadChat: { lastRevivalAt: new Date().toISOString() } });
  }
}

function startActivity(client) {
  postDailyActivity(client).catch(console.error);
  postAutoGame(client).catch(console.error);
  setInterval(() => postDailyActivity(client).catch(console.error), 60 * 60 * 1000);
  setInterval(() => postRandomEvent(client).catch(console.error), 60 * 60 * 1000);
  setInterval(() => reviveQuietChats(client).catch(console.error), 15 * 60 * 1000);
  setInterval(() => postAutoGame(client).catch(console.error), 2 * 60 * 60 * 1000);
}

async function postAutoGame(client, onlyGuildId = null) {
  let sent = 0;
  for (const guild of client.guilds.cache.values()) {
    if (onlyGuildId && guild.id !== onlyGuildId) continue;
    const settings = await getGuildSettings(guild.id);
    const channel = settings.activityChannelId && guild.channels.cache.get(settings.activityChannelId);
    if (!channel?.isTextBased()) {
      const reason = `No usable activity channel is configured for ${guild.name}.`;
      if (onlyGuildId) throw new Error(reason);
      console.warn(reason);
      continue;
    }
    client.autoGames ||= new Map();
    const reward = 40 + Math.floor(Math.random() * 61);
    const roll = Math.random();
    const kind = roll < 1 / 3 ? 'word' : roll < 2 / 3 ? 'number' : 'treasure';
    if (kind === 'word') {
      const games = [{ scrambled: 'LLEPS', answer: 'spell' }, { scrambled: 'NOMDO', answer: 'moon' }, { scrambled: 'NEVAR', answer: 'raven' }]; const game = games[Math.floor(Math.random() * games.length)];
      client.autoGames.set(channel.id, { type: 'word', answer: game.answer, reward });
      await channel.send({ embeds: [nymeraEmbed('Unscramble the Spell', `First to solve **${game.scrambled}** earns **${reward} Spellmarks**!`, COLORS.green)] }); sent += 1; continue;
    }
    if (kind === 'number') {
      const answer = 1 + Math.floor(Math.random() * 20);
      client.autoGames.set(channel.id, { type: 'number', answer, reward });
      await channel.send({ embeds: [nymeraEmbed('Ghost Count', `Nymera has chosen a number from **1–20**. First correct guess earns **${reward} Spellmarks**!`, COLORS.green)] });
      sent += 1;
      continue;
    }
    
    const id = `${guild.id}:${Date.now()}:${reward}`;
    const button = new ButtonBuilder().setCustomId(`autogame:${id}`).setLabel('Claim the treasure').setStyle(ButtonStyle.Primary);
    await channel.send({ embeds: [nymeraEmbed('A Treasure Drop', `A forgotten satchel rises from the fog. First to claim it earns **${reward} Spellmarks**!`, COLORS.green)], components: [new ActionRowBuilder().addComponents(button)] });
    sent += 1;
  }
  return sent;
}

module.exports = { startActivity, postAutoGame };
