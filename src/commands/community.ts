import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder,
  PermissionFlagsBits, SlashCommandBuilder
} from "discord.js";
import type { Command } from "../types.js";
import { ensureGuild, prisma } from "../database.js";
import { endGiveaway, giveawayEmbed, parseDuration } from "../services/community.js";

export const communityCommands: Command[] = [
  {
    data: new SlashCommandBuilder().setName("ticket").setDescription("Open or manage a support ticket")
      .addSubcommand(s => s.setName("open").setDescription("Open a private ticket")
        .addStringOption(o => o.setName("subject").setDescription("How can staff help?").setRequired(true).setMaxLength(300)))
      .addSubcommand(s => s.setName("close").setDescription("Close the current ticket"))
      .addSubcommand(s => s.setName("add").setDescription("Add a member to this ticket")
        .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))),
    async execute(i) {
      const sub = i.options.getSubcommand();
      if (sub === "open") {
        const config = await ensureGuild(i.guildId!);
        const existing = await prisma.ticket.findFirst({ where: { guildId: i.guildId!, ownerId: i.user.id, status: "open" } });
        if (existing) return void await i.reply({ content: `You already have an open ticket: <#${existing.channelId}>.`, ephemeral: true });
        const channel = await i.guild!.channels.create({
          name: `ticket-${i.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 80),
          type: ChannelType.GuildText,
          parent: config.ticketCategoryId ?? undefined,
          topic: `Nymera ticket for ${i.user.tag} (${i.user.id})`,
          permissionOverwrites: [
            { id: i.guild!.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
            { id: i.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
          ]
        });
        const ticket = await prisma.ticket.create({ data: { guildId: i.guildId!, channelId: channel.id, ownerId: i.user.id, subject: i.options.getString("subject", true) } });
        await channel.send({ embeds: [new EmbedBuilder().setColor(0x6f42c1).setTitle(`Ticket #${ticket.id}`).setDescription(`Opened by ${i.user}\n\n**Subject:** ${ticket.subject}\n\nStaff with server-level channel access can view this ticket. Use \`/ticket close\` when finished.`)] });
        await i.reply({ content: `Your ticket is ready: ${channel}.`, ephemeral: true });
        return;
      }
      const ticket = await prisma.ticket.findUnique({ where: { channelId: i.channelId } });
      if (!ticket || ticket.status !== "open") return void await i.reply({ content: "This is not an open ticket channel.", ephemeral: true });
      const isStaff = i.memberPermissions?.has(PermissionFlagsBits.ManageChannels) ?? false;
      if (sub === "add") {
        if (!isStaff && ticket.ownerId !== i.user.id) return void await i.reply({ content: "Only the ticket owner or staff can add members.", ephemeral: true });
        const user = i.options.getUser("user", true);
        const channel = i.channel;
        if (!channel || !("permissionOverwrites" in channel)) return;
        await channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
        await i.reply(`${user} was added.`);
        return;
      }
      if (!isStaff && ticket.ownerId !== i.user.id) return void await i.reply({ content: "Only the ticket owner or staff can close it.", ephemeral: true });
      await prisma.ticket.update({ where: { id: ticket.id }, data: { status: "closed", closedAt: new Date(), closedBy: i.user.id } });
      await i.reply("Ticket closed. This channel will remain as a transcript until staff deletes or archives it.");
      if (i.channel && "permissionOverwrites" in i.channel) await i.channel.permissionOverwrites.edit(ticket.ownerId, { SendMessages: false });
    }
  },
  {
    data: new SlashCommandBuilder().setName("role-buttons").setDescription("Create a panel with multiple role buttons")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addChannelOption(o => o.setName("channel").setDescription("Channel for the role panel").setRequired(true).addChannelTypes(ChannelType.GuildText))
      .addStringOption(o => o.setName("title").setDescription("Panel title").setRequired(true).setMaxLength(100))
      .addRoleOption(o => o.setName("role_1").setDescription("First role").setRequired(true))
      .addStringOption(o => o.setName("label_1").setDescription("First button label").setMaxLength(80))
      .addRoleOption(o => o.setName("role_2").setDescription("Second role"))
      .addStringOption(o => o.setName("label_2").setDescription("Second button label").setMaxLength(80))
      .addRoleOption(o => o.setName("role_3").setDescription("Third role"))
      .addStringOption(o => o.setName("label_3").setDescription("Third button label").setMaxLength(80))
      .addRoleOption(o => o.setName("role_4").setDescription("Fourth role"))
      .addStringOption(o => o.setName("label_4").setDescription("Fourth button label").setMaxLength(80))
      .addRoleOption(o => o.setName("role_5").setDescription("Fifth role"))
      .addStringOption(o => o.setName("label_5").setDescription("Fifth button label").setMaxLength(80)),
    async execute(i) {
      const channel = i.options.getChannel("channel", true);
      if (!("send" in channel)) return;
      const roles = [1, 2, 3, 4, 5].map(position => {
        const role = i.options.getRole(`role_${position}`);
        if (!role) return null;
        return {
          role,
          label: i.options.getString(`label_${position}`)?.trim() || role.name
        };
      }).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
      const uniqueRoles = new Set(roles.map(entry => entry.role.id));
      if (uniqueRoles.size !== roles.length) {
        return void await i.reply({ content: "Each button must use a different role.", ephemeral: true });
      }
      const botMember = i.guild!.members.me;
      const invalid = roles.find(entry => entry.role.managed || entry.role.id === i.guild!.roles.everyone.id || !botMember || entry.role.position >= botMember.roles.highest.position);
      if (invalid) {
        return void await i.reply({
          content: `I cannot manage ${invalid.role}. Move Nymera's bot role above it, then try again.`,
          ephemeral: true
        });
      }
      await i.deferReply({ ephemeral: true });
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(roles.map(entry =>
        new ButtonBuilder()
          .setCustomId(`rolebutton:${entry.role.id}`)
          .setLabel(entry.label)
          .setStyle(ButtonStyle.Secondary)
      ));
      const message = await channel.send({
        embeds: [new EmbedBuilder()
          .setColor(0x6f42c1)
          .setTitle(i.options.getString("title", true))
          .setDescription("Choose your roles below. Click a button again to remove its role.")],
        components: [row]
      });
      await prisma.$transaction(roles.map(entry => prisma.reactionRole.upsert({
        where: { guildId_messageId_emoji: { guildId: i.guildId!, messageId: message.id, emoji: `button:${entry.role.id}` } },
        update: { roleId: entry.role.id, channelId: channel.id },
        create: { guildId: i.guildId!, channelId: channel.id, messageId: message.id, emoji: `button:${entry.role.id}`, roleId: entry.role.id }
      })));
      await i.editReply(`Role panel created in ${channel}.`);
    }
  },
  {
    data: new SlashCommandBuilder().setName("reaction-role").setDescription("Configure a reaction role").setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addStringOption(o => o.setName("message_id").setDescription("Message ID").setRequired(true))
      .addChannelOption(o => o.setName("channel").setDescription("Message channel").setRequired(true).addChannelTypes(ChannelType.GuildText))
      .addStringOption(o => o.setName("emoji").setDescription("Unicode emoji or custom emoji ID").setRequired(true))
      .addRoleOption(o => o.setName("role").setDescription("Role to assign").setRequired(true)),
    async execute(i) {
      const channel = i.options.getChannel("channel", true);
      if (!("messages" in channel)) return;
      const messageId = i.options.getString("message_id", true);
      const emoji = i.options.getString("emoji", true);
      const role = i.options.getRole("role", true);
      const message = await channel.messages.fetch(messageId).catch(() => null);
      if (!message) return void await i.reply({ content: "Message not found in that channel.", ephemeral: true });
      await message.react(emoji);
      await prisma.reactionRole.upsert({
        where: { guildId_messageId_emoji: { guildId: i.guildId!, messageId, emoji } },
        update: { roleId: role.id, channelId: channel.id },
        create: { guildId: i.guildId!, channelId: channel.id, messageId, emoji, roleId: role.id }
      });
      await i.reply({ content: `Reaction role saved for ${role}.`, ephemeral: true });
    }
  },
  {
    data: new SlashCommandBuilder().setName("giveaway-start").setDescription("Start a giveaway").setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
      .addStringOption(o => o.setName("prize").setDescription("Prize").setRequired(true).setMaxLength(300))
      .addStringOption(o => o.setName("duration").setDescription("Examples: 30m, 12h, 7d").setRequired(true))
      .addIntegerOption(o => o.setName("winners").setDescription("Winner count").setMinValue(1).setMaxValue(10)),
    async execute(i) {
      if (!i.channel || !("send" in i.channel)) return;
      const duration = parseDuration(i.options.getString("duration", true));
      if (!duration) return void await i.reply({ content: "Use a duration from 1m to 30d, such as `30m`, `12h`, or `7d`.", ephemeral: true });
      const prize = i.options.getString("prize", true);
      const endsAt = new Date(Date.now() + duration);
      const giveaway = await prisma.giveaway.create({ data: { guildId: i.guildId!, channelId: i.channelId, prize, endsAt, winnerCount: i.options.getInteger("winners") ?? 1, createdBy: i.user.id } });
      const message = await i.channel.send({ embeds: [giveawayEmbed(prize, endsAt, giveaway.id)] });
      await prisma.giveaway.update({ where: { id: giveaway.id }, data: { messageId: message.id } });
      await i.reply({ content: `Giveaway #${giveaway.id} started.`, ephemeral: true });
    }
  },
  {
    data: new SlashCommandBuilder().setName("giveaway-enter").setDescription("Enter an active giveaway")
      .addIntegerOption(o => o.setName("id").setDescription("Giveaway ID").setRequired(true).setMinValue(1)),
    async execute(i) {
      const giveaway = await prisma.giveaway.findUnique({ where: { id: i.options.getInteger("id", true) } });
      if (!giveaway || giveaway.guildId !== i.guildId || giveaway.endedAt || giveaway.endsAt <= new Date()) return void await i.reply({ content: "That giveaway is not active.", ephemeral: true });
      await prisma.giveawayEntry.upsert({ where: { giveawayId_userId: { giveawayId: giveaway.id, userId: i.user.id } }, update: {}, create: { giveawayId: giveaway.id, userId: i.user.id } });
      await i.reply({ content: `You entered giveaway #${giveaway.id}.`, ephemeral: true });
    }
  },
  {
    data: new SlashCommandBuilder().setName("giveaway-end").setDescription("End a giveaway now").setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
      .addIntegerOption(o => o.setName("id").setDescription("Giveaway ID").setRequired(true).setMinValue(1)),
    async execute(i) {
      const giveaway = await prisma.giveaway.findUnique({ where: { id: i.options.getInteger("id", true) } });
      if (!giveaway || giveaway.guildId !== i.guildId) return void await i.reply({ content: "Giveaway not found.", ephemeral: true });
      await endGiveaway(i.client, giveaway.id);
      await i.reply({ content: "Giveaway ended.", ephemeral: true });
    }
  }
];
