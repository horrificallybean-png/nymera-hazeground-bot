import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type SlashCommandStringOption,
  userMention
} from "discord.js";
import type { Command } from "../types.js";
import { ensureGuild, prisma } from "../database.js";

const reasonOption = (o: SlashCommandStringOption) => o.setName("reason").setDescription("Reason").setMaxLength(500);
const target = (builder: SlashCommandBuilder) => builder.addUserOption(o => o.setName("user").setDescription("Member").setRequired(true));

export const moderationCommands: Command[] = [
  {
    data: target(new SlashCommandBuilder().setName("ban").setDescription("Ban a member").setDefaultMemberPermissions(PermissionFlagsBits.BanMembers))
      .addStringOption(reasonOption),
    async execute(i) {
      const user = i.options.getUser("user", true);
      await i.guild!.members.ban(user, { reason: i.options.getString("reason") ?? `By ${i.user.tag}` });
      await i.reply(`Banned ${userMention(user.id)}.`);
    }
  },
  {
    data: target(new SlashCommandBuilder().setName("kick").setDescription("Kick a member").setDefaultMemberPermissions(PermissionFlagsBits.KickMembers))
      .addStringOption(reasonOption),
    async execute(i) {
      const member = await i.guild!.members.fetch(i.options.getUser("user", true).id);
      await member.kick(i.options.getString("reason") ?? `By ${i.user.tag}`);
      await i.reply(`Kicked ${userMention(member.id)}.`);
    }
  },
  {
    data: target(new SlashCommandBuilder().setName("timeout").setDescription("Timeout a member").setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers))
      .addIntegerOption(o => o.setName("minutes").setDescription("Minutes (0 removes timeout)").setRequired(true).setMinValue(0).setMaxValue(40320))
      .addStringOption(reasonOption),
    async execute(i) {
      const member = await i.guild!.members.fetch(i.options.getUser("user", true).id);
      const minutes = i.options.getInteger("minutes", true);
      await member.timeout(minutes ? minutes * 60_000 : null, i.options.getString("reason") ?? `By ${i.user.tag}`);
      await i.reply(minutes ? `Timed out ${userMention(member.id)} for ${minutes} minute(s).` : `Removed timeout from ${userMention(member.id)}.`);
    }
  },
  {
    data: target(new SlashCommandBuilder().setName("warn").setDescription("Warn a member").setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers))
      .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true).setMaxLength(500)),
    async execute(i) {
      const user = i.options.getUser("user", true);
      await ensureGuild(i.guildId!);
      await prisma.warning.create({ data: { guildId: i.guildId!, userId: user.id, moderatorId: i.user.id, reason: i.options.getString("reason", true) } });
      await i.reply(`Warned ${userMention(user.id)}.`);
    }
  },
  {
    data: target(new SlashCommandBuilder().setName("warnings").setDescription("List a member's warnings").setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)),
    async execute(i) {
      const user = i.options.getUser("user", true);
      const rows = await prisma.warning.findMany({ where: { guildId: i.guildId!, userId: user.id }, orderBy: { createdAt: "desc" }, take: 10 });
      await i.reply({ content: rows.length ? rows.map(w => `#${w.id} • ${w.reason} • <@${w.moderatorId}>`).join("\n") : "No warnings.", ephemeral: true });
    }
  },
  {
    data: new SlashCommandBuilder().setName("purge").setDescription("Delete recent messages").setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .addIntegerOption(o => o.setName("amount").setDescription("1–100").setRequired(true).setMinValue(1).setMaxValue(100)),
    async execute(i) {
      if (!i.channel || i.channel.type !== ChannelType.GuildText) return void await i.reply({ content: "Use this in a text channel.", ephemeral: true });
      const deleted = await i.channel.bulkDelete(i.options.getInteger("amount", true), true);
      await i.reply({ content: `Deleted ${deleted.size} messages.`, ephemeral: true });
    }
  },
  {
    data: new SlashCommandBuilder().setName("slowmode").setDescription("Set channel slowmode").setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
      .addIntegerOption(o => o.setName("seconds").setDescription("0–21600").setRequired(true).setMinValue(0).setMaxValue(21600)),
    async execute(i) {
      if (!i.channel || !("setRateLimitPerUser" in i.channel)) return void await i.reply({ content: "Unsupported channel.", ephemeral: true });
      await i.channel.setRateLimitPerUser(i.options.getInteger("seconds", true), `By ${i.user.tag}`);
      await i.reply("Slowmode updated.");
    }
  },
  ...(["lock", "unlock"] as const).map((name): Command => ({
    data: new SlashCommandBuilder().setName(name).setDescription(`${name === "lock" ? "Lock" : "Unlock"} this channel`).setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    async execute(i) {
      if (!i.channel || !("permissionOverwrites" in i.channel)) return void await i.reply({ content: "Unsupported channel.", ephemeral: true });
      await i.channel.permissionOverwrites.edit(i.guild!.roles.everyone, { SendMessages: name === "lock" ? false : null });
      await i.reply(`Channel ${name === "lock" ? "locked" : "unlocked"}.`);
    }
  }))
];
