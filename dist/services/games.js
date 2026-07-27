import { randomInt } from "node:crypto";
import { prisma } from "../database.js";
import { accountKey, advanceQuestProgress, getAccount } from "./economy.js";
export function secureInt(min, maxInclusive) {
    return randomInt(min, maxInclusive + 1);
}
export async function settleGame(input) {
    const wager = input.wager ?? 0;
    const payout = input.payout ?? 0;
    await getAccount(input.guildId, input.userId);
    const result = await prisma.$transaction(async (tx) => {
        const account = await tx.economyAccount.findUniqueOrThrow(accountKey(input.guildId, input.userId));
        if (wager < 0 || payout < 0 || account.wallet < wager)
            throw new Error("INSUFFICIENT_FUNDS");
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
    await advanceQuestProgress(input.guildId, input.userId, "games");
    if (input.outcome === "win")
        await advanceQuestProgress(input.guildId, input.userId, "wins");
    return result;
}
export const triviaQuestions = [
    { q: "Which tarot card is numbered 0 in the Major Arcana?", choices: ["The Fool", "The Moon", "The Tower", "The Star"], answer: 0 },
    { q: "In Dead by Daylight, how many survivors normally enter a standard trial?", choices: ["Three", "Four", "Five", "Six"], answer: 1 },
    { q: "Which herb is traditionally associated with remembrance?", choices: ["Rosemary", "Basil", "Mint", "Thyme"], answer: 0 },
    { q: "What is the phase after a new moon called?", choices: ["Waning gibbous", "Waxing crescent", "Full moon", "Third quarter"], answer: 1 },
    { q: "Who wrote the gothic novel Frankenstein?", choices: ["Bram Stoker", "Mary Shelley", "Shirley Jackson", "Edgar Allan Poe"], answer: 1 },
    { q: "Which tarot card is commonly numbered XIII?", choices: ["Death", "The Hermit", "Justice", "The Sun"], answer: 0 },
    { q: "Who wrote The Haunting of Hill House?", choices: ["Shirley Jackson", "Anne Rice", "Mary Shelley", "Susan Hill"], answer: 0 },
    { q: "Which Survivor item is primarily used for faster generator repairs?", choices: ["Map", "Key", "Toolbox", "Med-Kit"], answer: 2 },
    { q: "Which moon phase appears fully illuminated from Earth?", choices: ["New moon", "Full moon", "First quarter", "Waning crescent"], answer: 1 },
    { q: "Which culinary herb has needle-like leaves and is often used with roasted potatoes?", choices: ["Rosemary", "Cilantro", "Dill", "Chives"], answer: 0 },
    { q: "Who wrote the novel Dracula?", choices: ["Oscar Wilde", "Bram Stoker", "Henry James", "H. G. Wells"], answer: 1 },
    { q: "In Dead by Daylight, how many generators normally power the exit gates?", choices: ["Three", "Four", "Five", "Six"], answer: 2 },
    { q: "What does waxing mean for the Moon?", choices: ["Its illumination is increasing", "Its illumination is decreasing", "It is eclipsed", "It is below the horizon"], answer: 0 },
    { q: "Which Major Arcana card is associated with hope and renewal?", choices: ["The Tower", "The Devil", "The Star", "The Emperor"], answer: 2 },
    { q: "What alternate escape may appear in a Dead by Daylight trial?", choices: ["A mirror", "The Hatch", "A portal", "A ladder"], answer: 1 }
];
export const hangmanWords = ["grimoire", "specter", "moonlight", "familiar", "cauldron", "nightmare"];
