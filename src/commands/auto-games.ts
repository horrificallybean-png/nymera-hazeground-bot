import {
  ChannelType, PermissionFlagsBits, SlashCommandBuilder, type TextChannel
} from "discord.js";
import type { Command } from "../types.js";
import { prisma } from "../database.js";
import { launchAutoGame } from "../services/auto-games.js";
import { aiConfigured, getAutoGameAiStatus, testAutoGameAi } from "../services/ai.js";
import { postContinuousGameInstructions } from "../services/continuous-games.js";

export const autoGameCommands: Command[] = [{
  data: new SlashCommandBuilder().setName("auto-games").setDescription("Configure Nymera's rotating activity host")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName("setup").setDescription("Enable automatic games")
      .addChannelOption(o => o.setName("channel").setDescription("Game channel").setRequired(true).addChannelTypes(ChannelType.GuildText))
      .addIntegerOption(o => o.setName("minutes").setDescription("Minutes between games (default: 90)").setMinValue(15).setMaxValue(1440))
      .addIntegerOption(o => o.setName("answer_minutes").setDescription("Minutes allowed to answer (default: 5)").setMinValue(1).setMaxValue(60))
      .addRoleOption(o => o.setName("ping_role").setDescription("Optional extra role to notify for every game")))
    .addSubcommand(s => s.setName("disable").setDescription("Disable automatic games"))
    .addSubcommand(s => s.setName("status").setDescription("Show automatic-game settings"))
    .addSubcommand(s => s.setName("ai-test").setDescription("Test AI-generated trivia without posting a game"))
    .addSubcommand(s => s.setName("start-now").setDescription("Start the next game immediately"))
    .addSubcommand(s => s.setName("continuous-setup").setDescription("Configure always-running counting and word-chain channels")
      .addChannelOption(o => o.setName("counting_channel").setDescription("Dedicated endless-counting channel").setRequired(true).addChannelTypes(ChannelType.GuildText))
      .addChannelOption(o => o.setName("word_chain_channel").setDescription("Dedicated endless word-chain channel").setRequired(true).addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(s => s.setName("continuous-status").setDescription("Show the current endless-game progress"))
    .addSubcommand(s => s.setName("continuous-reset").setDescription("Reset one always-running game")
      .addStringOption(o => o.setName("game").setDescription("Game to reset").setRequired(true).addChoices(
        { name: "Counting", value: "counting" },
        { name: "Word Chain", value: "wordchain" }
      ))),
  async execute(i) {
    const sub = i.options.getSubcommand();
    if (sub === "continuous-setup") {
      const counting = i.options.getChannel("counting_channel", true) as TextChannel;
      const wordChain = i.options.getChannel("word_chain_channel", true) as TextChannel;
      if (counting.id === wordChain.id) {
        return void await i.reply({ content: "Choose two different channels for the continuous games.", ephemeral: true });
      }
      await i.deferReply({ ephemeral: true });
      await prisma.continuousGameConfig.upsert({
        where: { guildId: i.guildId! },
        update: { countingChannelId: counting.id, wordChainChannelId: wordChain.id },
        create: { guildId: i.guildId!, countingChannelId: counting.id, wordChainChannelId: wordChain.id }
      });
      await postContinuousGameInstructions(counting, wordChain);
      await i.editReply(`Endless counting is active in ${counting}, and the eternal word chain is active in ${wordChain}.`);
      return;
    }
    if (sub === "continuous-status") {
      const continuous = await prisma.continuousGameConfig.findUnique({ where: { guildId: i.guildId! } });
      await i.reply({
        content: continuous
          ? `**Endless Counting**\nChannel: <#${continuous.countingChannelId}>\nCurrent number: **${continuous.countingCurrent}**\nNext number: **${continuous.countingCurrent + 1}**\n\n**Eternal Word Chain**\nChannel: <#${continuous.wordChainChannelId}>\nCurrent word: **${continuous.wordChainCurrentWord}**\nNext letter: **${continuous.wordChainCurrentWord.at(-1)?.toUpperCase()}**`
          : "Continuous games are not configured. Run `/auto-games continuous-setup` or `/setup complete`.",
        ephemeral: true
      });
      return;
    }
    if (sub === "continuous-reset") {
      const game = i.options.getString("game", true);
      const result = await prisma.continuousGameConfig.updateMany({
        where: { guildId: i.guildId! },
        data: game === "counting"
          ? { countingCurrent: 0, countingLastUserId: null }
          : { wordChainCurrentWord: "moon", wordChainLastUserId: null, wordChainUsedWords: "[\"moon\"]" }
      });
      await i.reply({
        content: result.count ? `${game === "counting" ? "Endless counting" : "The eternal word chain"} was reset.` : "Continuous games are not configured.",
        ephemeral: true
      });
      return;
    }
    if (sub === "setup") {
      const channel = i.options.getChannel("channel", true);
      const minutes = i.options.getInteger("minutes") ?? 90;
      const answerMinutes = i.options.getInteger("answer_minutes") ?? 5;
      const pingRole = i.options.getRole("ping_role");
      await prisma.autoGameConfig.upsert({
        where: { guildId: i.guildId! },
        update: {
          channelId: channel.id,
          intervalMinutes: minutes,
          answerSeconds: answerMinutes * 60,
          pingRoleId: pingRole?.id ?? null,
          enabled: true,
          lastRunAt: new Date()
        },
        create: {
          guildId: i.guildId!,
          channelId: channel.id,
          intervalMinutes: minutes,
          answerSeconds: answerMinutes * 60,
          pingRoleId: pingRole?.id,
          lastRunAt: new Date()
        }
      });
      await i.reply({
        content: `Nymera's automatic activity host is enabled in ${channel} every ${minutes} minutes. Each activity automatically pings its matching game-interest roles${pingRole ? ` plus ${pingRole}` : ""}. Activities include trivia, quizzes, polls, word games, encounters, treasure hunts, counting, reaction races, and flash giveaways. Each activity stays open for ${answerMinutes} minute${answerMinutes === 1 ? "" : "s"}. Use \`/auto-games start-now\` to test now.`,
        ephemeral: true
      });
      return;
    }
    if (sub === "disable") {
      await prisma.autoGameConfig.updateMany({ where: { guildId: i.guildId! }, data: { enabled: false } });
      await i.reply({ content: "Nymera's automatic activity host is disabled.", ephemeral: true });
      return;
    }
    if (sub === "ai-test") {
      await i.deferReply({ ephemeral: true });
      const result = await testAutoGameAi();
      if (result.result === "success") {
        await i.editReply("✅ AI activity generation is connected to the configured OpenAI model. Trivia, polls, word games, riddles, encounters, treasure hunts, reaction races, counting themes, Hangman, and flash giveaways can all receive fresh AI content.");
      } else if (!result.configured || result.result === "not_configured") {
        await i.editReply("AI-generated trivia is disabled because `OPENAI_API_KEY` is missing. Automatic games still work using built-in questions.");
      } else {
        await i.editReply(`AI trivia could not reach OpenAI, so Nymera will safely use built-in questions.\nReason: \`${result.error ?? "Unknown OpenAI error"}\``);
      }
      return;
    }
    const config = await prisma.autoGameConfig.findUnique({ where: { guildId: i.guildId! } });
    if (sub === "status") {
      const aiStatus = getAutoGameAiStatus();
      const generationStatus = aiStatus.attemptedAt
        ? `${aiStatus.result === "success" ? "fresh AI content used" : aiStatus.result === "failed" ? "fallback used" : aiStatus.result} <t:${Math.floor(aiStatus.attemptedAt.getTime() / 1000)}:R>${aiStatus.error ? `\nLast AI error: \`${aiStatus.error}\`` : ""}`
        : "not attempted since this restart";
      await i.reply({ content: config
        ? `Status: **${config.enabled ? "enabled" : "disabled"}**\nChannel: <#${config.channelId}>\nInterval: ${config.intervalMinutes} minutes\nAnswer window: ${Math.ceil(config.answerSeconds / 60)} minutes\nGame-interest role pings: **automatic**\nExtra ping role: ${config.pingRoleId ? `<@&${config.pingRoleId}>` : "none"}\nAI activity generation: **${aiConfigured ? "configured" : "using built-in fallback"}**\nLast generation: **${generationStatus}**\nLast game: ${config.lastRunAt ? `<t:${Math.floor(config.lastRunAt.getTime() / 1000)}:R>` : "never"}`
        : "Automatic games are not configured.", ephemeral: true });
      return;
    }
    if (!config?.enabled) return void await i.reply({ content: "Configure automatic games first with `/auto-games setup`.", ephemeral: true });
    await i.deferReply({ ephemeral: true });
    const result = await launchAutoGame(i.client, i.guildId!);
    await i.editReply(result.ok ? "The next automatic activity has started." : result.reason ?? "The automatic activity could not start.");
  }
}];
