const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { nymeraEmbed, COLORS } = require('../lib/theme');
const { data, save, getGuild } = require('../services/store');

module.exports = [{
  data: new SlashCommandBuilder()
    .setName('timeout').setDescription('Temporarily silence a member.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option => option.setName('member').setDescription('Member to silence').setRequired(true))
    .addIntegerOption(option => option.setName('minutes').setDescription('Duration, from 1 to 40,320 minutes').setMinValue(1).setMaxValue(40320).setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for the action').setMaxLength(300)),
  async execute(interaction) {
    const target = await interaction.guild.members.fetch(interaction.options.getUser('member').id);
    const minutes = interaction.options.getInteger('minutes');
    const reason = interaction.options.getString('reason') || `By ${interaction.user.tag}`;
    if (!target.moderatable) return interaction.reply({ content: 'The veil cannot reach that member. Check my role position and permissions.', ephemeral: true });
    await target.timeout(minutes * 60_000, reason);
    await interaction.reply({ embeds: [nymeraEmbed('A Silence Cast', `${target} has been muted for **${minutes} minute(s)**.\nReason: ${reason}`, COLORS.danger)] });
  }
},
{
  data: new SlashCommandBuilder().setName('warn').setDescription('Record a formal warning.').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option => option.setName('member').setDescription('Member to warn').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason').setRequired(true).setMaxLength(300)),
  async execute(interaction) {
    await getGuild(interaction.guildId);
    const member = interaction.options.getUser('member');
    const reason = interaction.options.getString('reason');
    const key = `${interaction.guildId}:${member.id}`;
    data.warnings[key] ||= [];
    data.warnings[key].push({ reason, moderatorId: interaction.user.id, createdAt: new Date().toISOString() });
    await save();
    await interaction.reply({ embeds: [nymeraEmbed('A Warning Etched', `${member} has received a warning.\nReason: ${reason}`, COLORS.danger)] });
  }
},
{
  data: new SlashCommandBuilder().setName('warnings').setDescription('View a member’s warning record.').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option => option.setName('member').setDescription('Member to inspect').setRequired(true)),
  async execute(interaction) {
    await getGuild(interaction.guildId);
    const member = interaction.options.getUser('member');
    const warnings = data.warnings[`${interaction.guildId}:${member.id}`] || [];
    const text = warnings.length ? warnings.slice(-10).map((warning, i) => `**${i + 1}.** ${warning.reason} — <@${warning.moderatorId}>`).join('\n') : 'No warnings are recorded.';
    await interaction.reply({ embeds: [nymeraEmbed(`Warnings: ${member.username}`, text)], ephemeral: true });
  }
},
{
  data: new SlashCommandBuilder().setName('purge').setDescription('Remove recent messages.').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(option => option.setName('amount').setDescription('Number of messages, 1–100').setMinValue(1).setMaxValue(100).setRequired(true)),
  async execute(interaction) {
    const amount = interaction.options.getInteger('amount');
    await interaction.channel.bulkDelete(amount, true);
    await interaction.reply({ content: `Removed up to ${amount} message(s).`, ephemeral: true });
  }
},
{
  data: new SlashCommandBuilder().setName('lock').setDescription('Lock the current text channel.').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(interaction) {
    await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
    await interaction.reply({ embeds: [nymeraEmbed('Channel Sealed', 'The veil closes; this channel is now locked.', COLORS.danger)] });
  }
},
{
  data: new SlashCommandBuilder().setName('unlock').setDescription('Unlock the current text channel.').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(interaction) {
    await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null });
    await interaction.reply({ embeds: [nymeraEmbed('Channel Unsealed', 'The veil relents; this channel is now open.', COLORS.green)] });
  }
}];
