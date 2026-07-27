import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { prisma } from "../database.js";
import { launchAutoGame } from "../services/auto-games.js";
import { aiConfigured, testAutoGameAi } from "../services/ai.js";
export const autoGameCommands = [{
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
            .addSubcommand(s => s.setName("start-now").setDescription("Start the next game immediately")),
        async execute(i) {
            const sub = i.options.getSubcommand();
            if (sub === "setup") {
                const channel = i.options.getChannel("channel", true);
                const minutes = i.options.getInteger("minutes") ?? 90;
                const answerMinutes = i.options.getInteger("answer_minutes") ?? 5;
                const pingRole = i.options.getRole("ping_role");
                await prisma.autoGameConfig.upsert({
                    where: { guildId: i.guildId },
                    update: {
                        channelId: channel.id,
                        intervalMinutes: minutes,
                        answerSeconds: answerMinutes * 60,
                        pingRoleId: pingRole?.id ?? null,
                        enabled: true,
                        lastRunAt: new Date()
                    },
                    create: {
                        guildId: i.guildId,
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
                await prisma.autoGameConfig.updateMany({ where: { guildId: i.guildId }, data: { enabled: false } });
                await i.reply({ content: "Nymera's automatic activity host is disabled.", ephemeral: true });
                return;
            }
            if (sub === "ai-test") {
                await i.deferReply({ ephemeral: true });
                const result = await testAutoGameAi();
                if (result.result === "success") {
                    await i.editReply("✅ AI activity generation is connected to the configured OpenAI model. Trivia, polls, word games, riddles, encounters, treasure hunts, reaction races, counting themes, Hangman, and flash giveaways can all receive fresh AI content.");
                }
                else if (!result.configured || result.result === "not_configured") {
                    await i.editReply("AI-generated trivia is disabled because `OPENAI_API_KEY` is missing. Automatic games still work using built-in questions.");
                }
                else {
                    await i.editReply(`AI trivia could not reach OpenAI, so Nymera will safely use built-in questions.\nReason: \`${result.error ?? "Unknown OpenAI error"}\``);
                }
                return;
            }
            const config = await prisma.autoGameConfig.findUnique({ where: { guildId: i.guildId } });
            if (sub === "status") {
                await i.reply({ content: config
                        ? `Status: **${config.enabled ? "enabled" : "disabled"}**\nChannel: <#${config.channelId}>\nInterval: ${config.intervalMinutes} minutes\nAnswer window: ${Math.ceil(config.answerSeconds / 60)} minutes\nGame-interest role pings: **automatic**\nExtra ping role: ${config.pingRoleId ? `<@&${config.pingRoleId}>` : "none"}\nAI activity generation: **${aiConfigured ? "configured" : "using built-in fallback"}**\nLast game: ${config.lastRunAt ? `<t:${Math.floor(config.lastRunAt.getTime() / 1000)}:R>` : "never"}`
                        : "Automatic games are not configured.", ephemeral: true });
                return;
            }
            if (!config?.enabled)
                return void await i.reply({ content: "Configure automatic games first with `/auto-games setup`.", ephemeral: true });
            await i.deferReply({ ephemeral: true });
            const result = await launchAutoGame(i.client, i.guildId);
            await i.editReply(result.ok ? "The next automatic activity has started." : result.reason ?? "The automatic activity could not start.");
        }
    }];
