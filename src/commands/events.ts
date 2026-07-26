import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.js";
import { prisma } from "../database.js";
import { accountKey, currency, getAccount, seedGuildEconomy } from "../services/economy.js";
import { secureInt } from "../services/games.js";
import { moonPhase } from "../services/magic.js";

const dayKey = () => new Date().toISOString().slice(0, 10);
const monthKey = () => new Date().toISOString().slice(0, 7);
const isHalloweenSeason = () => new Date().getUTCMonth() === 9;
const fullMoonActive = () => moonPhase().name === "Full Moon";

const survivorBuilds = {
  chase: ["Windows of Opportunity", "Lithe", "Resilience", "Quick & Quiet"],
  rescue: ["We'll Make It", "Kindred", "Borrowed Time", "Guardian"],
  stealth: ["Distortion", "Lightweight", "Iron Will", "Quick & Quiet"],
  objectives: ["Deja Vu", "Prove Thyself", "Stake Out", "Hyperfocus"]
} as const;

const killerBuilds = {
  chase: ["Bamboozle", "Superior Anatomy", "Enduring", "Spirit Fury"],
  control: ["Corrupt Intervention", "Deadlock", "Grim Embrace", "No Way Out"],
  tracking: ["Lethal Pursuer", "Barbecue & Chilli", "Nowhere to Hide", "Discordance"],
  slowdown: ["Scourge Hook: Pain Resonance", "Deadlock", "Pop Goes the Weasel", "Corrupt Intervention"]
} as const;

const dbdChallenges = [
  "Safely unhook two Survivors in one match.",
  "Complete the equivalent of one full generator.",
  "Escape a chase lasting at least 30 seconds.",
  "As Killer, hook three different Survivors.",
  "As Killer, damage four generators.",
  "Open two chests or cleanse two totems.",
  "Earn at least one iridescent emblem."
] as const;

const dbdTrivia = [
  { q: "How many Survivors normally enter a standard trial?", choices: ["3", "4", "5", "6"], answer: 1 },
  { q: "What powers the exit gates after five generators are completed?", choices: ["The Hatch", "The Entity", "The generators", "A key"], answer: 2 },
  { q: "Which item can Survivors use to heal without another Survivor?", choices: ["Toolbox", "Map", "Med-Kit", "Key"], answer: 2 },
  { q: "What is the Killer's objective?", choices: ["Repair generators", "Sacrifice Survivors", "Open chests", "Find the Hatch"], answer: 1 }
] as const;

async function rewardMarks(guildId: string, userId: string, amount: number, type: string, note: string) {
  await prisma.$transaction([
    prisma.economyAccount.upsert({
      ...accountKey(guildId, userId),
      update: { wallet: { increment: amount } },
      create: { guildId, userId, wallet: amount }
    }),
    prisma.economyTransaction.create({ data: { guildId, userId, type, amount, note } })
  ]);
}

async function grantItem(guildId: string, userId: string, key: string) {
  await seedGuildEconomy(guildId);
  const item = await prisma.shopItem.findUniqueOrThrow({ where: { guildId_key: { guildId, key } } });
  await getAccount(guildId, userId);
  await prisma.inventoryItem.upsert({
    where: { guildId_userId_itemId: { guildId, userId, itemId: item.id } },
    update: { quantity: { increment: 1 } },
    create: { guildId, userId, itemId: item.id }
  });
  return item.name;
}

