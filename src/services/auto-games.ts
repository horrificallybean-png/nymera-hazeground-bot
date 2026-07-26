import { randomBytes } from "node:crypto";
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType,
  type Client, type TextChannel
} from "discord.js";
import { prisma } from "../database.js";
import { logger } from "../logger.js";
import { generateAutoGameRound } from "./ai.js";

async function recordAutoGameAnswer(guildId: string, userId: string, won: boolean) {
  if (!won) return;
  await prisma.economyAccount.upsert({
    where: { guildId_userId: { guildId, userId } },
    update: { wallet: { increment: 100 } },
    create: { guildId, userId, wallet: 100 }
  });
}

const rounds = [
  { game: "auto_horror", title: "💀 Horror Trivia", question: "Who wrote Frankenstein?", choices: ["Mary Shelley", "Bram Stoker", "Edgar Allan Poe", "Shirley Jackson"], answer: 0 },
  { game: "auto_dbd", title: "🩸 Dead by Daylight Trivia", question: "How many survivors normally enter a standard trial?", choices: ["Three", "Four", "Five", "Six"], answer: 1 },
  { game: "auto_herb", title: "🌿 Herb Lore", question: "Which herb is traditionally associated with remembrance?", choices: ["Rosemary", "Mint", "Basil", "Dill"], answer: 0 },
  { game: "auto_hexed", title: "🔤 Hexed Word", question: "Unscramble: RIIROGME", choices: ["Grimoire", "Moonrise", "Emerging", "Requiem"], answer: 0 },
  { game: "auto_ghost", title: "👻 Ghost Count", question: "Four candles flicker. One goes dark. How many remain lit?", choices: ["One", "Two", "Three", "Four"], answer: 2 },
  { game: "auto_moon", title: "🌙 Moon Trivia", question: "Which phase follows the new moon?", choices: ["Waning crescent", "Waxing crescent", "Full moon", "Last quarter"], answer: 1 }
] as const;

const extraRounds = [
  { game: "auto_horror", title: "💀 Horror Trivia", question: "Who wrote the novel Dracula?", choices: ["Bram Stoker", "Mary Shelley", "Oscar Wilde", "H. G. Wells"], answer: 0 },
  { game: "auto_dbd", title: "🩸 Dead by Daylight Trivia", question: "How many generators must Survivors normally complete to power the exit gates?", choices: ["Three", "Four", "Five", "Seven"], answer: 2 },
  { game: "auto_herb", title: "🌿 Herb Lore", question: "Which culinary herb belongs to the mint family and is often used in pesto?", choices: ["Basil", "Dill", "Parsley", "Tarragon"], answer: 0 },
  { game: "auto_hexed", title: "🔤 Hexed Word", question: "Unscramble: LDUARCON", choices: ["Cauldron", "Calendar", "Cardinal", "Clouding"], answer: 0 },
  { game: "auto_ghost", title: "👻 Ghost Count", question: "Six ravens sit on a gate. Two fly away. How many remain?", choices: ["Two", "Three", "Four", "Five"], answer: 2 },
  { game: "auto_moon", title: "🌙 Moon Trivia", question: "About how long is one lunar cycle from new moon to new moon?", choices: ["Seven days", "Fourteen days", "Twenty-nine and a half days", "Three months"], answer: 2 },
  { game: "auto_horror", title: "💀 Horror Trivia", question: "In which century was Mary Shelley's Frankenstein first published?", choices: ["17th", "18th", "19th", "20th"], answer: 2 },
  { game: "auto_dbd", title: "🩸 Dead by Daylight Trivia", question: "Which Survivor item is mainly used to repair generators faster?", choices: ["Med-Kit", "Toolbox", "Map", "Key"], answer: 1 },
  { game: "auto_herb", title: "🌿 Herb Lore", question: "Which herb is widely used in cooking and traditionally linked with hospitality?", choices: ["Mint", "Hemlock", "Foxglove", "Belladonna"], answer: 0 },
  { game: "auto_hexed", title: "🔤 Hexed Word", question: "Unscramble: RTAOT", choices: ["Tarot", "Torta", "Taro", "Troat"], answer: 0 },
  { game: "auto_ghost", title: "👻 Ghost Count", question: "Three spirits each carry two lanterns. How many lanterns are there?", choices: ["Three", "Five", "Six", "Eight"], answer: 2 },
  { game: "auto_moon", title: "🌙 Moon Trivia", question: "During which phase does the Moon appear fully illuminated from Earth?", choices: ["New moon", "First quarter", "Full moon", "Waning crescent"], answer: 2 },
  { game: "auto_horror", title: "💀 Horror Trivia", question: "Which author created the detective C. Auguste Dupin?", choices: ["Edgar Allan Poe", "Stephen King", "Bram Stoker", "Henry James"], answer: 0 },
  { game: "auto_dbd", title: "🩸 Dead by Daylight Trivia", question: "What structure can provide an alternate escape when its conditions are met?", choices: ["Basement", "Hatch", "Locker", "Totem"], answer: 1 },
  { game: "auto_herb", title: "🌿 Herb Lore", question: "Which herb is commonly paired with roasted potatoes and has needle-like leaves?", choices: ["Rosemary", "Cilantro", "Chives", "Sorrel"], answer: 0 },
  { game: "auto_hexed", title: "🔤 Hexed Word", question: "Unscramble: EPTSCRE", choices: ["Specter", "Respect", "Scepter", "Secret"], answer: 0 },
  { game: "auto_ghost", title: "👻 Ghost Count", question: "Eight potion bottles stand on a shelf. Three are used. How many remain?", choices: ["Four", "Five", "Six", "Seven"], answer: 1 },
  { game: "auto_moon", title: "🌙 Moon Trivia", question: "What does waxing mean when describing the Moon?", choices: ["Illumination is increasing", "Illumination is decreasing", "The Moon is red", "The Moon is invisible"], answer: 0 }
] as const;

