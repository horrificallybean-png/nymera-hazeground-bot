import { createHash } from "node:crypto";
import { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.js";
import { prisma } from "../database.js";
import { currency, getAccount } from "../services/economy.js";
import { createDatabaseBackup, getBackupStatus } from "../services/backups.js";

const oracleCards = [
  { key: "threshold", name: "The Threshold", message: "A transition asks for patience and a deliberate first step.", prompt: "What are you ready to enter?" },
  { key: "lantern", name: "The Lantern", message: "Clarity grows when you illuminate one small part at a time.", prompt: "Which fact would help you move forward?" },
  { key: "raven", name: "The Raven", message: "Listen carefully; an overlooked pattern may carry useful information.", prompt: "What keeps repeating?" },
  { key: "mirror", name: "The Silver Mirror", message: "Reflection can reveal both truth and distortion.", prompt: "Which assumption deserves another look?" },
  { key: "root", name: "The Ancient Root", message: "Stability comes from tending what supports you.", prompt: "What helps you feel grounded?" },
  { key: "key", name: "The Obsidian Key", message: "A practical choice may unlock movement where force could not.", prompt: "What option have you not tried?" },
  { key: "moth", name: "The Moon Moth", message: "Curiosity draws you toward change, but discernment protects your wings.", prompt: "What attracts you, and why?" },
  { key: "well", name: "The Hidden Well", message: "Restoration requires making room to receive.", prompt: "Where are you running low?" },
  { key: "storm", name: "The Violet Storm", message: "Strong feelings carry information without having to control the next action.", prompt: "What is the feeling trying to protect?" },
  { key: "gate", name: "The Garden Gate", message: "Boundaries can protect connection as well as solitude.", prompt: "Which boundary would create more ease?" },
  { key: "ember", name: "The Last Ember", message: "A small source of motivation can be tended without demanding a blaze.", prompt: "What tiny action still feels possible?" },
  { key: "constellation", name: "The Lost Constellation", message: "Meaning sometimes appears only after separate experiences are connected.", prompt: "Which pieces belong in the same story?" }
] as const;

const signs = {
  aries: ["Fire", "Cardinal", "directness, initiative, and courageous beginnings"],
  taurus: ["Earth", "Fixed", "stability, patience, values, and sensory experience"],
  gemini: ["Air", "Mutable", "curiosity, communication, adaptability, and connection"],
  cancer: ["Water", "Cardinal", "care, belonging, memory, and emotional protection"],
  leo: ["Fire", "Fixed", "creativity, warmth, visibility, and loyal expression"],
  virgo: ["Earth", "Mutable", "discernment, craft, service, and practical refinement"],
  libra: ["Air", "Cardinal", "balance, relationship, beauty, and thoughtful negotiation"],
  scorpio: ["Water", "Fixed", "depth, privacy, transformation, and emotional intensity"],
  sagittarius: ["Fire", "Mutable", "exploration, meaning, candor, and widening horizons"],
  capricorn: ["Earth", "Cardinal", "structure, responsibility, endurance, and ambition"],
  aquarius: ["Air", "Fixed", "independence, community, ideas, and unconventional perspective"],
  pisces: ["Water", "Mutable", "imagination, empathy, permeability, and symbolic thinking"]
} as const;

type SignKey = keyof typeof signs;
const signChoices = Object.keys(signs).map(key => ({ name: key[0]!.toUpperCase() + key.slice(1), value: key }));

export const utilityExpansionCommands: Command[] = [
  {
    data: new SlashCommandBuilder().setName("reminder").setDescription("Create and manage personal reminders")
      .addSubcommand(s => s.setName("set").setDescription("Create a reminder")
        .addIntegerOption(o => o.setName("minutes").setDescription("Minutes from now").setRequired(true).setMinValue(1).setMaxValue(43_200))
        .addStringOption(o => o.setName("message").setDescription("Reminder text").setRequired(true).setMaxLength(1000)))
      .addSubcommand(s => s.setName("list").setDescription("List your pending reminders"))
      .addSubcommand(s => s.setName("cancel").setDescription("Cancel one reminder")
        .addIntegerOption(o => o.setName("id").setDescription("Reminder ID").setRequired(true).setMinValue(1))),
    async execute(i) {
      const action = i.options.getSubcommand();
      if (action === "set") {
        const minutes = i.options.getInteger("minutes", true);
        const dueAt = new Date(Date.now() + minutes * 60_000);
        const reminder = await prisma.reminder.create({
          data: { guildId: i.guildId!, channelId: i.channelId, userId: i.user.id, content: i.options.getString("message", true), dueAt }
        });
        await i.reply({ content: `Reminder **#${reminder.id}** set for <t:${Math.floor(dueAt.getTime() / 1000)}:F> (<t:${Math.floor(dueAt.getTime() / 1000)}:R>).`, ephemeral: true });
        return;
      }
      if (action === "list") {
        const rows = await prisma.reminder.findMany({
          where: { guildId: i.guildId!, userId: i.user.id, sentAt: null },
          orderBy: { dueAt: "asc" },
          take: 20
        });
        await i.reply({ content: rows.map(r => `**#${r.id}** • <t:${Math.floor(r.dueAt.getTime() / 1000)}:R> • ${r.content}`).join("\n") || "You have no pending reminders.", ephemeral: true });
        return;
      }
      const id = i.options.getInteger("id", true);
      const removed = await prisma.reminder.deleteMany({ where: { id, guildId: i.guildId!, userId: i.user.id, sentAt: null } });
      await i.reply({ content: removed.count ? `Reminder #${id} was cancelled.` : "That pending reminder was not found.", ephemeral: true });
    }
  },
  {
    data: new SlashCommandBuilder().setName("ritual-reminder").setDescription("Schedule a gentle reflective-practice reminder")
      .addStringOption(o => o.setName("ritual").setDescription("Reflection type").setRequired(true)
        .addChoices(
          { name: "Grounding pause", value: "Take a grounding pause: notice five things you see, four you feel, and one slow breath." },
          { name: "Moon journal", value: "Open your moon journal and write one honest sentence about what feels visible today." },
          { name: "Boundary check", value: "Review one boundary: name what you need and the action that remains within your control." },
          { name: "Candle focus", value: "Begin a short focus ritual with a safely placed candle or battery candle and a realistic intention." }
        ))
      .addIntegerOption(o => o.setName("minutes").setDescription("Minutes from now").setRequired(true).setMinValue(1).setMaxValue(43_200)),
    async execute(i) {
      const minutes = i.options.getInteger("minutes", true);
      const dueAt = new Date(Date.now() + minutes * 60_000);
      const reminder = await prisma.reminder.create({
        data: { guildId: i.guildId!, channelId: i.channelId, userId: i.user.id, content: i.options.getString("ritual", true), kind: "ritual", dueAt }
      });
      await i.reply({ content: `Ritual reminder **#${reminder.id}** set for <t:${Math.floor(dueAt.getTime() / 1000)}:R>.`, ephemeral: true });
    }
  },
  {
    data: new SlashCommandBuilder().setName("oracle").setDescription("Draw a reflective oracle card")
      .addSubcommand(s => s.setName("draw").setDescription("Draw a new oracle card"))
      .addSubcommand(s => s.setName("daily").setDescription("Draw your stable daily oracle card")),
    async execute(i) {
      const daily = i.options.getSubcommand() === "daily";
      const date = new Date().toISOString().slice(0, 10);
      let card;
      if (daily) {
        const digest = createHash("sha256").update(`${i.guildId}:${i.user.id}:${date}:oracle`).digest();
        const selected = oracleCards[digest[0]! % oracleCards.length]!;
        const saved = await prisma.oracleDraw.upsert({
          where: { guildId_userId_dateKey: { guildId: i.guildId!, userId: i.user.id, dateKey: date } },
          update: {},
          create: { guildId: i.guildId!, userId: i.user.id, dateKey: date, cardKey: selected.key }
        });
        card = oracleCards.find(entry => entry.key === saved.cardKey) ?? selected;
      } else {
        const digest = createHash("sha256").update(`${i.id}:${Date.now()}`).digest();
        card = oracleCards[digest[0]! % oracleCards.length]!;
      }
      await i.reply({
        embeds: [new EmbedBuilder().setColor(0x6f42c1).setTitle(`🔮 ${card.name}`)
          .setDescription(`${card.message}\n\n**Reflection:** ${card.prompt}`)
          .setFooter({ text: daily ? `Your ${date} card remains the same all day. For reflection, not prediction.` : "For reflection and entertainment, not prediction." })]
      });
    }
  },
  {
    data: new SlashCommandBuilder().setName("astrology").setDescription("Explore symbolic zodiac themes")
      .addSubcommand(s => s.setName("sign").setDescription("Read a sign's symbolic profile")
        .addStringOption(o => o.setName("sign").setDescription("Zodiac sign").setRequired(true).addChoices(...signChoices)))
      .addSubcommand(s => s.setName("compatibility").setDescription("Compare two signs as a reflection prompt")
        .addStringOption(o => o.setName("first").setDescription("First sign").setRequired(true).addChoices(...signChoices))
        .addStringOption(o => o.setName("second").setDescription("Second sign").setRequired(true).addChoices(...signChoices))),
    async execute(i) {
      const firstKey = i.options.getString(i.options.getSubcommand() === "sign" ? "sign" : "first", true) as SignKey;
      const first = signs[firstKey];
      if (i.options.getSubcommand() === "sign") {
        await i.reply({ embeds: [new EmbedBuilder().setColor(0x6f42c1).setTitle(`♈ ${firstKey[0]!.toUpperCase() + firstKey.slice(1)}`)
          .addFields({ name: "Element", value: first[0], inline: true }, { name: "Modality", value: first[1], inline: true }, { name: "Themes", value: first[2] })
          .setFooter({ text: "A symbolic cultural framework for reflection, not a scientific personality assessment." })] });
        return;
      }
      const secondKey = i.options.getString("second", true) as SignKey;
      const second = signs[secondKey];
      const sharedElement = first[0] === second[0];
      const sharedMode = first[1] === second[1];
      const reflection = sharedElement
        ? `Both signs share the ${first[0]} element, suggesting similar symbolic instincts but possible blind spots.`
        : `Their ${first[0]} and ${second[0]} elements invite curiosity about different needs and communication styles.`;
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x6f42c1).setTitle(`${firstKey} + ${secondKey}`)
        .setDescription(`${reflection}\n${sharedMode ? `Both use the ${first[1]} modality, so deciding who changes direction may require care.` : "Different modalities can balance initiative, consistency, and adaptation."}`)
        .setFooter({ text: "Compatibility depends on people and choices; this is a symbolic conversation prompt." })] });
    }
  },
  {
    data: new SlashCommandBuilder().setName("statistics").setDescription("View detailed Nymera statistics")
      .addSubcommand(s => s.setName("member").setDescription("View a member's combined statistics")
        .addUserOption(o => o.setName("user").setDescription("Member")))
      .addSubcommand(s => s.setName("server").setDescription("View server-wide Nymera statistics")),
    async execute(i) {
      if (i.options.getSubcommand() === "member") {
        const user = i.options.getUser("user") ?? i.user;
        const account = await getAccount(i.guildId!, user.id);
        const [games, items, familiars, achievements] = await Promise.all([
          prisma.gameStat.aggregate({ where: { guildId: i.guildId!, userId: user.id }, _sum: { played: true, won: true, earned: true } }),
          prisma.inventoryItem.count({ where: { guildId: i.guildId!, userId: user.id, quantity: { gt: 0 } } }),
          prisma.familiar.count({ where: { guildId: i.guildId!, userId: user.id } }),
          prisma.userAchievement.count({ where: { guildId: i.guildId!, userId: user.id } })
        ]);
        await i.reply({ embeds: [new EmbedBuilder().setColor(0x6f42c1).setTitle(`${user.username}'s Nymera Statistics`)
          .addFields(
            { name: "Progress", value: `Prestige ${account.prestige} • Level ${account.level}\n${account.xp.toLocaleString()} XP`, inline: true },
            { name: "Economy", value: `${(account.wallet + account.bank).toLocaleString()} ${currency}\nBank tier ${account.bankLevel + 1}`, inline: true },
            { name: "Activity", value: `${account.messages.toLocaleString()} messages\n${account.crafted} crafted`, inline: true },
            { name: "Games", value: `${games._sum.won ?? 0}/${games._sum.played ?? 0} wins\n${games._sum.earned ?? 0} net ${currency}`, inline: true },
            { name: "Collection", value: `${items} unique items\n${familiars} familiars`, inline: true },
            { name: "Achievements", value: String(achievements), inline: true }
          )] });
        return;
      }
      const [accounts, totals, games, familiars, trades, giveaways] = await Promise.all([
        prisma.economyAccount.count({ where: { guildId: i.guildId! } }),
        prisma.economyAccount.aggregate({ where: { guildId: i.guildId! }, _sum: { wallet: true, bank: true, messages: true, crafted: true } }),
        prisma.gameStat.aggregate({ where: { guildId: i.guildId! }, _sum: { played: true, won: true } }),
        prisma.familiar.count({ where: { guildId: i.guildId! } }),
        prisma.itemTrade.count({ where: { guildId: i.guildId!, status: "accepted" } }),
        prisma.giveaway.count({ where: { guildId: i.guildId!, endedAt: { not: null } } })
      ]);
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x6f42c1).setTitle(`${i.guild!.name} • Nymera Statistics`)
        .addFields(
          { name: "Economy", value: `${accounts} accounts\n${((totals._sum.wallet ?? 0) + (totals._sum.bank ?? 0)).toLocaleString()} ${currency}`, inline: true },
          { name: "Community activity", value: `${totals._sum.messages ?? 0} eligible messages\n${totals._sum.crafted ?? 0} crafted`, inline: true },
          { name: "Games", value: `${games._sum.played ?? 0} played\n${games._sum.won ?? 0} wins`, inline: true },
          { name: "Collections", value: `${familiars} familiars`, inline: true },
          { name: "Trading", value: `${trades} completed trades`, inline: true },
          { name: "Giveaways", value: `${giveaways} completed`, inline: true }
        )] });
    }
  },
  {
    data: new SlashCommandBuilder().setName("backup").setDescription("Manage automatic SQLite backups")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addSubcommand(s => s.setName("status").setDescription("View retained backup status"))
      .addSubcommand(s => s.setName("run").setDescription("Create a backup now")),
    async execute(i) {
      await i.deferReply({ ephemeral: true });
      if (i.options.getSubcommand() === "run") {
        const backup = await createDatabaseBackup();
        await i.editReply(`Created **${backup.fileName}** in the persistent \`prisma/backups\` folder.`);
        return;
      }
      const backups = await getBackupStatus();
      await i.editReply(backups.length
        ? `Automatic backups are active. Retained: **${backups.length}/7**.\nLatest: **${backups[0]!.name}** • ${(backups[0]!.size / 1024).toFixed(1)} KB • <t:${Math.floor(backups[0]!.modified.getTime() / 1000)}:R>`
        : "Automatic backups are active, but no completed backup was found yet.");
    }
  }
];
