import {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  channelMention,
  roleMention
} from "discord.js";
import cron from "node-cron";
import type { Command } from "../types.js";
import { ensureGuild, prisma } from "../database.js";

const mentalHealthMarker = "🌿 **Gentle Mental Health Check-In**";

function mentalHealthContent(roleId?: string) {
  return `${roleId ? `${roleMention(roleId)}\n\n` : ""}${mentalHealthMarker}

How are you feeling today?

🟢 I’m doing well
🟡 I’m managing
🟠 I’m struggling
🔴 I could use support
💜 I’d rather not say, but I’m here

Take a breath, drink some water, and be kind to yourself. You never have to share more than you’re comfortable sharing. If you need support, please reach out to someone you trust or a qualified professional.`;
}

async function saveMentalHealthSchedule(input: {
  guildId: string;
  channelId: string;
  roleId?: string;
  hour: number;
  timezone: string;
}) {
  await prisma.$transaction([
    prisma.scheduledPost.deleteMany({
      where: { guildId: input.guildId, content: { contains: mentalHealthMarker } }
    }),
    prisma.scheduledPost.create({
      data: {
        guildId: input.guildId,
        channelId: input.channelId,
        content: mentalHealthContent(input.roleId),
        cron: `0 ${input.hour} * * *`,
        timezone: input.timezone
      }
    })
  ]);
}

function validTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

