const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { getGuild, save } = require('../services/store');
const { nymeraEmbed, COLORS } = require('../lib/theme');

const panelOption = (builder, number) => builder
  .addRoleOption(option => option.setName(`role${number}`).setDescription(`Role ${number} members can toggle`).setRequired(number === 1))
  .addStringOption(option => option.setName(`label${number}`).setDescription(`Button text for role ${number}`).setMaxLength(80));

let panelBuilder = new SlashCommandBuilder()
  .setName('roles')
  .setDescription('Configure automatic and self-assignable roles.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addSubcommand(subcommand => subcommand
    .setName('autorole')
    .setDescription('Set the role new members receive.')
    .addRoleOption(option => option.setName('role').setDescription('Role to give on join').setRequired(true)))
  .addSubcommand(subcommand => {
    subcommand
      .setName('panel')
      .setDescription('Post up to five self-role buttons in one panel.')
      .addChannelOption(option => option.setName('channel').setDescription('Channel for the panel').addChannelTypes(ChannelType.GuildText).setRequired(true));
    for (let number = 1; number <= 5; number += 1) panelOption(subcommand, number);
    return subcommand;
  });

module.exports = [{
  data: panelBuilder,
  async execute(interaction) {
    const settings = await getGuild(interaction.guildId);
    const action = interaction.options.getSubcommand();

    if (action === 'autorole') {
      const role = interaction.options.getRole('role');
      if (!role.editable) return interaction.reply({ content: 'Move Nymera above that role and grant **Manage Roles**.', ephemeral: true });
      settings.autoRoleId = role.id;
      await save();
      return interaction.reply({ embeds: [nymeraEmbed('Arrival Role Set', `New members will receive ${role}.`, COLORS.green)], ephemeral: true });
    }

    const choices = [];
    for (let number = 1; number <= 5; number += 1) {
      const role = interaction.options.getRole(`role${number}`);
      if (role) choices.push({ role, label: interaction.options.getString(`label${number}`) || role.name });
    }
    const unavailable = choices.find(choice => !choice.role.editable);
    if (unavailable) return interaction.reply({ content: `I cannot manage ${unavailable.role}. Move Nymera above it and grant **Manage Roles**.`, ephemeral: true });

    const buttons = choices.map(choice => new ButtonBuilder()
      .setCustomId(`selfrole:${choice.role.id}`)
      .setLabel(choice.label)
      .setStyle(ButtonStyle.Secondary));
    const channel = interaction.options.getChannel('channel');
    await channel.send({
      embeds: [nymeraEmbed('Choose Your Sigils', `Press any button to add or remove its role.\n\n${choices.map(choice => `• ${choice.role} — ${choice.label}`).join('\n')}`)],
      components: [new ActionRowBuilder().addComponents(buttons)]
    });
    await interaction.reply({ content: `Role panel posted with ${choices.length} button${choices.length === 1 ? '' : 's'}.`, ephemeral: true });
  }
}];
