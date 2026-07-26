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

export async function launchAutoGame(client: Client, guildId: string) {
  const config = await prisma.autoGameConfig.findUnique({ where: { guildId } });
  if (!config?.enabled) return false;
  const channel = await client.channels.fetch(config.channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || !("send" in channel)) return false;
  const fallbackRound = rounds[config.nextGameIndex % rounds.length]!;
  const round = await generateAutoGameRound(fallbackRound.game, fallbackRound);
  const sessionId = randomBytes(5).toString("hex");
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(round.choices.map((choice, index) =>
    new ButtonBuilder().setCustomId(`autogame:${sessionId}:${index}`).setLabel(`${index + 1}. ${choice}`).setStyle(ButtonStyle.Secondary)
  ));
  await prisma.autoGameConfig.update({
    where: { guildId },
    data: { lastRunAt: new Date(), nextGameIndex: { increment: 1 } }
  });
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
