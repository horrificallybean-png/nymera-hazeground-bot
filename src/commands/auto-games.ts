import {
  ChannelType, PermissionFlagsBits, SlashCommandBuilder
} from "discord.js";
import type { Command } from "../types.js";
import { prisma } from "../database.js";
import { launchAutoGame } from "../services/auto-games.js";

export const autoGameCommands: Command[] = [{
  data: new SlashCommandBuilder().setName("auto-games").setDescription("Configure rotating automatic games")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName("setup").setDescription("Enable automatic games")
      .addChannelOption(o => o.setName("channel").setDescription("Game channel").setRequired(true).addChannelTypes(ChannelType.GuildText))
      .addIntegerOption(o => o.setName("minutes").setDescription("Minutes between games").setMinValue(15).setMaxValue(1440)))
    .addSubcommand(s => s.setName("disable").setDescription("Disable automatic games"))
    .addSubcommand(s => s.setName("status").setDescription("Show automatic-game settings"))
    .addSubcommand(s => s.setName("start-now").setDescription("Start the next game immediately")),
  async execute(i) {
    const sub = i.options.getSubcommand();
    if (sub === "setup") {
      const channel = i.options.getChannel("channel", true);
      const minutes = i.options.getInteger("minutes") ?? 90;
      await prisma.autoGameConfig.upsert({
        where: { guildId: i.guildId! },
        update: { channelId: channel.id, intervalMinutes: minutes, enabled: true, lastRunAt: new Date() },
        create: { guildId: i.guildId!, channelId: channel.id, intervalMinutes: minutes, lastRunAt: new Date() }
      });
      await i.reply({ content: `Automatic games enabled in ${channel} every ${minutes} minutes. The first scheduled game will start in ${minutes} minutes. Use \`/auto-games start-now\` to test now.`, ephemeral: true });
      return;
    }
    if (sub === "disable") {
      await prisma.autoGameConfig.updateMany({ where: { guildId: i.guildId! }, data: { enabled: false } });
      await i.reply({ content: "Automatic games disabled.", ephemeral: true });
      return;
    }
    const config = await prisma.autoGameConfig.findUnique({ where: { guildId: i.guildId! } });
    if (sub === "status") {
      await i.reply({ content: config
        ? `Status: **${config.enabled ? "enabled" : "disabled"}**\nChannel: <#${config.channelId}>\nInterval: ${config.intervalMinutes} minutes\nLast game: ${config.lastRunAt ? `<t:${Math.floor(config.lastRunAt.getTime() / 1000)}:R>` : "never"}`
        : "Automatic games are not configured.", ephemeral: true });
      return;
    }
    if (!config?.enabled) return void await i.reply({ content: "Configure automatic games first with `/auto-games setup`.", ephemeral: true });
    await i.deferReply({ ephemeral: true });
    const launched = await launchAutoGame(i.client, i.guildId!);
    await i.editReply(launched ? "The next automatic game has started." : "I could not post in the configured channel. Check my channel permissions.");
  }
}];
