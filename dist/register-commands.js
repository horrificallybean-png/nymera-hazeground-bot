import { REST, Routes } from "discord.js";
import { commands } from "./commands/index.js";
import { env } from "./config.js";
import { logger } from "./logger.js";
const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);
const route = env.DISCORD_GUILD_ID
    ? Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID)
    : Routes.applicationCommands(env.DISCORD_CLIENT_ID);
try {
    await rest.put(route, { body: commands.map(command => command.data.toJSON()) });
    logger.info({ scope: env.DISCORD_GUILD_ID ? "guild" : "global", commands: commands.length }, "Slash commands registered");
}
catch (error) {
    logger.fatal({ err: error }, "Command registration failed");
    process.exitCode = 1;
}
