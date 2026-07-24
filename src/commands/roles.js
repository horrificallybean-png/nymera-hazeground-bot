const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { getGuild, save } = require('../services/store');
const { nymeraEmbed, COLORS } = require('../lib/theme');

module.exports = [{
  data: new SlashCommandBuilder().setName('roles').setDescription('Configure automatic and self-assignable roles.').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand(s => s.setName('autorole').setDescription('Set the role new members receive.').addRoleOption(o => o.setName('role').setDescription('Role to give on join').setRequired(true)))
    .addSubcommand(s => s.setName('panel').setDescription('Post a button role panel.').addChannelOption(o => o.setName('channel').setDescription('Channel for the panel').addChannelTypes(ChannelType.GuildText).setRequired(true)).addRoleOption(o => o.setName('role').setDescription('Role members can toggle').setRequired(true)).addStringOption(o => o.setName('label').setDescription('Button label').setRequired(true).setMaxLength(80))),
  async execute(interaction) {
    const settings = await getGuild(interaction.guildId); const action = interaction.options.getSubcommand();
    const role = interaction.options.getRole('role');
    if (!role.editable) return interaction.reply({ content: 'Move Nymera above that role and grant **Manage Roles**.', ephemeral: true });
    if (action === 'autorole') { settings.autoRoleId = role.id; await save(); return interaction.reply({ embeds: [nymeraEmbed('Arrival Role Set', `New members will receive ${role}.`, COLORS.green)], ephemeral: true }); }
    const channel = interaction.options.getChannel('channel'); const label = interaction.options.getString('label');
    const button = new ButtonBuilder().setCustomId(`selfrole:${role.id}`).setLabel(label).setStyle(ButtonStyle.Secondary);
    await channel.send({ embeds: [nymeraEmbed('Choose Your Sigil', `Press the button to add or remove ${role}.`)], components: [new ActionRowBuilder().addComponents(button)] });
    await interaction.reply({ content: 'Role panel posted.', ephemeral: true });
  }
}];
