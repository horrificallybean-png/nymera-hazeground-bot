import { EmbedBuilder, type Client, type Guild } from "discord.js";
import { prisma } from "../database.js";
import { logger } from "../logger.js";

export async function sendGuildLog(guild: Guild, title: string, description: string) {
  const config = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });
  if (!config?.logChannelId) return;
  const channel = await guild.channels.fetch(config.logChannelId).catch(() => null);
  if (!channel || !("send" in channel)) return;
  await channel.send({
    embeds: [new EmbedBuilder().setColor(0x6f42c1).setTitle(title).setDescription(description.slice(0, 4000)).setTimestamp()]
  }).catch((error: unknown) => logger.warn({ error, guildId: guild.id }, "Could not send guild log"));
}

export function registerLogging(client: Client) {
  client.on("messageDelete", m => { if (m.guild && !m.author?.bot) void sendGuildLog(m.guild, "Message deleted", `**Author:** ${m.author ?? "Unknown"}\n**Channel:** ${m.channel}\n${m.content || "*No cached text*"}`); });
  client.on("messageUpdate", (before, after) => { if (after.guild && !after.author?.bot && before.content !== after.content) void sendGuildLog(after.guild, "Message edited", `**Author:** ${after.author}\n**Channel:** ${after.channel}\n**Before:** ${before.content || "*Unavailable*"}\n**After:** ${after.content || "*Unavailable*"}`); });
  client.on("guildMemberUpdate", (before, after) => {
    if (before.nickname !== after.nickname) void sendGuildLog(after.guild, "Nickname changed", `${after.user.tag}: ${before.nickname ?? before.user.username} → ${after.nickname ?? after.user.username}`);
    if (before.roles.cache.size !== after.roles.cache.size) void sendGuildLog(after.guild, "Member roles changed", `${after.user.tag}'s roles were updated.`);
    if (!before.premiumSince && after.premiumSince) void sendGuildLog(after.guild, "Server boost", `${after.user.tag} boosted the server.`);
  });
  client.on("channelCreate", c => { if (!c.isDMBased()) void sendGuildLog(c.guild, "Channel created", `${c.name} (${c.id})`); });
  client.on("channelDelete", c => { if (!c.isDMBased()) void sendGuildLog(c.guild, "Channel deleted", `${c.name} (${c.id})`); });
  client.on("voiceStateUpdate", (before, after) => {
    if (before.channelId !== after.channelId) void sendGuildLog(after.guild, "Voice activity", `${after.member?.user.tag ?? after.id}: ${before.channel?.name ?? "none"} → ${after.channel?.name ?? "none"}`);
  });
}
