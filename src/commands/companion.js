const { SlashCommandBuilder } = require('discord.js');
const { nymeraEmbed } = require('../lib/theme');
const { respond, aiEnabled } = require('../services/ai');

function responseFor(prompt) {
  const lower = prompt.toLowerCase();
  if (lower.includes('help') || lower.includes('command')) return 'Seek `/help`, dear wanderer. Every path Nymera offers is written there.';
  if (lower.includes('rule') || lower.includes('moderation')) return 'The realm is safest when its rules are honored. A staff member may guide you through the finer details.';
  if (lower.includes('hello') || lower.includes('hi')) return 'Welcome, little spark. The Haze has noticed your arrival.';
  return 'The veil listens, though its answer is never simple. Follow your curiosity, keep kindness near, and let the next door reveal itself.';
}

module.exports = [
  {
    data: new SlashCommandBuilder().setName('ask').setDescription('Ask Nymera about the realm.').addStringOption(option => option.setName('question').setDescription('Your question').setRequired(true).setMaxLength(500)),
    async execute(interaction) {
      const prompt = interaction.options.getString('question');
      await interaction.deferReply();
      try { const answer = await respond(interaction.guildId, interaction.user.id, prompt, 'Answer the member’s question'); await interaction.editReply({ embeds: [nymeraEmbed('Nymera Answers', answer || responseFor(prompt))] }); }
      catch (error) { await interaction.editReply({ content: error.message || 'The veil could not answer just now.' }); }
    }
  },
  {
    data: new SlashCommandBuilder().setName('chat').setDescription('Speak to Nymera in character.').addStringOption(option => option.setName('message').setDescription('What you wish to say').setRequired(true).setMaxLength(500)),
    async execute(interaction) {
      const prompt = interaction.options.getString('message');
      await interaction.deferReply();
      try { const answer = await respond(interaction.guildId, interaction.user.id, prompt, 'Respond conversationally'); await interaction.editReply({ embeds: [nymeraEmbed('A Whisper Returns', answer || responseFor(prompt))] }); }
      catch (error) { await interaction.editReply({ content: error.message || 'The veil could not answer just now.' }); }
    }
  },
  {
    data: new SlashCommandBuilder().setName('story').setDescription('Receive a short gothic tale.').addStringOption(option => option.setName('theme').setDescription('Optional story theme').setMaxLength(80)),
    async execute(interaction) {
      const theme = interaction.options.getString('theme') || 'the Haze';
      await interaction.deferReply();
      try {
        const answer = await respond(interaction.guildId, interaction.user.id, theme, 'Write a short, original gothic story with this theme');
        await interaction.editReply({ embeds: [nymeraEmbed('A Tale from the Haze', answer || `In ${theme}, a lantern burned where no hand had lit it. A wanderer followed its violet glow until the fog spoke their true name. Rather than flee, they offered the darkness a promise—and by dawn, the darkness had become a doorway.`)] });
      } catch (error) { await interaction.editReply({ content: error.message || 'The veil could not weave a tale just now.' }); }
    }
  }
];
