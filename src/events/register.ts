import { EmbedBuilder, Events, type Client, type Message } from "discord.js";
import { commandMap, commands } from "../commands/index.js";
import { env } from "../config.js";
import { ensureGuild, prisma } from "../database.js";
import { logger } from "../logger.js";
import { askNymera, createModerationSuggestion, looksReviewable } from "../services/ai.js";
import { runAutomod } from "../services/automod.js";
import { registerLogging, sendGuildLog } from "../services/logging.js";
import { startScheduler } from "../services/scheduler.js";
import { trimDiscord } from "../utils/respond.js";
import { applyLevelRewards, recordMessage, seedGuildEconomy } from "../services/economy.js";
import { startGiveawayMonitor } from "../services/community.js";
import { startAutoGameMonitor } from "../services/auto-games.js";
import { startReminderMonitor } from "../services/reminders.js";
import { startBackupMonitor } from "../services/backups.js";

const xpCooldowns = new Map<string, number>();
const autoReplyCooldowns = new Map<string, number>();

async function sendAiModerationReview(message: Message, trigger: string) {
  if (!message.guild) return;
  const config = await prisma.guildConfig.findUnique({ where: { guildId: message.guild.id } });
  if (!config?.aiModerationEnabled || !config.aiReviewChannelId) return;
  const suggestion = await createModerationSuggestion(message.content, trigger);
  if (!suggestion) return;
  const channel = await message.guild.channels.fetch(config.aiReviewChannelId).catch(() => null);
  if (!channel || !("send" in channel)) return;
  await channel.send({ embeds: [new EmbedBuilder()
    .setColor(suggestion.risk === "high" ? 0xe74c3c : suggestion.risk === "medium" ? 0xf39c12 : 0x3498db)
    .setTitle(`AI moderation suggestion • ${suggestion.risk.toUpperCase()} risk`)
    .setDescription(`**Category:** ${suggestion.category}\n**Reason:** ${suggestion.reason}\n**Suggestion:** ${suggestion.recommendation}`)
    .addFields(
      { name: "Member", value: `${message.author.tag} (${message.author.id})` },
      { name: "Message", value: message.content.slice(0, 1000) || "*No text*" },
      { name: "Human review required", value: "Nymera took no AI moderation action. Staff must review context and decide." }
    )
    .setFooter({ text: `Trigger: ${trigger}` })
    .setTimestamp()] }).catch(() => undefined);
}

