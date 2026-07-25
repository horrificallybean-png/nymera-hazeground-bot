import { randomInt } from "node:crypto";
import { prisma } from "../database.js";
import { accountKey, getAccount } from "./economy.js";

export type GameOutcome = "win" | "loss" | "draw";

export function secureInt(min: number, maxInclusive: number) {
  return randomInt(min, maxInclusive + 1);
}

export async function settleGame(input: {
  guildId: string;
  userId: string;
  game: string;
  outcome: GameOutcome;
  wager?: number;
  payout?: number;
  detail?: string;
  score?: number;
}) {
  const wager = input.wager ?? 0;
  const payout = input.payout ?? 0;
  await getAccount(input.guildId, input.userId);
  return prisma.$transaction(async tx => {
    const account = await tx.economyAccount.findUniqueOrThrow(accountKey(input.guildId, input.userId));
    if (wager < 0 || payout < 0 || account.wallet < wager) throw new Error("INSUFFICIENT_FUNDS");
    const net = payout - wager;
    await tx.economyAccount.update({
      ...accountKey(input.guildId, input.userId),
      data: { wallet: { increment: net } }
    });
    const current = await tx.gameStat.findUnique({
      where: { guildId_userId_game: { guildId: input.guildId, userId: input.userId, game: input.game } }
    });
    const bestScore = Math.max(current?.bestScore ?? 0, input.score ?? 0);
    await tx.gameStat.upsert({
      where: { guildId_userId_game: { guildId: input.guildId, userId: input.userId, game: input.game } },
      update: {
        played: { increment: 1 },
        won: { increment: input.outcome === "win" ? 1 : 0 },
        lost: { increment: input.outcome === "loss" ? 1 : 0 },
        earned: { increment: net },
        wagered: { increment: wager },
        bestScore
      },
      create: {
        guildId: input.guildId, userId: input.userId, game: input.game,
        played: 1, won: input.outcome === "win" ? 1 : 0, lost: input.outcome === "loss" ? 1 : 0,
        earned: net, wagered: wager, bestScore
      }
    });
    await tx.gameResult.create({ data: { ...input, wager, payout } });
    if (net !== 0) {
      await tx.economyTransaction.create({
        data: { guildId: input.guildId, userId: input.userId, type: `game_${input.game}`, amount: net, note: input.detail }
      });
    }
    return { net, balance: account.wallet + net };
  });
}

export const triviaQuestions = [
  { q: "Which tarot card is numbered 0 in the Major Arcana?", choices: ["The Fool", "The Moon", "The Tower", "The Star"], answer: 0 },
  { q: "In Dead by Daylight, how many survivors normally enter a standard trial?", choices: ["Three", "Four", "Five", "Six"], answer: 1 },
  { q: "Which herb is traditionally associated with remembrance?", choices: ["Rosemary", "Basil", "Mint", "Thyme"], answer: 0 },
  { q: "What is the phase after a new moon called?", choices: ["Waning gibbous", "Waxing crescent", "Full moon", "Third quarter"], answer: 1 },
  { q: "Who wrote the gothic novel Frankenstein?", choices: ["Bram Stoker", "Mary Shelley", "Shirley Jackson", "Edgar Allan Poe"], answer: 1 }
] as const;

export const hangmanWords = ["grimoire", "specter", "moonlight", "familiar", "cauldron", "nightmare"];
