const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser } = require('../services/store');
const { nymeraEmbed, COLORS } = require('../lib/theme');

module.exports = [
  {
    data: new SlashCommandBuilder().setName('about').setDescription('Learn of Nymera and her realm.'),
    async execute(interaction) {
      await interaction.reply({ embeds: [nymeraEmbed('Nymera Hazeground', `Guardian, storyteller, and keeper of Spellbound Hazeground.\n\n**Version:** 2.0 • **Guilds watched:** ${interaction.client.guilds.cache.size} • **Souls present:** ${interaction.guild.memberCount}`)] });
    }
  },
  {
    data: new SlashCommandBuilder().setName('ping').setDescription('Measure Nymera’s connection to the veil.'),
    async execute(interaction) {
      await interaction.reply({ embeds: [nymeraEmbed('The Veil Responds', `Gateway latency: **${interaction.client.ws.ping}ms**\nUptime: <t:${Math.floor((Date.now() - interaction.client.uptime) / 1000)}:R>`, COLORS.green)], ephemeral: true });
    }
  },
  {
    data: new SlashCommandBuilder().setName('server').setDescription('Reveal this server’s chronicle.'),
    async execute(interaction) {
      const guild = interaction.guild;
      await interaction.reply({ embeds: [nymeraEmbed(guild.name, `**Members:** ${guild.memberCount}\n**Created:** <t:${Math.floor(guild.createdTimestamp / 1000)}:D>\n**Channels:** ${guild.channels.cache.size}\n**Roles:** ${guild.roles.cache.size}`)] });
    }
  },
  {
    data: new SlashCommandBuilder().setName('user').setDescription('View a member’s Discord information.').addUserOption(option => option.setName('member').setDescription('Member to inspect')),
    async execute(interaction) {
      const member = interaction.options.getMember('member') || interaction.member;
      await interaction.reply({ embeds: [nymeraEmbed(`${member.user.username}'s Record`, `**Joined Discord:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:D>\n**Joined this server:** <t:${Math.floor(member.joinedTimestamp / 1000)}:D>\n**Roles:** ${member.roles.cache.size - 1}`)].map(embed => embed.setThumbnail(member.user.displayAvatarURL())) });
    }
  },
  {
    data: new SlashCommandBuilder().setName('avatar').setDescription('Display a member’s avatar.').addUserOption(option => option.setName('member').setDescription('Member to inspect')),
    async execute(interaction) {
      const user = interaction.options.getUser('member') || interaction.user;
      const embed = new EmbedBuilder().setColor(COLORS.violet).setTitle(`${user.username}'s Avatar`).setImage(user.displayAvatarURL({ size: 1024 })).setFooter({ text: 'Nymera Hazeground' });
      await interaction.reply({ embeds: [embed] });
    }
  },
  {
    data: new SlashCommandBuilder().setName('banner').setDescription('Display a member’s profile banner.').addUserOption(option => option.setName('member').setDescription('Member to inspect')),
    async execute(interaction) {
      const selected = interaction.options.getUser('member') || interaction.user;
      const user = await interaction.client.users.fetch(selected.id, { force: true });
      if (!user.banner) return interaction.reply({ content: 'No banner adorns this soul’s profile.', ephemeral: true });
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.violet).setTitle(`${user.username}'s Banner`).setImage(user.bannerURL({ size: 2048 }))] });
    }
  }
];
