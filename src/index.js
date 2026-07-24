const { Client, Collection, Events, GatewayIntentBits } = require('discord.js');
const config = require('./config');
const { connectDatabase } = require('./database');
const economyCommands = require('./commands/economy');
const socialCommands = require('./commands/social');
const moderationCommands = require('./commands/moderation');
const communityCommands = require('./commands/community');
const generalCommands = require('./commands/general');
const companionCommands = require('./commands/companion');
const systemCommands = require('./commands/systems');
const gameCommands = require('./commands/games');
const roleCommands = require('./commands/roles');
const handleMessage = require('./events/messageCreate');
const welcomeMember = require('./events/guildMemberAdd');
const goodbyeMember = require('./events/guildMemberRemove');
const moderateMessage = require('./events/moderateMessage');
const handleAutoGame = require('./events/autoGames');
const { startActivity } = require('./services/activity');
const { data, save } = require('./services/store');
const { audit } = require('./services/logging');
const { getVerification } = require('./services/verification');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildInvites, GatewayIntentBits.MessageContent] });
client.commands = new Collection();
for (const command of [...generalCommands, ...companionCommands, ...economyCommands, ...socialCommands, ...moderationCommands, ...communityCommands, ...systemCommands, ...gameCommands, ...roleCommands]) client.commands.set(command.data.name, command);

client.once(Events.ClientReady, ready => { console.log(`Nymera watches as ${ready.user.tag}`); initializeInviteCache().catch(console.error); startActivity(client); setInterval(() => endGiveaways().catch(console.error), 60000); });
client.on(Events.MessageCreate, async message => { await moderateMessage(message); if (!message.deleted) { await handleAutoGame(message); await handleMessage(message); } });
client.on(Events.GuildMemberAdd, welcomeMember);
client.on(Events.GuildMemberRemove, goodbyeMember);
client.on(Events.MessageDelete, message => { if (message.guild) audit(message.guild, 'Message Deleted', `A message from ${message.author || 'an unknown member'} was deleted in ${message.channel}.`).catch(console.error); });
client.on(Events.MessageUpdate, (oldMessage, newMessage) => { if (newMessage.guild && oldMessage.content !== newMessage.content) audit(newMessage.guild, 'Message Edited', `A message was edited in ${newMessage.channel}.`).catch(console.error); });
client.on(Events.InviteCreate, invite => { client.inviteCache ||= new Map(); client.inviteCache.set(invite.guild.id, new Map([...client.inviteCache.get(invite.guild.id) || [], [invite.code, invite.uses || 0]])); });
client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isButton()) {
    if (interaction.customId === 'nymera_verify') { const verification = await getVerification(interaction.guildId); const role = interaction.guild.roles.cache.get(verification.roleId); if (!verification.roleId) return interaction.reply({ content: 'Verification has not been set up. Ask a server manager to run `/verify setup`.', ephemeral: true }); if (!role) return interaction.reply({ content: 'The verification role no longer exists. Ask a server manager to set it up again.', ephemeral: true }); if (!role.editable) return interaction.reply({ content: 'Nymera cannot manage the verification role. Move Nymera above it and enable Manage Roles.', ephemeral: true }); await interaction.member.roles.add(role, 'Nymera verification'); return interaction.reply({ content: 'The seal recognizes you. Welcome to the Hazeground.', ephemeral: true }); }
    if (interaction.customId.startsWith('selfrole:')) { const role = interaction.guild.roles.cache.get(interaction.customId.split(':')[1]); if (!role?.editable) return interaction.reply({ content: 'I cannot manage that role.', ephemeral: true }); const hasRole = interaction.member.roles.cache.has(role.id); if (hasRole) await interaction.member.roles.remove(role, 'Nymera self-role toggle'); else await interaction.member.roles.add(role, 'Nymera self-role toggle'); return interaction.reply({ content: hasRole ? `Removed ${role}.` : `Granted ${role}.`, ephemeral: true }); }
    if (interaction.customId.startsWith('autogame:')) { const [, guildId, , reward] = interaction.customId.split(':'); const button = interaction.message.components[0].components[0]; if (button.disabled) return interaction.reply({ content: 'Another soul claimed this treasure.', ephemeral: true }); await require('./services/economy').awardSpellmarks(guildId, interaction.user.id, Number(reward), 'Automatic treasure drop'); await interaction.update({ content: `✦ ${interaction.user} claimed **${reward} Spellmarks** from the fog!`, embeds: [], components: [] }); return; }
    if (interaction.customId.startsWith('giveaway:')) { const id = interaction.customId.split(':')[1], giveaway = data.giveaways[id]; if (!giveaway || giveaway.ended) return interaction.reply({ content: 'This giveaway has already ended.', ephemeral: true }); if (!giveaway.entries.includes(interaction.user.id)) giveaway.entries.push(interaction.user.id); await save(); return interaction.reply({ content: 'Your name has entered the archives.', ephemeral: true }); }
    return;
  }
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  try { await command.execute(interaction); }
  catch (error) {
    console.error('Command error:', error);
    const response = { content: 'The veil shudders. Please try again shortly.', ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(response); else await interaction.reply(response);
  }
});

async function endGiveaways() {
  for (const giveaway of Object.values(data.giveaways)) {
    if (giveaway.ended || giveaway.endsAt > Date.now()) continue;
    giveaway.ended = true; const guild = client.guilds.cache.get(giveaway.guildId); const channel = guild?.channels.cache.get(giveaway.channelId); const winner = giveaway.entries.length ? giveaway.entries[Math.floor(Math.random() * giveaway.entries.length)] : null;
    if (channel?.isTextBased()) await channel.send({ content: winner ? `✦ The giveaway for **${giveaway.prize}** is complete. Winner: <@${winner}>!` : `✦ The giveaway for **${giveaway.prize}** ended without entries.` });
  }
  await save();
}

async function initializeInviteCache() {
  client.inviteCache = new Map();
  for (const guild of client.guilds.cache.values()) {
    const invites = await guild.invites.fetch().catch(() => null);
    if (invites) client.inviteCache.set(guild.id, new Map(invites.map(invite => [invite.code, invite.uses || 0])));
  }
}

connectDatabase().then(() => client.login(config.token)).catch(error => { console.error('Startup failed:', error); process.exit(1); });