const allRounds = [...rounds, ...extraRounds];

export async function launchAutoGame(client: Client, guildId: string) {
  const config = await prisma.autoGameConfig.findUnique({ where: { guildId } });
  if (!config?.enabled) return false;
  const channel = await client.channels.fetch(config.channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || !("send" in channel)) return false;
  const fallbackRound = allRounds[config.nextGameIndex % allRounds.length]!;
  const recent = await prisma.autoGameHistory.findMany({
    where: { guildId },
    orderBy: { createdAt: "desc" },
    take: 20
  });
  const round = await generateAutoGameRound(fallbackRound.game, fallbackRound, recent.map(entry => entry.question));
  const sessionId = randomBytes(5).toString("hex");
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(round.choices.map((choice, index) =>
    new ButtonBuilder().setCustomId(`autogame:${sessionId}:${index}`).setLabel(`${index + 1}. ${choice}`).setStyle(ButtonStyle.Secondary)
  ));
  await prisma.autoGameConfig.update({
    where: { guildId },
    data: { lastRunAt: new Date(), nextGameIndex: { increment: 1 } }
  });
  await prisma.autoGameHistory.create({
    data: { guildId, game: fallbackRound.game, question: round.question }
  });
  const oldHistory = await prisma.autoGameHistory.findMany({
    where: { guildId },
    orderBy: { createdAt: "desc" },
    skip: 50,
    select: { id: true }
  });
  if (oldHistory.length) {
    await prisma.autoGameHistory.deleteMany({ where: { id: { in: oldHistory.map(entry => entry.id) } } });
  }
  const message = await (channel as TextChannel).send({
    content: `${config.pingRoleId ? `<@&${config.pingRoleId}>\n\n` : ""}## ${round.title}\n${round.question}\n\nChoose within **${Math.ceil(config.answerSeconds / 60)} minute${config.answerSeconds === 60 ? "" : "s"}**. Correct answers earn **100 Spellmarks**.`,
    components: [row],
    allowedMentions: { roles: config.pingRoleId ? [config.pingRoleId] : [] }
  });
  const answered = new Set<string>();
  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: config.answerSeconds * 1000
  });
  collector.on("collect", async interaction => {
    if (!interaction.customId.startsWith(`autogame:${sessionId}:`)) return;
    if (answered.has(interaction.user.id)) {
      await interaction.reply({ content: "You already answered this round.", ephemeral: true });
      return;
    }
    answered.add(interaction.user.id);
    await interaction.deferReply({ ephemeral: true });
    const choice = Number(interaction.customId.split(":")[2]);
    const won = choice === round.answer;
    try {
      await recordAutoGameAnswer(guildId, interaction.user.id, won);
      await interaction.editReply(won ? "Correct! You earned **100 Spellmarks**." : "The mist says that answer is incorrect.");
    } catch (error) {
      logger.error({ err: error, guildId, userId: interaction.user.id }, "Auto-game answer failed");
      answered.delete(interaction.user.id);
      await interaction.editReply("The mist disrupted that answer. Please try once more.");
    }
  });
  collector.on("end", async () => {
    const disabled = new ActionRowBuilder<ButtonBuilder>().addComponents(round.choices.map((choice, index) =>
      new ButtonBuilder().setCustomId(`ended:${sessionId}:${index}`).setLabel(`${index + 1}. ${choice}`).setStyle(index === round.answer ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(true)
    ));
    await message.edit({
      content: `## ${round.title}\n${round.question}\n\nThe answer was **${round.choices[round.answer]}**. Next game in ${config.intervalMinutes} minutes.`,
      components: [disabled]
    }).catch(() => undefined);
  });
  return true;
}

export function startAutoGameMonitor(client: Client) {
  const timer = setInterval(async () => {
    try {
      const configs = await prisma.autoGameConfig.findMany({ where: { enabled: true } });
      const now = Date.now();
      for (const config of configs) {
        const dueAt = (config.lastRunAt?.getTime() ?? config.createdAt.getTime()) + config.intervalMinutes * 60_000;
        if (now >= dueAt) await launchAutoGame(client, config.guildId);
      }
    } catch (error) {
      logger.error({ err: error }, "Auto-game monitor failed");
    }
  }, 30_000);
  timer.unref();
  logger.info("Auto-game monitor initialized");
}