export function registerEvents(client: Client) {
  client.once(Events.ClientReady, async ready => {
    logger.info({ user: ready.user.tag, guilds: ready.guilds.cache.size }, "Nymera is ready");
    void (async () => {
      const definitions = commands.map(command => command.data.toJSON());
      if (env.DISCORD_GUILD_ID) {
        const configuredGuild = ready.guilds.cache.get(env.DISCORD_GUILD_ID);
        const guild = configuredGuild ?? (ready.guilds.cache.size === 1 ? ready.guilds.cache.first() : undefined);
        if (!guild) throw new Error(`Configured guild ${env.DISCORD_GUILD_ID} is not available to Nymera`);
        if (!configuredGuild) {
          logger.warn({
            configuredGuildId: env.DISCORD_GUILD_ID,
            selectedGuildId: guild.id
          }, "Configured guild was unavailable; using Nymera's only connected guild");
        }
        await guild.commands.set(definitions);
      } else {
        await ready.application.commands.set(definitions);
      }
      logger.info({
        scope: env.DISCORD_GUILD_ID ? "guild" : "global",
        commands: definitions.length
      }, "Slash commands synchronized");
    })().catch(error => {
      const details = error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : { error: String(error) };
      console.error("Slash command synchronization failed:", details);
      logger.error({ err: error }, "Slash command synchronization failed");
    });
    await startScheduler(client);
    startGiveawayMonitor(client);
    startAutoGameMonitor(client);
    startReminderMonitor(client);
    startBackupMonitor();
    for (const guild of ready.guilds.cache.values()) await seedGuildEconomy(guild.id);
  });

  client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isButton() && interaction.customId.startsWith("rolebutton:")) {
      try {
        if (!interaction.guildId || !interaction.guild || !interaction.message) return;
        await interaction.deferReply({ ephemeral: true });
        const roleId = interaction.customId.slice("rolebutton:".length);
        const mapping = await prisma.reactionRole.findUnique({
          where: {
            guildId_messageId_emoji: {
              guildId: interaction.guildId,
              messageId: interaction.message.id,
              emoji: `button:${roleId}`
            }
          }
        });
        if (!mapping || mapping.roleId !== roleId) {
          await interaction.editReply("That role button is no longer configured.");
          return;
        }
        const member = await interaction.guild.members.fetch(interaction.user.id);
        if (member.roles.cache.has(roleId)) {
          await member.roles.remove(roleId, "Nymera role button");
          await interaction.editReply(`Removed <@&${roleId}>.`);
        } else {
          await member.roles.add(roleId, "Nymera role button");
          await interaction.editReply(`Added <@&${roleId}>.`);
        }
      } catch (error) {
        logger.error({ error, guildId: interaction.guildId, userId: interaction.user.id }, "Role button failed");
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply("I could not change that role. Make sure Nymera's role is above it.").catch(() => undefined);
        }
      }
      return;
    }
    if (!interaction.isChatInputCommand()) return;
    const command = commandMap.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction, client);
    } catch (error) {
      logger.error({ error, command: interaction.commandName, guildId: interaction.guildId }, "Command failed");
      const payload = { content: "The mist stirred unexpectedly. Please try again; administrators can check the bot logs.", ephemeral: true };
      if (interaction.deferred || interaction.replied) await interaction.editReply({ content: payload.content }).catch(() => undefined);
      else await interaction.reply(payload).catch(() => undefined);
    }
  });

  client.on(Events.GuildMemberAdd, async member => {
    const c = await ensureGuild(member.guild.id);
    if (c.autoRoleId) await member.roles.add(c.autoRoleId, "Nymera autorole").catch(() => undefined);
    if (c.welcomeChannelId) {
      const channel = await member.guild.channels.fetch(c.welcomeChannelId).catch(() => null);
      if (channel && "send" in channel) await channel.send(`Welcome to **${member.guild.name}**, ${member}. The mist has made room for you.`);
    }
    await sendGuildLog(member.guild, "Member joined", `${member.user.tag} (${member.id})`);
  });

  client.on(Events.GuildMemberRemove, async member => {
    const c = await ensureGuild(member.guild.id);
    if (c.goodbyeChannelId) {
      const channel = await member.guild.channels.fetch(c.goodbyeChannelId).catch(() => null);
      if (channel && "send" in channel) await channel.send(`**${member.user.tag}** has departed into the mist.`);
    }
    await sendGuildLog(member.guild, "Member left", `${member.user.tag} (${member.id})`);
  });

  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (user.bot) return;
    try {
      if (reaction.partial) await reaction.fetch();
      if (reaction.message.partial) await reaction.message.fetch();
      const guild = reaction.message.guild;
      if (!guild) return;
      const emoji = reaction.emoji.id ?? reaction.emoji.name ?? "";
      const mapping = await prisma.reactionRole.findUnique({
        where: { guildId_messageId_emoji: { guildId: guild.id, messageId: reaction.message.id, emoji } }
      });
      if (mapping) {
        const member = await guild.members.fetch(user.id);
        await member.roles.add(mapping.roleId, "Nymera reaction role");
      }
      if (reaction.emoji.name !== "⭐") return;
      const config = await ensureGuild(guild.id);
      const stars = reaction.count ?? 0;
      if (!config.starboardChannelId || stars < config.starboardThreshold) return;
      const target = await guild.channels.fetch(config.starboardChannelId).catch(() => null);
      if (!target || !("send" in target) || !reaction.message.author) return;
      const existing = await prisma.starboardEntry.findUnique({
        where: { guildId_sourceMessageId: { guildId: guild.id, sourceMessageId: reaction.message.id } }
      });
      const content = `⭐ **${stars}** • ${reaction.message.channel} • [Jump to message](${reaction.message.url})`;
      const embed = new (await import("discord.js")).EmbedBuilder().setColor(0xf1c40f)
        .setAuthor({ name: reaction.message.author.tag, iconURL: reaction.message.author.displayAvatarURL() })
        .setDescription((reaction.message.content || "*Attachment or embed*").slice(0, 4000))
        .setTimestamp(reaction.message.createdAt);
      if (reaction.message.attachments.first()?.url) embed.setImage(reaction.message.attachments.first()!.url);
      if (existing) {
        const posted = await target.messages.fetch(existing.starboardMessageId).catch(() => null);
        if (posted) await posted.edit({ content, embeds: [embed] });
        await prisma.starboardEntry.update({ where: { guildId_sourceMessageId: { guildId: guild.id, sourceMessageId: reaction.message.id } }, data: { stars } });
      } else {
        const posted = await target.send({ content, embeds: [embed] });
        await prisma.starboardEntry.create({ data: {
          guildId: guild.id, sourceMessageId: reaction.message.id, sourceChannelId: reaction.message.channelId,
          starboardMessageId: posted.id, authorId: reaction.message.author.id, stars
        } });
      }
    } catch (error) {
      logger.error({ error }, "Reaction add handler failed");
    }
  });

  client.on(Events.MessageReactionRemove, async (reaction, user) => {
    if (user.bot) return;
    try {
      if (reaction.partial) await reaction.fetch();
      const guild = reaction.message.guild;
      if (!guild) return;
      const emoji = reaction.emoji.id ?? reaction.emoji.name ?? "";
      const mapping = await prisma.reactionRole.findUnique({
        where: { guildId_messageId_emoji: { guildId: guild.id, messageId: reaction.message.id, emoji } }
      });
      if (mapping) {
        const member = await guild.members.fetch(user.id);
        await member.roles.remove(mapping.roleId, "Nymera reaction role removed");
      }
    } catch (error) {
      logger.error({ error }, "Reaction remove handler failed");
    }
  });

  client.on(Events.MessageCreate, async message => {
    try {
      const automodAction = await runAutomod(message);
      if (automodAction) {
        void sendAiModerationReview(message, "basic automod action");
        return;
      }
      if (message.guild && !message.author.bot && message.content.trim().length >= 3) {
        const key = `${message.guild.id}:${message.author.id}`;
        const now = Date.now();
        if (now - (xpCooldowns.get(key) ?? 0) >= 60_000) {
          xpCooldowns.set(key, now);
          const result = await recordMessage(message.guild.id, message.author.id);
          if (result.leveledUp && message.member) {
            const granted = await applyLevelRewards(message.guild, message.member, result.level).catch(error => {
              logger.error({ error, guildId: message.guildId, userId: message.author.id }, "Level reward role failed");
              return [];
            });
            const config = await ensureGuild(message.guild.id);
            if (config.levelUpEnabled) {
              const target = config.levelUpChannelId
                ? await message.guild.channels.fetch(config.levelUpChannelId).catch(() => null)
                : message.channel;
              if (target && "send" in target) {
                const roles = granted.length ? ` You unlocked ${granted.map(id => `<@&${id}>`).join(", ")}.` : "";
                await target.send(
                  `✨ ${message.author}, you reached **level ${result.level}** and earned **${result.reward} Spellmarks**!${roles}`
                ).catch(() => undefined);
              }
            }
          }
        }
      }
      if (!message.guild || message.author.bot || !client.user) return;
      const c = await ensureGuild(message.guild.id);
      if (c.aiModerationEnabled && looksReviewable(message.content)) {
        void sendAiModerationReview(message, "AI review heuristic");
      }
      const mentioned = message.mentions.has(client.user);
      const eligibleAutoReply = !mentioned &&
        c.aiEnabled &&
        c.aiAutoReplyEnabled &&
        message.content.trim().endsWith("?") &&
        Math.random() * 100 < c.aiAutoReplyChance &&
        Date.now() - (autoReplyCooldowns.get(message.channel.id) ?? 0) >= 5 * 60_000;
      if (!mentioned && !eligibleAutoReply) return;
      if (!c.aiEnabled) return;
      if (eligibleAutoReply) autoReplyCooldowns.set(message.channel.id, Date.now());
      const prompt = message.content.replace(new RegExp(`<@!?${client.user.id}>`, "g"), "").trim();
      if (!prompt) return void await message.reply("You called through the mist?");
      await message.channel.sendTyping();
      const answer = await askNymera({ guildId: message.guild.id, channelId: message.channel.id, userId: message.author.id, prompt });
      await message.reply(trimDiscord(answer));
    } catch (error) {
      logger.error({ error, guildId: message.guildId }, "Message handler failed");
    }
  });

  registerLogging(client);
}
