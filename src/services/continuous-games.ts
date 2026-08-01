import { EmbedBuilder, type Message, type TextChannel } from "discord.js";
import { prisma } from "../database.js";
import { logger } from "../logger.js";

const channelQueues = new Map<string, Promise<void>>();

function enqueue(channelId: string, work: () => Promise<void>) {
  const previous = channelQueues.get(channelId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(work).finally(() => {
    if (channelQueues.get(channelId) === next) channelQueues.delete(channelId);
  });
  channelQueues.set(channelId, next);
  return next;
}

function parseUsedWords(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(word => typeof word === "string") as string[] : ["moon"];
  } catch {
    return ["moon"];
  }
}

export async function postContinuousGameInstructions(counting: TextChannel, wordChain: TextChannel) {
  const countingTitle = "🔢 Endless Coven Counting";
  const wordTitle = "⛓️ Eternal Word Chain";
  const countingRecent = await counting.messages.fetch({ limit: 100 }).catch(() => null);
  if (!countingRecent?.some(message => message.author.id === counting.client.user.id && message.embeds.some(embed => embed.title === countingTitle))) {
    const message = await counting.send({ embeds: [new EmbedBuilder()
      .setColor(0x6f42c1)
      .setTitle(countingTitle)
      .setDescription("Count upward forever, beginning with **1**. Send only the next number. The same member cannot take two turns in a row. A mistake resets the count to **0**, but the game immediately continues.")
      .setFooter({ text: "Nymera saves the count across restarts." })] });
    await message.pin().catch(() => undefined);
  }
  const wordRecent = await wordChain.messages.fetch({ limit: 100 }).catch(() => null);
  if (!wordRecent?.some(message => message.author.id === wordChain.client.user.id && message.embeds.some(embed => embed.title === wordTitle))) {
    const message = await wordChain.send({ embeds: [new EmbedBuilder()
      .setColor(0x6f42c1)
      .setTitle(wordTitle)
      .setDescription("The chain begins with **moon**. Send one English word beginning with the final letter of the previous word. The same member cannot take two turns in a row, and used words cannot be repeated.")
      .setFooter({ text: "Nymera saves the chain across restarts." })] });
    await message.pin().catch(() => undefined);
  }
}

async function handleCounting(message: Message, guildId: string) {
  const channel = message.channel as TextChannel;
  const state = await prisma.continuousGameConfig.findUnique({ where: { guildId } });
  if (!state) return;
  const expected = state.countingCurrent + 1;
  const submitted = Number(message.content.trim());
  if (!Number.isSafeInteger(submitted) || submitted !== expected || state.countingLastUserId === message.author.id) {
    await prisma.continuousGameConfig.update({
      where: { guildId },
      data: { countingCurrent: 0, countingLastUserId: null }
    });
    await message.react("❌").catch(() => undefined);
    await channel.send(`${message.author}, the count broke at **${state.countingCurrent}**. It has returned to **0**—the next number is **1**.`);
    return;
  }
  await prisma.continuousGameConfig.update({
    where: { guildId },
    data: { countingCurrent: submitted, countingLastUserId: message.author.id }
  });
  await message.react(submitted % 100 === 0 ? "🎉" : "✅").catch(() => undefined);
  if (submitted % 100 === 0) await channel.send(`✨ The coven reached **${submitted}**! The endless count continues with **${submitted + 1}**.`);
}

async function handleWordChain(message: Message, guildId: string) {
  const channel = message.channel as TextChannel;
  const state = await prisma.continuousGameConfig.findUnique({ where: { guildId } });
  if (!state) return;
  const word = message.content.trim().toLowerCase();
  const used = parseUsedWords(state.wordChainUsedWords);
  const required = state.wordChainCurrentWord.at(-1)?.toLowerCase();
  const valid = /^[a-z]{2,24}$/.test(word) && word[0] === required &&
    state.wordChainLastUserId !== message.author.id && !used.includes(word);
  if (!valid) {
    await message.react("❌").catch(() => undefined);
    await message.reply(`Use a new 2–24 letter word beginning with **${required?.toUpperCase()}**. The current word is **${state.wordChainCurrentWord}**, and members cannot take consecutive turns.`);
    return;
  }
  const nextUsed = [...used, word].slice(-500);
  await prisma.continuousGameConfig.update({
    where: { guildId },
    data: { wordChainCurrentWord: word, wordChainLastUserId: message.author.id, wordChainUsedWords: JSON.stringify(nextUsed) }
  });
  await message.react("✅").catch(() => undefined);
  if (nextUsed.length % 50 === 0) await channel.send(`⛓️ The chain reached **${nextUsed.length} words**! Continue with **${word.at(-1)?.toUpperCase()}**.`);
}

export async function handleContinuousGameMessage(message: Message) {
  if (!message.guildId || message.author.bot) return false;
  const config = await prisma.continuousGameConfig.findUnique({ where: { guildId: message.guildId } });
  if (!config) return false;
  const counting = message.channelId === config.countingChannelId;
  const wordChain = message.channelId === config.wordChainChannelId;
  if (!counting && !wordChain) return false;
  await enqueue(message.channelId, async () => {
    try {
      if (counting) await handleCounting(message, message.guildId!);
      else await handleWordChain(message, message.guildId!);
    } catch (error) {
      logger.error({ err: error, guildId: message.guildId, channelId: message.channelId }, "Continuous game failed");
      await message.react("⚠️").catch(() => undefined);
    }
  });
  return true;
}
