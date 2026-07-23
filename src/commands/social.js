const { SlashCommandBuilder } = require('discord.js');
const { getUser } = require('../services/economy');
const { save, data, getGuild } = require('../services/store');
const { nymeraEmbed, COLORS } = require('../lib/theme');

const prophecies = [
  'A silver thread will lead you through tonight’s uncertainty.',
  'Beware the door that opens too easily; wisdom prefers patience.',
  'Your kindness will echo where you least expect it.',
  'The stars favor a daring beginning—take the first step.'
];

module.exports = [
  {
    data: new SlashCommandBuilder().setName('profile').setDescription('View your Hazeground profile.').addUserOption(option => option.setName('member').setDescription('A member to inspect')),
    async execute(interaction) {
      const member = interaction.options.getUser('member') || interaction.user;
      const user = await getUser(interaction.guildId, member.id);
      await interaction.reply({ embeds: [nymeraEmbed(`${member.username}'s Chronicle`, `Level **${user.level}** • **${user.xp} XP**\n**${user.spellmarks.toLocaleString()}** Spellmarks • **${user.streak}** day streak\nReputation: **${user.reputation || 0}**`)] });
    }
  },
  {
    data: new SlashCommandBuilder().setName('prophecy').setDescription('Receive a message from the veil.'),
    async execute(interaction) {
      const prophecy = prophecies[Math.floor(Math.random() * prophecies.length)];
      await interaction.reply({ embeds: [nymeraEmbed('A Whispered Prophecy', prophecy)] });
    }
  }
  ,{
    data: new SlashCommandBuilder().setName('rank').setDescription('Display a member’s level record.').addUserOption(option => option.setName('member').setDescription('Member to inspect')),
    async execute(interaction) {
      const member = interaction.options.getUser('member') || interaction.user; const user = await getUser(interaction.guildId, member.id); const needed = user.level * 100;
      await interaction.reply({ embeds: [nymeraEmbed(`${member.username}'s Rank`, `**Level ${user.level}**\n${user.xp}/${needed} XP toward the next threshold.`)] });
    }
  },
  {
    data: new SlashCommandBuilder().setName('levels').setDescription('View the server XP leaderboard.'),
    async execute(interaction) {
      await getGuild(interaction.guildId); const entries = Object.values(data.users).filter(user => user.guildId === interaction.guildId).sort((a, b) => b.level - a.level || b.xp - a.xp).slice(0, 10);
      const list = entries.length ? entries.map((user, i) => `**${i + 1}.** <@${user.userId}> — Level ${user.level} (${user.xp} XP)`).join('\n') : 'The chronicles are empty.';
      await interaction.reply({ embeds: [nymeraEmbed('Level Chronicle', list)] });
    }
  },
  {
    data: new SlashCommandBuilder().setName('rep').setDescription('Give reputation to a member.').addUserOption(option => option.setName('member').setDescription('Member to honor').setRequired(true)),
    async execute(interaction) {
      const target = interaction.options.getUser('member'); if (target.bot || target.id === interaction.user.id) return interaction.reply({ content: 'The veil refuses that tribute.', ephemeral: true });
      const giver = await getUser(interaction.guildId, interaction.user.id); const now = Date.now(); const cooldown = 86400000;
      if (giver.lastRepAt && now - new Date(giver.lastRepAt) < cooldown) return interaction.reply({ content: 'Your gratitude must rest until tomorrow.', ephemeral: true });
      const receiver = await getUser(interaction.guildId, target.id); giver.lastRepAt = new Date().toISOString(); receiver.reputation = (receiver.reputation || 0) + 1; await save();
      await interaction.reply({ embeds: [nymeraEmbed('A Favor Remembered', `${interaction.user} grants reputation to ${target}.`, COLORS.green)] });
    }
  },
  {
    data: new SlashCommandBuilder().setName('reputation').setDescription('View a member’s reputation.').addUserOption(option => option.setName('member').setDescription('Member to inspect')),
    async execute(interaction) { const member = interaction.options.getUser('member') || interaction.user; const user = await getUser(interaction.guildId, member.id); await interaction.reply({ embeds: [nymeraEmbed('Reputation', `${member} carries **${user.reputation || 0}** favor(s) in the realm.`)] }); }
  },
  {
    data: new SlashCommandBuilder().setName('streak').setDescription('View your daily login streak.'),
    async execute(interaction) { const user = await getUser(interaction.guildId, interaction.user.id); await interaction.reply({ embeds: [nymeraEmbed('Devotion Streak', `You have returned for **${user.streak}** consecutive daily blessing(s).`)] }); }
  },
  {
    data: new SlashCommandBuilder().setName('fortune').setDescription('Receive a short fortune from Nymera.'),
    async execute(interaction) { const fortunes = ['A forgotten door is about to open.', 'Trust the friend who tells you an uncomfortable truth.', 'Tonight’s smallest kindness will become a lasting bond.']; await interaction.reply({ embeds: [nymeraEmbed('A Fortune in Ash', fortunes[Math.floor(Math.random() * fortunes.length)])] }); }
  },
  {
    data: new SlashCommandBuilder().setName('lore').setDescription('Read a fragment of Spellbound lore.'),
    async execute(interaction) { await interaction.reply({ embeds: [nymeraEmbed('The First Vigil', 'When the neon moon first stained the fog violet, Nymera swore to keep the Hazeground from devouring those who called it home.')] }); }
  }
];
