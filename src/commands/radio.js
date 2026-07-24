const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { startRadio, stopRadio, getRadio } = require('../services/radio');
const { nymeraEmbed, COLORS } = require('../lib/theme');

module.exports = [{
  data: new SlashCommandBuilder()
    .setName('radio')
    .setDescription('Control Nymera’s Haunted Radio lo-fi stream.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(subcommand => subcommand
      .setName('start')
      .setDescription('Start Lofi Cafe in a voice channel.')
      .addChannelOption(option => option
        .setName('channel')
        .setDescription('Your Haunted Radio voice channel')
        .addChannelTypes(ChannelType.GuildVoice)
        .setRequired(true)))
    .addSubcommand(subcommand => subcommand.setName('stop').setDescription('Stop Haunted Radio.'))
    .addSubcommand(subcommand => subcommand.setName('status').setDescription('Check Haunted Radio status.')),
  async execute(interaction) {
    const action = interaction.options.getSubcommand();
    if (action === 'stop') {
      const stopped = stopRadio(interaction.guildId);
      return interaction.reply({ content: stopped ? 'Haunted Radio has fallen silent.' : 'Haunted Radio is not playing.', ephemeral: true });
    }
    if (action === 'status') {
      const session = getRadio(interaction.guildId);
      return interaction.reply({ embeds: [nymeraEmbed('Haunted Radio', session ? `Streaming lo-fi in <#${session.channelId}>.` : 'The radio is currently silent.', session ? COLORS.green : COLORS.danger)], ephemeral: true });
    }
    const channel = interaction.options.getChannel('channel');
    await interaction.deferReply();
    try {
      await startRadio(interaction.guild, channel);
      await interaction.editReply({ embeds: [nymeraEmbed('Haunted Radio', `Nymera is now streaming lo-fi in ${channel}.`, COLORS.green)] });
    } catch (error) {
      console.error('Could not start Haunted Radio:', error);
      await interaction.editReply({ content: 'I could not join or play in that voice channel. Check my Connect and Speak permissions.' });
    }
  }
}];
