const { SlashCommandBuilder } = require('discord.js');
const { getUser, awardSpellmarks } = require('../services/economy');
const { save } = require('../services/store');
const { nymeraEmbed, COLORS } = require('../lib/theme');

module.exports = [
  {
    data: new SlashCommandBuilder().setName('balance').setDescription('Reveal your Spellmark balance.'),
    async execute(interaction) {
      const user = await getUser(interaction.guildId, interaction.user.id);
      await interaction.reply({ embeds: [nymeraEmbed('Your Spellmarks', `You hold **${user.spellmarks.toLocaleString()}** Spellmarks in the moonlit vault.`, COLORS.green)], ephemeral: true });
    }
  },
  {
    data: new SlashCommandBuilder().setName('daily').setDescription('Claim today’s Spellmark blessing.'),
    async execute(interaction) {
      const user = await getUser(interaction.guildId, interaction.user.id);
      const now = Date.now();
      const cooldown = 24 * 60 * 60 * 1000;
      if (user.lastDailyAt && now - user.lastDailyAt.getTime() < cooldown) {
        const seconds = Math.ceil((cooldown - (now - user.lastDailyAt.getTime())) / 1000);
        return interaction.reply({ content: `The veil has not yet lifted. Return <t:${Math.floor((now + seconds * 1000) / 1000)}:R>.`, ephemeral: true });
      }
      const reward = 150;
      await awardSpellmarks(interaction.guildId, interaction.user.id, reward, 'Daily blessing');
      user.lastDailyAt = new Date();
      user.streak += 1;
      await save();
      await interaction.reply({ embeds: [nymeraEmbed('Daily Blessing', `The shadows bestow **${reward} Spellmarks**. Your devotion burns for **${user.streak}** day(s).`, COLORS.green)] });
    }
  }
  ,{
    data: new SlashCommandBuilder().setName('work').setDescription('Perform a task for the Hazeground.'),
    async execute(interaction) {
      const reward = 35 + Math.floor(Math.random() * 66);
      await awardSpellmarks(interaction.guildId, interaction.user.id, reward, 'Work reward');
      await interaction.reply({ embeds: [nymeraEmbed('A Worthy Task', `Your efforts earn **${reward} Spellmarks**. The realm takes notice.`, COLORS.green)] });
    }
  },
  {
    data: new SlashCommandBuilder().setName('hunt').setDescription('Hunt through the mist for a reward.'),
    async execute(interaction) {
      const reward = 10 + Math.floor(Math.random() * 141);
      await awardSpellmarks(interaction.guildId, interaction.user.id, reward, 'Hunt reward');
      await interaction.reply({ embeds: [nymeraEmbed('Mistward Hunt', `You return from the haze with **${reward} Spellmarks**.`, COLORS.green)] });
    }
  },
  {
    data: new SlashCommandBuilder().setName('leaderboard').setDescription('View the richest souls in the realm.'),
    async execute(interaction) {
      const { data, getGuild } = require('../services/store');
      await getGuild(interaction.guildId);
      const entries = Object.values(data.users).filter(user => user.guildId === interaction.guildId).sort((a, b) => b.spellmarks - a.spellmarks).slice(0, 10);
      const lines = entries.length ? entries.map((user, index) => `**${index + 1}.** <@${user.userId}> — ${user.spellmarks.toLocaleString()} Spellmarks`).join('\n') : 'No fortunes have yet been claimed.';
      await interaction.reply({ embeds: [nymeraEmbed('Spellmark Ledger', lines)] });
    }
  }
  ,{
    data: new SlashCommandBuilder().setName('weekly').setDescription('Claim the weekly Spellmark blessing.'),
    async execute(interaction) {
      const user = await getUser(interaction.guildId, interaction.user.id); const now = Date.now(); const cooldown = 7 * 86400000;
      if (user.lastWeeklyAt && now - new Date(user.lastWeeklyAt) < cooldown) return interaction.reply({ content: `Return <t:${Math.floor((new Date(user.lastWeeklyAt).getTime() + cooldown) / 1000)}:R>.`, ephemeral: true });
      user.lastWeeklyAt = new Date().toISOString(); await awardSpellmarks(interaction.guildId, interaction.user.id, 750, 'Weekly blessing');
      await interaction.reply({ embeds: [nymeraEmbed('Weekly Blessing', 'The moon grants **750 Spellmarks**.', COLORS.green)] });
    }
  },
  {
    data: new SlashCommandBuilder().setName('monthly').setDescription('Claim the monthly Spellmark blessing.'),
    async execute(interaction) {
      const user = await getUser(interaction.guildId, interaction.user.id); const now = Date.now(); const cooldown = 30 * 86400000;
      if (user.lastMonthlyAt && now - new Date(user.lastMonthlyAt) < cooldown) return interaction.reply({ content: `Return <t:${Math.floor((new Date(user.lastMonthlyAt).getTime() + cooldown) / 1000)}:R>.`, ephemeral: true });
      user.lastMonthlyAt = new Date().toISOString(); await awardSpellmarks(interaction.guildId, interaction.user.id, 2500, 'Monthly blessing');
      await interaction.reply({ embeds: [nymeraEmbed('Monthly Blessing', 'The ancient vault opens: **2,500 Spellmarks** are yours.', COLORS.green)] });
    }
  },
  {
    data: new SlashCommandBuilder().setName('explore').setDescription('Explore a haunted corner of the realm.'),
    async execute(interaction) {
      const places = ['the Moonless Catacombs', 'the Violet Marsh', 'the Neon Graveyard', 'the Whispering Archive']; const reward = 25 + Math.floor(Math.random() * 176);
      await awardSpellmarks(interaction.guildId, interaction.user.id, reward, 'Exploration reward');
      await interaction.reply({ embeds: [nymeraEmbed('Beyond the Threshold', `You explore **${places[Math.floor(Math.random() * places.length)]}** and recover **${reward} Spellmarks**.`, COLORS.green)] });
    }
  },
  {
    data: new SlashCommandBuilder().setName('gift').setDescription('Gift Spellmarks to another member.').addUserOption(option => option.setName('member').setDescription('Recipient').setRequired(true)).addIntegerOption(option => option.setName('amount').setDescription('Spellmarks to send').setMinValue(1).setRequired(true)),
    async execute(interaction) {
      const recipient = interaction.options.getUser('member'); const amount = interaction.options.getInteger('amount'); const sender = await getUser(interaction.guildId, interaction.user.id);
      if (recipient.bot || recipient.id === interaction.user.id) return interaction.reply({ content: 'The vault rejects that offering.', ephemeral: true });
      if (sender.spellmarks < amount) return interaction.reply({ content: 'Your vault does not hold enough Spellmarks.', ephemeral: true });
      sender.spellmarks -= amount; await awardSpellmarks(interaction.guildId, recipient.id, amount, `Gift from ${interaction.user.id}`); const { save } = require('../services/store'); await save();
      await interaction.reply({ embeds: [nymeraEmbed('A Gift Through the Veil', `${interaction.user} sends **${amount} Spellmarks** to ${recipient}.`, COLORS.green)] });
    }
  }
];
