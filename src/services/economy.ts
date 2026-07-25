import { prisma } from "../database.js";
import type { Guild, GuildMember } from "discord.js";

export const currency = "Spellmarks";
export const accountKey = (guildId: string, userId: string) => ({
  where: { guildId_userId: { guildId, userId } }
});

export async function getAccount(guildId: string, userId: string) {
  return prisma.economyAccount.upsert({
    ...accountKey(guildId, userId),
    update: {},
    create: { guildId, userId }
  });
}

export function remaining(last: Date | null, cooldownMs: number) {
  if (!last) return 0;
  return Math.max(0, cooldownMs - (Date.now() - last.getTime()));
}

export function formatDuration(ms: number) {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.ceil((ms % 3_600_000) / 60_000);
  return `${hours ? `${hours}h ` : ""}${minutes}m`;
}

export async function changeWallet(guildId: string, userId: string, amount: number, type: string, note?: string) {
  return prisma.$transaction(async tx => {
    const account = await tx.economyAccount.upsert({
      ...accountKey(guildId, userId),
      update: {},
      create: { guildId, userId }
    });
    if (account.wallet + amount < 0) throw new Error("INSUFFICIENT_FUNDS");
    const updated = await tx.economyAccount.update({
      ...accountKey(guildId, userId),
      data: { wallet: { increment: amount } }
    });
    await tx.economyTransaction.create({ data: { guildId, userId, amount, type, note } });
    return updated;
  });
}

export const levelForXp = (xp: number) => Math.floor(Math.sqrt(xp / 100));
export const periodKey = (key: string, date = new Date()) => {
  const day = date.toISOString().slice(0, 10);
  if (key.startsWith("weekly")) {
    const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((date.getTime() - start.getTime()) / 86_400_000) + start.getUTCDay() + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  }
  return day;
};

export async function recordMessage(guildId: string, userId: string) {
  const gainedXp = 8 + Math.floor(Math.random() * 8);
  const account = await getAccount(guildId, userId);
  const nextXp = account.xp + gainedXp;
  const nextLevel = levelForXp(nextXp);
  const reward = nextLevel > account.level ? nextLevel * 50 : 0;
  const updated = await prisma.economyAccount.update({
    ...accountKey(guildId, userId),
    data: { xp: nextXp, level: nextLevel, messages: { increment: 1 }, wallet: { increment: reward } }
  });
  const quests = await prisma.quest.findMany({ where: { guildId, enabled: true, kind: "messages" } });
  for (const quest of quests) {
    await prisma.userQuest.upsert({
      where: { guildId_userId_questId_periodKey: { guildId, userId, questId: quest.id, periodKey: periodKey(quest.key) } },
      update: { progress: { increment: 1 } },
      create: { guildId, userId, questId: quest.id, periodKey: periodKey(quest.key), progress: 1 }
    });
  }
  return {
    account: updated,
    leveledUp: nextLevel > account.level,
    previousLevel: account.level,
    level: nextLevel,
    reward
  };
}

export async function applyLevelRewards(guild: Guild, member: GuildMember, level: number) {
  const rewards = await prisma.levelReward.findMany({
    where: { guildId: guild.id, level: { lte: level } },
    orderBy: { level: "asc" }
  });
  const granted: string[] = [];
  for (const reward of rewards) {
    if (member.roles.cache.has(reward.roleId)) continue;
    await member.roles.add(reward.roleId, `Nymera level ${reward.level} reward`);
    granted.push(reward.roleId);
  }
  return granted;
}

export async function seedGuildEconomy(guildId: string) {
  const items = [
    ["mist_title", "Mist-Walker Title", "A collectible profile title.", 500],
    ["violet_badge", "Violet Moon Badge", "A permanent inventory badge.", 900],
    ["familiar_egg", "Mysterious Familiar Egg", "A sealed collectible for a future phase.", 1500]
  ] as const;
  for (const [key, name, description, price] of items) {
    await prisma.shopItem.upsert({
      where: { guildId_key: { guildId, key } },
      update: { name, description, price },
      create: { guildId, key, name, description, price }
    });
  }
  const quests = [
    ["daily_messages", "Whispers in the Mist", "Send 10 eligible messages today.", "messages", 10, 150],
    ["weekly_messages", "Coven Presence", "Send 75 eligible messages this week.", "messages", 75, 900]
  ] as const;
  for (const [key, name, description, kind, target, reward] of quests) {
    await prisma.quest.upsert({
      where: { guildId_key: { guildId, key } },
      update: { name, description, kind, target, reward },
      create: { guildId, key, name, description, kind, target, reward }
    });
  }
  const achievements = [
    ["first_1000", "Gathering Power", "Hold 1,000 Spellmarks.", 100],
    ["level_5", "Mist Adept", "Reach level 5.", 250]
  ] as const;
  for (const [key, name, description, reward] of achievements) {
    await prisma.achievement.upsert({
      where: { guildId_key: { guildId, key } },
      update: { name, description, reward },
      create: { guildId, key, name, description, reward }
    });
  }
}
