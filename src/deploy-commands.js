const { REST, Routes } = require('discord.js');
const config = require('./config');
const commands = [
  ...require('./commands/general'),
  ...require('./commands/companion'),
  ...require('./commands/economy'),
  ...require('./commands/social'),
  ...require('./commands/moderation'),
  ...require('./commands/community')
  ,...require('./commands/systems')
  ,...require('./commands/games')
  ,...require('./commands/roles')
  ,...require('./commands/radio')
].map(command => command.data.toJSON());

const rest = new REST({ version: '10' }).setToken(config.token);
const route = config.guildId
  ? Routes.applicationGuildCommands(config.clientId, config.guildId)
  : Routes.applicationCommands(config.clientId);

rest.put(route, { body: commands })
  .then(() => console.log(`Registered ${commands.length} slash commands.`))
  .catch(error => { console.error('Could not register commands:', error); process.exitCode = 1; });
