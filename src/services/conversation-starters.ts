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
const postingGuilds = new Set<string>();

export type ConversationStarterResult = {
  ok: boolean;
  reason?: string;
  content?: string;
};

export async function postConversationStarter(client: Client, guildId: string): Promise<ConversationStarterResult> {
  if (postingGuilds.has(guildId)) return { ok: false, reason: "Nymera is already preparing a conversation starter." };
  const config = await prisma.guildConfig.findUnique({ where: { guildId } });
  if (!config?.aiEnabled) return { ok: false, reason: "Nymera's AI is disabled. Enable it with `/setup ai_enabled:True`." };
  if (!config.aiConversationStarterEnabled) return { ok: false, reason: "Conversation starters are disabled. Enable `start_conversations` with `/ai-settings`." };
  if (!config.aiConversationChannelId) return { ok: false, reason: "No conversation channel is configured. Set `conversation_channel` with `/ai-settings`." };
  const channel = await client.channels.fetch(config.aiConversationChannelId).catch(() => null);
  if (!channel || !("send" in channel)) {
    return { ok: false, reason: `Nymera cannot access or post in <#${config.aiConversationChannelId}>. Check View Channel and Send Messages permissions.` };
  }
  postingGuilds.add(guildId);
  const rotation = Math.floor(Date.now() / (config.aiConversationStarterMinutes * 60_000));
  const fallback = starters[Math.abs(rotation) % starters.length]!;
  try {
    const history = await prisma.generatedContentHistory.findMany({
      where: { guildId, kind: "conversation_starter" },
      orderBy: { createdAt: "desc" },
      take: 12
    });
    const recentContent = [config.aiConversationStarterLastText, ...history.map(entry => entry.content)].filter(Boolean);
    const content = await generateConversationStarter(fallback, recentContent);
    await channel.send(content);
    await prisma.$transaction([
      prisma.guildConfig.update({
        where: { guildId },
        data: { aiConversationStarterLastAt: new Date(), aiConversationStarterLastText: content }
      }),
      prisma.generatedContentHistory.create({ data: { guildId, kind: "conversation_starter", content } })
    ]);
    const expired = await prisma.generatedContentHistory.findMany({
      where: { guildId, kind: "conversation_starter" },
      orderBy: { createdAt: "desc" },
      skip: 30,
      select: { id: true }
    });
    if (expired.length) {
      await prisma.generatedContentHistory.deleteMany({ where: { id: { in: expired.map(entry => entry.id) } } });
    }
    return { ok: true, content };
  } catch (error) {
    logger.error({ error, guildId }, "AI conversation starter failed");
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `The conversation starter failed: \`${detail.slice(0, 500)}\`` };
  } finally {
    postingGuilds.delete(guildId);
  }
}

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
    const result = await postConversationStarter(client, config.guildId);
    if (!result.ok) logger.warn({ guildId: config.guildId, reason: result.reason }, "Scheduled conversation starter did not post");
  }
}

export function startConversationStarterMonitor(client: Client) {
  if (starterTimer) clearInterval(starterTimer);
  void postDueStarters(client);
  starterTimer = setInterval(() => void postDueStarters(client), 60_000);
  starterTimer.unref();
  logger.info("AI conversation-starter monitor initialized");
}
