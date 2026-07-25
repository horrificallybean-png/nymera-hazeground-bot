import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export async function ensureGuild(guildId: string) {
  return prisma.guildConfig.upsert({
    where: { guildId },
    update: {},
    create: { guildId }
  });
}
