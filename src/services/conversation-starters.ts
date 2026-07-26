import type { Client } from "discord.js";
import { prisma } from "../database.js";
import { logger } from "../logger.js";
import { generateConversationStarter } from "./ai.js";

const starters = [
  "🌙 If you could spend one peaceful evening anywhere—real or imagined—where would you choose?",
  "🎮 Which game could you happily experience again for the first time?",
  "🔮 If your week had a tarot-card title, what would you call it?",
  "🕯️ Which fictional haunted place would you be brave enough to explore with friends?",
  "🌿 What small comfort reliably makes an ordinary day feel better?",
  "🦇 Which creature would make the best familiar, and what would you name it?",
  "📚 Which story, film, or game has an atmosphere you never forget?",
  "🎃 What is your favorite part of spooky season?",
  "✨ If our coven had a signature potion, what harmless effect should it have?",
  "🌌 Which nighttime sound feels the most calming or mysterious to you?",
  "🩸 Which Dead by Daylight character would you trust most as a teammate?",
  "🗝️ You find a key labeled with one word. What word would make you open its door?"
] as const;

let starterTimer: NodeJS.Timeout | undefined;

async function postDueStarters(client: Client) {
  const configs = await prisma.guildConfig.findMany({
    where: {
      aiEnabled: true,
      aiConversationStarterEnabled: true,
      aiConversationChannelId: { not: null }
    }
  });
  const now = Date.now();
  for (const config of configs) {
    const dueAt = (config.aiConversationStarterLastAt?.getTime() ?? config.updatedAt.getTime()) +
      config.aiConversationStarterMinutes * 60_000;
    if (now < dueAt) continue;
    const channel = await client.channels.fetch(config.aiConversationChannelId!).catch(() => null);
    if (!channel || !("send" in channel)) {
      logger.warn({ guildId: config.guildId }, "AI conversation-starter channel unavailable");
      continue;
    }
    const rotation = Math.floor(now / (config.aiConversationStarterMinutes * 60_000));
    const fallback = starters[Math.abs(rotation) % starters.length]!;
    try {
      const content = await generateConversationStarter(fallback, config.aiConversationStarterLastText);
      await channel.send(content);
      await prisma.guildConfig.update({
        where: { guildId: config.guildId },
        data: { aiConversationStarterLastAt: new Date(), aiConversationStarterLastText: content }
      });
    } catch (error) {
      logger.error({ error, guildId: config.guildId }, "AI conversation starter failed");
    }
  }
}

export function startConversationStarterMonitor(client: Client) {
  if (starterTimer) clearInterval(starterTimer);
  void postDueStarters(client);
  starterTimer = setInterval(() => void postDueStarters(client), 60_000);
  starterTimer.unref();
  logger.info("AI conversation-starter monitor initialized");
}
