import { Client, GatewayIntentBits, Partials } from "discord.js";
import { env } from "./config.js";
import { prisma } from "./database.js";
import { registerEvents } from "./events/register.js";
import { logger } from "./logger.js";
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ],
    partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User, Partials.GuildMember]
});
registerEvents(client);
async function shutdown(signal) {
    logger.info({ signal }, "Shutting down");
    client.destroy();
    await prisma.$disconnect();
    process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("unhandledRejection", error => logger.error({ error }, "Unhandled rejection"));
process.on("uncaughtException", error => logger.fatal({ error }, "Uncaught exception"));
try {
    await prisma.$connect();
    await client.login(env.DISCORD_TOKEN);
}
catch (error) {
    logger.fatal({ error }, "Startup failed");
    await prisma.$disconnect();
    process.exit(1);
}
