const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { getGuild, save } = require('../services/store');
const { nymeraEmbed, COLORS } = require('../lib/theme');
const { getGuildSettings, updateGuildSettings } = require('../services/guildSettings');

module.exports = [
  {
    data: new SlashCommandBuilder().setName('help').setDescription('Reveal Nymera’s available commands.'),
    async execute(interaction) {
      await interaction.reply({ embeds: [nymeraEmbed('Nymera’s Grimoire', '**Economy:** `/daily` `/balance` `/work` `/hunt` `/leaderboard`\n**Community:** `/profile` `/prophecy` `/ticket`\n**Staff:** `/timeout` `/warn` `/warnings` `/purge` `/lock` `/unlock` `/configure`')] });
    }
  },
  {
    data: new SlashCommandBuilder().setName('configure').setDescription('Configure Nymera for this server.').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand(sub => sub.setName('welcome').setDescription('Set the welcome channel.').addChannelOption(option => option.setName('channel').setDescription('Welcome channel').addChannelTypes(ChannelType.GuildText).setRequired(true)))
      .addSubcommand(sub => sub.setName('goodbye').setDescription('Set the goodbye channel.').addChannelOption(option => option.setName('channel').setDescription('Goodbye channel').addChannelTypes(ChannelType.GuildText).setRequired(true)))
      .addSubcommand(sub => sub.setName('activity').setDescription('Set the automatic activity channel.').addChannelOption(option => option.setName('channel').setDescription('Activity channel').addChannelTypes(ChannelType.GuildText).setRequired(true)))
      .addSubcommand(sub => sub.setName('levels').setDescription('Set the level-up announcement channel.').addChannelOption(option => option.setName('channel').setDescription('Level-up channel').addChannelTypes(ChannelType.GuildText).setRequired(true)))
      .addSubcommand(sub => sub.setName('dead-chat').setDescription('Configure quiet-chat revival prompts.').addChannelOption(option => option.setName('channel').setDescription('Channel to revive').addChannelTypes(ChannelType.GuildText).setRequired(true)).addIntegerOption(option => option.setName('hours').setDescription('Hours of silence before a prompt, 2–72').setMinValue(2).setMaxValue(72).setRequired(true)).addRoleOption(option => option.setName('role').setDescription('Optional role to ping')))
      .addSubcommand(sub => sub.setName('test-activity').setDescription('Send an automatic game now to test the activity channel.'))
      .addSubcommand(sub => sub.setName('logs').setDescription('Set the moderation log channel.').addChannelOption(option => option.setName('channel').setDescription('Log channel').addChannelTypes(ChannelType.GuildText).setRequired(true)))
      .addSubcommand(sub => sub.setName('link-filter').setDescription('Turn link filtering on or off.').addBooleanOption(option => option.setName('enabled').setDescription('Whether to remove ordinary links').setRequired(true))),
    async execute(interaction) {
      const action = interaction.options.getSubcommand();
      if (action === 'test-activity') {
        const { postAutoGame } = require('../services/activity');
        await postAutoGame(interaction.client, interaction.guildId);
        return interaction.reply({ content: 'An automatic game was sent to the configured activity channel.', ephemeral: true });
      }
      const patch = {};
      if (action === 'welcome') patch.welcomeChannelId = interaction.options.getChannel('channel').id;
      if (action === 'goodbye') patch.goodbyeChannelId = interaction.options.getChannel('channel').id;
      if (action === 'activity') patch.activityChannelId = interaction.options.getChannel('channel').id;
      if (action === 'levels') patch.levelChannelId = interaction.options.getChannel('channel').id;
      if (action === 'dead-chat') patch.deadChat = { channelId: interaction.options.getChannel('channel').id, roleId: interaction.options.getRole('role')?.id || null, idleHours: interaction.options.getInteger('hours'), lastHumanMessageAt: new Date().toISOString(), lastRevivalAt: null };
      if (action === 'logs') patch.logChannelId = interaction.options.getChannel('channel').id;
      if (action === 'link-filter') patch.linkFilter = interaction.options.getBoolean('enabled');
      await updateGuildSettings(interaction.guildId, patch);
      await interaction.reply({ embeds: [nymeraEmbed('The Realm Is Aligned', `Configuration **${action}** has been updated.`, COLORS.green)], ephemeral: true });
    }
  },
  {
    data: new SlashCommandBuilder().setName('ticket').setDescription('Open a private support ticket.').addStringOption(option => option.setName('topic').setDescription('How can staff help?').setMaxLength(150)),
    async execute(interaction) {
      const topic = interaction.options.getString('topic') || 'No topic provided';
      const channel = await interaction.guild.channels.create({ name: `ticket-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 90), type: ChannelType.GuildText, permissionOverwrites: [
        { id: interaction.guild.roles.everyone.id, deny: ['ViewChannel'] },
        { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
        { id: interaction.client.user.id, allow: ['ViewChannel', 'SendMessages', 'ManageChannels', 'ReadMessageHistory'] }
      ] });
      await channel.send({ embeds: [nymeraEmbed('A Door in the Veil', `${interaction.user}, your ticket is open.\n**Topic:** ${topic}\nA staff member may assist you shortly.`)] });
      await interaction.reply({ content: `Your private ticket awaits: ${channel}`, ephemeral: true });
    }
  },
  {
    data: new SlashCommandBuilder().setName('close').setDescription('Close the current ticket channel.').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    async execute(interaction) {
      if (!interaction.channel.name.startsWith('ticket-')) return interaction.reply({ content: 'This command may only be used inside a ticket channel.', ephemeral: true });
      await interaction.reply('This ticket closes in five seconds.');
      setTimeout(() => interaction.channel.delete('Ticket closed by staff').catch(() => {}), 5000);
    }
  }
  ,{
    data: new SlashCommandBuilder().setName('level-reward').setDescription('Manage roles awarded for reaching levels.').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addSubcommand(sub => sub.setName('set').setDescription('Award a role at a level.').addIntegerOption(option => option.setName('level').setDescription('Required level').setMinValue(1).setMaxValue(1000).setRequired(true)).addRoleOption(option => option.setName('role').setDescription('Role to award').setRequired(true)))
      .addSubcommand(sub => sub.setName('remove').setDescription('Remove a level reward.').addIntegerOption(option => option.setName('level').setDescription('Level to remove').setMinValue(1).setRequired(true)))
      .addSubcommand(sub => sub.setName('list').setDescription('List configured level rewards.')),
    async execute(interaction) {
      const settings = await getGuild(interaction.guildId); const action = interaction.options.getSubcommand();
      if (action === 'list') {
        const text = settings.levelRewards.length ? settings.levelRewards.sort((a, b) => a.level - b.level).map(reward => `Level **${reward.level}** — <@&${reward.roleId}>`).join('\n') : 'No level roles are configured.';
        return interaction.reply({ embeds: [nymeraEmbed('Level Rewards', text)], ephemeral: true });
      }
      const level = interaction.options.getInteger('level');
      if (action === 'remove') {
        settings.levelRewards = settings.levelRewards.filter(reward => reward.level !== level); await save();
        return interaction.reply({ content: `Level ${level} reward removed.`, ephemeral: true });
      }
      const role = interaction.options.getRole('role');
      if (!role.editable) return interaction.reply({ content: 'I cannot assign that role. Move Nymera’s role above it and grant **Manage Roles**.', ephemeral: true });
      settings.levelRewards = settings.levelRewards.filter(reward => reward.level !== level);
      settings.levelRewards.push({ level, roleId: role.id }); await save();
      await interaction.reply({ embeds: [nymeraEmbed('Level Reward Bound', `Members reaching Level **${level}** will receive ${role}.`, COLORS.green)], ephemeral: true });
    }
  }
];
