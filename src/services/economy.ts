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

export async function advanceQuestProgress(guildId: string, userId: string, kind: string, amount = 1) {
  const quests = await prisma.quest.findMany({ where: { guildId, enabled: true, kind } });
  for (const quest of quests) {
    await prisma.userQuest.upsert({
      where: { guildId_userId_questId_periodKey: { guildId, userId, questId: quest.id, periodKey: periodKey(quest.key) } },
      update: { progress: { increment: amount } },
      create: { guildId, userId, questId: quest.id, periodKey: periodKey(quest.key), progress: amount }
    });
  }
}

export async function advanceCovenChallenge(guildId: string, userId: string, amount = 1) {
  const key = periodKey("weekly_coven");
  await prisma.$transaction(async tx => {
    const challenge = await tx.covenChallenge.upsert({
      where: { guildId_periodKey: { guildId, periodKey: key } },
      update: { progress: { increment: amount } },
      create: { guildId, periodKey: key, progress: amount }
    });
    if (!challenge.completedAt && challenge.progress >= challenge.target) {
      await tx.covenChallenge.update({
        where: { guildId_periodKey: { guildId, periodKey: key } },
        data: { completedAt: new Date() }
      });
    }
    await tx.covenContribution.upsert({
      where: { guildId_periodKey_userId: { guildId, periodKey: key, userId } },
      update: { progress: { increment: amount } },
      create: { guildId, periodKey: key, userId, progress: amount }
    });
  });
}

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
  await advanceQuestProgress(guildId, userId, "messages");
  await advanceCovenChallenge(guildId, userId);
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
    ["familiar_egg", "Mysterious Familiar Egg", "Hatch this with `/familiar summon`.", 1500],
    ["lavender_bundle", "Lavender Bundle", "A calming potion ingredient.", 90],
    ["rosemary_sprig", "Rosemary Sprig", "A remembrance and warding ingredient.", 85],
    ["moonwater_vial", "Moonwater Vial", "A reflective crafting ingredient.", 125],
    ["crystal_shard", "Crystal Shard", "A luminous spell-crafting material.", 175],
    ["ghost_mushroom", "Ghost Mushroom", "A rare mist-grown crafting ingredient.", 240],
    ["healing_potion", "Comforting Draught", "A crafted collectible potion; not medical treatment.", 550],
    ["focus_potion", "Focus Tonic", "A crafted reflective collectible.", 650],
    ["boundary_spell", "Boundary Charm", "A crafted symbolic spell collectible.", 800],
    ["moon_spell", "Moonlit Intention", "A crafted lunar reflection collectible.", 950],
    ["haunted_lootbox", "Haunted Loot Box", "Contains ingredients, Spellmarks, or a familiar egg.", 700],
    ["halloween_badge", "Pumpkin Moon Badge", "A seasonal gothic collectible.", 1200],
    ["raven_title", "Raven-Kissed Title", "A rare profile title collectible.", 1800],
    ["coven_title", "Coven Keeper Title", "An elegant community profile title.", 2400],
    ["mist_badge", "Silver Mist Badge", "A shimmering profile badge.", 2100],
    ["moonlit_background", "Moonlit Graveyard Background", "A gothic profile background collectible.", 3200],
    ["forest_background", "Enchanted Forest Background", "A woodland profile background collectible.", 3000],
    ["velvet_background", "Crimson Velvet Background", "A luxurious gothic profile background.", 4200],
    ["oracle_badge", "Oracle Eye Badge", "A rare divination profile badge.", 3600],
    ["obsidian_key", "Obsidian Key", "A rare seasonal collectible from beyond the veil.", 5000]
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
    ["weekly_messages", "Coven Presence", "Send 75 eligible messages this week.", "messages", 75, 900],
    ["daily_games", "Games in the Fog", "Play 3 games today.", "games", 3, 225],
    ["weekly_wins", "Mist Champion", "Win 10 games this week.", "wins", 10, 1200],
    ["daily_crafting", "Cauldron Keeper", "Craft 2 items today.", "crafting", 2, 250]
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
    ["level_5", "Mist Adept", "Reach level 5.", 250],
    ["level_15", "Veil Scholar", "Reach level 15.", 750],
    ["wealth_10000", "Treasurer of the Mist", "Hold 10,000 Spellmarks.", 1000],
    ["game_winner", "First Victory", "Win your first game.", 150],
    ["collector_10", "Curio Collector", "Own 10 unique shop items.", 500],
    ["familiar_friend", "Familiar Friend", "Bond with a familiar.", 300],
    ["first_prestige", "Reborn in the Mist", "Reach prestige 1.", 1500],
    ["craft_10", "Practiced Alchemist", "Craft at least 10 items.", 600]
  ] as const;
  for (const [key, name, description, reward] of achievements) {
    await prisma.achievement.upsert({
      where: { guildId_key: { guildId, key } },
      update: { name, description, reward },
      create: { guildId, key, name, description, reward }
    });
  }
}