export const configurationCommands: Command[] = [
  {
    data: new SlashCommandBuilder().setName("setup").setDescription("Configure Nymera's server features").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addChannelOption(o => o.setName("welcome_channel").setDescription("Welcome messages").addChannelTypes(ChannelType.GuildText))
      .addChannelOption(o => o.setName("goodbye_channel").setDescription("Goodbye messages").addChannelTypes(ChannelType.GuildText))
      .addChannelOption(o => o.setName("log_channel").setDescription("Audit logs").addChannelTypes(ChannelType.GuildText))
      .addRoleOption(o => o.setName("auto_role").setDescription("Role assigned on join"))
      .addChannelOption(o => o.setName("scheduled_channel").setDescription("Daily scheduled posts").addChannelTypes(ChannelType.GuildText))
      .addBooleanOption(o => o.setName("ai_enabled").setDescription("Enable /ask and mention replies"))
      .addBooleanOption(o => o.setName("automod_enabled").setDescription("Enable basic automod"))
      .addBooleanOption(o => o.setName("block_invites").setDescription("Delete Discord invite links"))
      .addChannelOption(o => o.setName("ticket_category").setDescription("Category for support tickets").addChannelTypes(ChannelType.GuildCategory))
      .addChannelOption(o => o.setName("starboard_channel").setDescription("Starboard destination").addChannelTypes(ChannelType.GuildText))
      .addIntegerOption(o => o.setName("starboard_threshold").setDescription("Stars required").setMinValue(1).setMaxValue(25)),
    async execute(i) {
      await ensureGuild(i.guildId!);
      const data = {
        welcomeChannelId: i.options.getChannel("welcome_channel")?.id,
        goodbyeChannelId: i.options.getChannel("goodbye_channel")?.id,
        logChannelId: i.options.getChannel("log_channel")?.id,
        autoRoleId: i.options.getRole("auto_role")?.id,
        scheduledChannelId: i.options.getChannel("scheduled_channel")?.id,
        aiEnabled: i.options.getBoolean("ai_enabled") ?? undefined,
        automodEnabled: i.options.getBoolean("automod_enabled") ?? undefined,
        blockInvites: i.options.getBoolean("block_invites") ?? undefined,
        ticketCategoryId: i.options.getChannel("ticket_category")?.id,
        starboardChannelId: i.options.getChannel("starboard_channel")?.id,
        starboardThreshold: i.options.getInteger("starboard_threshold") ?? undefined
      };
      await prisma.guildConfig.update({ where: { guildId: i.guildId! }, data });
      await i.reply({ content: "Nymera's server settings were updated.", ephemeral: true });
    }
  },
  {
    data: new SlashCommandBuilder().setName("settings").setDescription("View Nymera's server configuration").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(i) {
      const c = await ensureGuild(i.guildId!);
      const showChannel = (id: string | null) => id ? channelMention(id) : "Not set";
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x6f42c1).setTitle("Nymera settings").addFields(
        { name: "Welcome", value: showChannel(c.welcomeChannelId), inline: true },
        { name: "Goodbye", value: showChannel(c.goodbyeChannelId), inline: true },
        { name: "Logs", value: showChannel(c.logChannelId), inline: true },
        { name: "Auto role", value: c.autoRoleId ? roleMention(c.autoRoleId) : "Not set", inline: true },
        { name: "Scheduled posts", value: showChannel(c.scheduledChannelId), inline: true },
        { name: "Ticket category", value: showChannel(c.ticketCategoryId), inline: true },
        { name: "Starboard", value: `${showChannel(c.starboardChannelId)} • ${c.starboardThreshold} stars`, inline: true },
        { name: "AI / Automod / Invites", value: `${c.aiEnabled ? "On" : "Off"} / ${c.automodEnabled ? "On" : "Off"} / ${c.blockInvites ? "Blocked" : "Allowed"}` }
      )], ephemeral: true });
    }
  },
  {
    data: new SlashCommandBuilder().setName("schedule").setDescription("Create a repeating scheduled post").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addChannelOption(o => o.setName("channel").setDescription("Destination").addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addStringOption(o => o.setName("cron").setDescription("Cron, e.g. 0 14 * * *").setRequired(true))
      .addStringOption(o => o.setName("content").setDescription("Post text").setRequired(true).setMaxLength(1800))
      .addStringOption(o => o.setName("timezone").setDescription("IANA zone, e.g. America/Denver")),
    async execute(i) {
      const expression = i.options.getString("cron", true);
      if (!cron.validate(expression)) return void await i.reply({ content: "That cron expression is invalid.", ephemeral: true });
      await prisma.scheduledPost.create({ data: {
        guildId: i.guildId!,
        channelId: i.options.getChannel("channel", true).id,
        cron: expression,
        content: i.options.getString("content", true),
        timezone: i.options.getString("timezone") ?? "America/Denver"
      } });
      await i.reply({ content: "Scheduled post saved. Restart the bot to load the new schedule.", ephemeral: true });
    }
  },
  {
    data: new SlashCommandBuilder().setName("mental-health-checkin").setDescription("Schedule a gentle daily mental-health check-in")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addChannelOption(o => o.setName("channel").setDescription("Where to post the daily check-in").setRequired(true).addChannelTypes(ChannelType.GuildText))
      .addRoleOption(o => o.setName("ping_role").setDescription("Optional role to notify"))
      .addIntegerOption(o => o.setName("hour").setDescription("Posting hour, 0–23 (default: 15 for 3 PM)").setMinValue(0).setMaxValue(23))
      .addStringOption(o => o.setName("timezone").setDescription("IANA timezone (default: America/Denver)")),
    async execute(i) {
      const channel = i.options.getChannel("channel", true);
      const role = i.options.getRole("ping_role");
      const hour = i.options.getInteger("hour") ?? 15;
      const timezone = i.options.getString("timezone") ?? "America/Denver";
      if (!validTimezone(timezone)) {
        return void await i.reply({
          content: "That timezone is invalid. Try one such as `America/Denver`.",
          ephemeral: true
        });
      }
      await saveMentalHealthSchedule({
        guildId: i.guildId!,
        channelId: channel.id,
        roleId: role?.id,
        hour,
        timezone
      });
      await i.reply({
        content: `Daily mental-health check-in scheduled in ${channel} at **${hour.toString().padStart(2, "0")}:00** (${timezone}). Restart Nymera once to activate it.`,
        ephemeral: true
      });
    }
  },
  {
    data: new SlashCommandBuilder().setName("mental-health-space").setDescription("Create a wellness category, check-in channel, and daily post")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
      .addRoleOption(o => o.setName("ping_role").setDescription("Optional role to notify"))
      .addIntegerOption(o => o.setName("hour").setDescription("Posting hour, 0–23 (default: 15 for 3 PM)").setMinValue(0).setMaxValue(23))
      .addStringOption(o => o.setName("timezone").setDescription("IANA timezone (default: America/Denver)")),
    async execute(i) {
      const timezone = i.options.getString("timezone") ?? "America/Denver";
      if (!validTimezone(timezone)) {
        return void await i.reply({
          content: "That timezone is invalid. Try one such as `America/Denver`.",
          ephemeral: true
        });
      }
      await i.deferReply({ ephemeral: true });
      const guild = i.guild!;
      const categoryName = "Mental Health & Wellness";
      const channelName = "mental-health-check-in";
      let category = guild.channels.cache.find(channel =>
        channel.type === ChannelType.GuildCategory && channel.name === categoryName
      );
      category ??= await guild.channels.create({
        name: categoryName,
        type: ChannelType.GuildCategory,
        reason: `Mental-health space created by ${i.user.tag}`
      });
      let channel = guild.channels.cache.find(candidate =>
        candidate.type === ChannelType.GuildText &&
        candidate.name === channelName &&
        candidate.parentId === category!.id
      );
      channel ??= await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: category.id,
        topic: "A gentle community check-in space. Peer support is not a substitute for professional care.",
        reason: `Mental-health space created by ${i.user.tag}`
      });
      const hour = i.options.getInteger("hour") ?? 15;
      await saveMentalHealthSchedule({
        guildId: guild.id,
        channelId: channel.id,
        roleId: i.options.getRole("ping_role")?.id,
        hour,
        timezone
      });
      await i.editReply(
        `Created **${categoryName}** with ${channel}. The daily check-in is set for **${hour.toString().padStart(2, "0")}:00** (${timezone}). Restart Nymera once to activate it.`
      );
    }
  }
];
