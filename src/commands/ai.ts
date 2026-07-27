import { ChannelType, EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.js";
import { askNymera } from "../services/ai.js";
import { trimDiscord } from "../utils/respond.js";
import { ensureGuild, prisma } from "../database.js";
import { postConversationStarter } from "../services/conversation-starters.js";

export const aiCommands: Command[] = [{
  data: new SlashCommandBuilder().setName("ask").setDescription("Ask Nymera a question")
    .addStringOption(o => o.setName("question").setDescription("What would you like to ask?").setRequired(true).setMaxLength(1500)),
  async execute(i) {
    if (!i.guildId || !i.channelId) return void await i.reply({ content: "Use this in a server channel.", ephemeral: true });
    await i.deferReply();
    const answer = await askNymera({
      guildId: i.guildId,
      channelId: i.channelId,
      userId: i.user.id,
      prompt: i.options.getString("question", true)
    });
    await i.editReply(trimDiscord(answer));
  }
},
{
  data: new SlashCommandBuilder().setName("ai-settings").setDescription("Configure Nymera's AI personality and safety features")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o => o.setName("mode").setDescription("Conversation personality").addChoices(
      { name: "Mystic", value: "mystic" },
      { name: "Friendly", value: "friendly" },
      { name: "Gothic Horror", value: "horror" },
      { name: "Dead by Daylight", value: "dbd" },
      { name: "Community Guide", value: "guide" }
    ))
    .addBooleanOption(o => o.setName("auto_replies").setDescription("Let Nymera occasionally join conversation"))
    .addChannelOption(o => o.setName("conversation_channel").setDescription("Channel where Nymera may join ordinary conversation").addChannelTypes(ChannelType.GuildText))
    .addIntegerOption(o => o.setName("reply_chance").setDescription("Percent chance to join an eligible message").setMinValue(1).setMaxValue(100))
    .addIntegerOption(o => o.setName("cooldown_minutes").setDescription("Minimum minutes between automatic replies").setMinValue(1).setMaxValue(60))
    .addBooleanOption(o => o.setName("start_conversations").setDescription("Let Nymera post new conversation starters"))
    .addIntegerOption(o => o.setName("starter_minutes").setDescription("Minutes between conversation starters").setMinValue(30).setMaxValue(1440))
    .addBooleanOption(o => o.setName("ai_moderation").setDescription("Send AI suggestions to a staff review channel"))
    .addChannelOption(o => o.setName("review_channel").setDescription("Private staff channel for AI suggestions").addChannelTypes(ChannelType.GuildText)),
  async execute(i) {
    const current = await ensureGuild(i.guildId!);
    const mode = i.options.getString("mode") ?? current.aiMode;
    const autoReplies = i.options.getBoolean("auto_replies") ?? current.aiAutoReplyEnabled;
    const chance = i.options.getInteger("reply_chance") ?? current.aiAutoReplyChance;
    const conversationChannel = i.options.getChannel("conversation_channel");
    const cooldownMinutes = i.options.getInteger("cooldown_minutes") ?? current.aiAutoReplyCooldownMinutes;
    const startConversations = i.options.getBoolean("start_conversations") ?? current.aiConversationStarterEnabled;
    const starterMinutes = i.options.getInteger("starter_minutes") ?? current.aiConversationStarterMinutes;
    const aiModeration = i.options.getBoolean("ai_moderation") ?? current.aiModerationEnabled;
    const reviewChannel = i.options.getChannel("review_channel");
    const updated = await prisma.guildConfig.update({
      where: { guildId: i.guildId! },
      data: {
        aiMode: mode,
        aiAutoReplyEnabled: autoReplies,
        aiAutoReplyChance: chance,
        aiConversationChannelId: conversationChannel?.id ?? current.aiConversationChannelId,
        aiAutoReplyCooldownMinutes: cooldownMinutes,
        aiConversationStarterEnabled: startConversations,
        aiConversationStarterMinutes: starterMinutes,
        aiModerationEnabled: aiModeration,
        aiReviewChannelId: reviewChannel?.id ?? current.aiReviewChannelId
      }
    });
    await i.reply({ embeds: [new EmbedBuilder().setColor(0x6f42c1).setTitle("Nymera AI Settings").addFields(
      { name: "Mode", value: updated.aiMode, inline: true },
      { name: "Conversation engagement", value: updated.aiAutoReplyEnabled
        ? `${updated.aiAutoReplyChance}% chance in ${updated.aiConversationChannelId ? `<#${updated.aiConversationChannelId}>` : "question channels"} • ${updated.aiAutoReplyCooldownMinutes}m cooldown`
        : "Off", inline: true },
      { name: "Conversation starters", value: updated.aiConversationStarterEnabled
        ? `Every ${updated.aiConversationStarterMinutes} minutes in ${updated.aiConversationChannelId ? `<#${updated.aiConversationChannelId}>` : "channel not set"}`
        : "Off", inline: true },
      { name: "AI moderation", value: updated.aiModerationEnabled ? `Suggestions → ${updated.aiReviewChannelId ? `<#${updated.aiReviewChannelId}>` : "review channel not set"}` : "Off" }
    )], ephemeral: true });
  }
},
{
  data: new SlashCommandBuilder().setName("conversation-start").setDescription("Test or inspect Nymera's automatic conversation starters")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName("now").setDescription("Post a conversation starter immediately"))
    .addSubcommand(s => s.setName("status").setDescription("Show configuration and the next scheduled starter")),
  async execute(i, client) {
    const config = await ensureGuild(i.guildId!);
    if (i.options.getSubcommand() === "status") {
      const dueAt = (config.aiConversationStarterLastAt?.getTime() ?? config.updatedAt.getTime()) +
        config.aiConversationStarterMinutes * 60_000;
      await i.reply({
        content: `AI: **${config.aiEnabled ? "enabled" : "disabled"}**\n` +
          `Starters: **${config.aiConversationStarterEnabled ? "enabled" : "disabled"}**\n` +
          `Channel: ${config.aiConversationChannelId ? `<#${config.aiConversationChannelId}>` : "**not configured**"}\n` +
          `Interval: **${config.aiConversationStarterMinutes} minutes**\n` +
          `Last starter: ${config.aiConversationStarterLastAt ? `<t:${Math.floor(config.aiConversationStarterLastAt.getTime() / 1000)}:R>` : "never"}\n` +
          `Next starter: ${config.aiConversationStarterEnabled ? `<t:${Math.floor(dueAt / 1000)}:R>` : "not scheduled"}`,
        ephemeral: true
      });
      return;
    }
    await i.deferReply({ ephemeral: true });
    const result = await postConversationStarter(client, i.guildId!);
    await i.editReply(result.ok ? "Nymera started a conversation in the configured channel." : result.reason ?? "Nymera could not start the conversation.");
  }
},
{
  data: new SlashCommandBuilder().setName("ai-memory").setDescription("Control your optional long-term AI memory")
    .addSubcommand(s => s.setName("enable").setDescription("Allow Nymera to remember stable details you share"))
    .addSubcommand(s => s.setName("disable").setDescription("Stop updating your long-term memory"))
    .addSubcommand(s => s.setName("view").setDescription("View what Nymera remembers about you"))
    .addSubcommand(s => s.setName("forget").setDescription("Permanently erase your long-term memory")),
  async execute(i) {
    const key = { guildId_userId: { guildId: i.guildId!, userId: i.user.id } };
    const sub = i.options.getSubcommand();
    if (sub === "forget") {
      await prisma.aiUserMemory.deleteMany({ where: { guildId: i.guildId!, userId: i.user.id } });
      await i.reply({ content: "Your long-term Nymera memory has been permanently erased.", ephemeral: true });
      return;
    }
    if (sub === "view") {
      const memory = await prisma.aiUserMemory.findUnique({ where: key });
      await i.reply({ content: memory?.summary || "Nymera has no long-term memory saved for you.", ephemeral: true });
      return;
    }
    const enabled = sub === "enable";
    await prisma.aiUserMemory.upsert({
      where: key,
      update: { enabled },
      create: { guildId: i.guildId!, userId: i.user.id, enabled }
    });
    await i.reply({
      content: enabled
        ? "Long-term memory enabled. Nymera may remember stable details you intentionally share. Use `/ai-memory forget` at any time."
        : "Long-term memory disabled. Existing memory is retained but will not update; use `/ai-memory forget` to erase it.",
      ephemeral: true
    });
  }
}];