export const eventCommands: Command[] = [
  {
    data: new SlashCommandBuilder().setName("seasonal-event").setDescription("View Nymera's currently available special events"),
    async execute(i) {
      const phase = moonPhase();
      const events = [
        isHalloweenSeason() ? "🎃 **Halloween Haunting** — `/trick-or-treat` is active once daily." : "🎃 Halloween Haunting returns during October.",
        fullMoonActive() ? "🌕 **Full Moon Gathering** — `/full-moon-offering` is active now." : `🌙 Current lunar phase: **${phase.name}**.`,
        "🩸 **Trials in the Fog** — DBD builds, challenges, and trivia are always available."
      ];
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x6f42c1).setTitle("Events Beyond the Veil").setDescription(events.join("\n\n"))] });
    }
  },
  {
    data: new SlashCommandBuilder().setName("trick-or-treat").setDescription("Claim a daily Halloween surprise during October"),
    async execute(i) {
      if (!isHalloweenSeason()) return void await i.reply({ content: "The Halloween Haunting awakens each October.", ephemeral: true });
      const period = dayKey();
      const key = { guildId_userId_eventKey_periodKey: { guildId: i.guildId!, userId: i.user.id, eventKey: "halloween", periodKey: period } };
      if (await prisma.eventProgress.findUnique({ where: key })) return void await i.reply({ content: "You already knocked on the crypt door today.", ephemeral: true });
      const roll = secureInt(1, 100);
      let detail: string;
      if (roll <= 8) detail = `Rare treat: **${await grantItem(i.guildId!, i.user.id, "halloween_badge")}**!`;
      else if (roll <= 25) detail = `Mysterious treat: **${await grantItem(i.guildId!, i.user.id, "haunted_lootbox")}**!`;
      else {
        const amount = roll <= 55 ? 350 : 150;
        await rewardMarks(i.guildId!, i.user.id, amount, "halloween_event", period);
        detail = `The crypt keeper gives you **${amount} ${currency}**.`;
      }
      await prisma.eventProgress.create({ data: { guildId: i.guildId!, userId: i.user.id, eventKey: "halloween", periodKey: period, progress: 1, claimedAt: new Date(), detail } });
      await i.reply(`🎃 **Trick or treat!** ${detail}`);
    }
  },
  {
    data: new SlashCommandBuilder().setName("full-moon-offering").setDescription("Make one symbolic offering during the current full moon"),
    async execute(i) {
      if (!fullMoonActive()) return void await i.reply({ content: `The offering circle opens during the Full Moon. Current phase: ${moonPhase().name}.`, ephemeral: true });
      const period = monthKey();
      const key = { guildId_userId_eventKey_periodKey: { guildId: i.guildId!, userId: i.user.id, eventKey: "full_moon", periodKey: period } };
      if (await prisma.eventProgress.findUnique({ where: key })) return void await i.reply({ content: "You already joined this full-moon gathering.", ephemeral: true });
      const amount = 750;
      await rewardMarks(i.guildId!, i.user.id, amount, "full_moon_event", period);
      await prisma.eventProgress.create({ data: { guildId: i.guildId!, userId: i.user.id, eventKey: "full_moon", periodKey: period, progress: 1, claimedAt: new Date(), detail: `${amount} Spellmarks` } });
      await i.reply(`🌕 Your symbolic offering joins the circle. You receive **${amount} ${currency}**.\n*For community reflection and entertainment; no supernatural result is promised.*`);
    }
  },
  {
    data: new SlashCommandBuilder().setName("dbd-build").setDescription("Receive a Dead by Daylight perk-build suggestion")
      .addStringOption(o => o.setName("role").setDescription("Trial role").setRequired(true)
        .addChoices({ name: "Survivor", value: "survivor" }, { name: "Killer", value: "killer" }))
      .addStringOption(o => o.setName("style").setDescription("Preferred playstyle").setRequired(true)
        .addChoices(
          { name: "Chase", value: "chase" },
          { name: "Rescue / Control", value: "support" },
          { name: "Stealth / Tracking", value: "information" },
          { name: "Objectives / Slowdown", value: "objectives" }
        )),
    async execute(i) {
      const role = i.options.getString("role", true);
      const style = i.options.getString("style", true);
      const survivorKey = style === "support" ? "rescue" : style === "information" ? "stealth" : style === "objectives" ? "objectives" : "chase";
      const killerKey = style === "support" ? "control" : style === "information" ? "tracking" : style === "objectives" ? "slowdown" : "chase";
      const perks = role === "survivor" ? survivorBuilds[survivorKey] : killerBuilds[killerKey];
      await i.reply({
        embeds: [new EmbedBuilder().setColor(0xb5121b).setTitle(`${role === "survivor" ? "Survivor" : "Killer"} Build: ${style}`)
          .setDescription(perks.map((perk, n) => `**${n + 1}. ${perk}**`).join("\n"))
          .setFooter({ text: "A general suggestion; perk availability and live balance may change with game updates." })]
      });
    }
  },
  {
    data: new SlashCommandBuilder().setName("dbd-challenge").setDescription("View or complete Nymera's daily DBD challenge")
      .addSubcommand(s => s.setName("view").setDescription("View today's themed challenge"))
      .addSubcommand(s => s.setName("trivia").setDescription("Answer a DBD question to complete today's bot challenge")),
    async execute(i) {
      const period = dayKey();
      const challenge = dbdChallenges[Math.abs([...`${i.guildId}:${i.user.id}:${period}`].reduce((n, c) => n + c.charCodeAt(0), 0)) % dbdChallenges.length]!;
      const progressKey = { guildId_userId_eventKey_periodKey: { guildId: i.guildId!, userId: i.user.id, eventKey: "dbd_daily", periodKey: period } };
      const saved = await prisma.eventProgress.findUnique({ where: progressKey });
      if (i.options.getSubcommand() === "view") {
        await i.reply({ embeds: [new EmbedBuilder().setColor(0xb5121b).setTitle("Daily Trial Challenge")
          .setDescription(`**In-game challenge:** ${challenge}\n\nThen use \`/dbd-challenge trivia\` for Nymera's daily knowledge trial and a **300 ${currency}** reward.`)
          .setFooter({ text: saved?.claimedAt ? "Today's reward has been claimed." : "Resets daily at 00:00 UTC." })] });
        return;
      }
      if (saved?.claimedAt) return void await i.reply({ content: "You already completed today's DBD challenge.", ephemeral: true });
      const question = dbdTrivia[secureInt(0, dbdTrivia.length - 1)]!;
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(question.choices.map((choice, index) =>
        new ButtonBuilder().setCustomId(`dbdevent:${i.id}:${index}`).setLabel(choice).setStyle(ButtonStyle.Secondary)
      ));
      const message = await i.reply({ content: `🩸 **${question.q}**\nChoose within 60 seconds.`, components: [row], fetchReply: true });
      try {
        const click = await message.awaitMessageComponent({
          componentType: ComponentType.Button,
          time: 60_000,
          filter: interaction => interaction.user.id === i.user.id && interaction.customId.startsWith(`dbdevent:${i.id}:`)
        });
        const answer = Number(click.customId.split(":").at(-1));
        await click.deferUpdate();
        if (answer !== question.answer) {
          await i.editReply({ content: `The Entity claims this attempt. The answer was **${question.choices[question.answer]}**. Try again today.`, components: [] });
          return;
        }
        await rewardMarks(i.guildId!, i.user.id, 300, "dbd_daily", period);
        await prisma.eventProgress.upsert({
          where: progressKey,
          update: { progress: 1, claimedAt: new Date(), detail: challenge },
          create: { guildId: i.guildId!, userId: i.user.id, eventKey: "dbd_daily", periodKey: period, progress: 1, claimedAt: new Date(), detail: challenge }
        });
        await i.editReply({ content: `Correct. You escaped with **300 ${currency}**!`, components: [] });
      } catch {
        await i.editReply({ content: `The trial closed. The answer was **${question.choices[question.answer]}**.`, components: [] });
      }
    }
  }
];
