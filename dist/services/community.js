import { randomInt } from "node:crypto";
import { EmbedBuilder } from "discord.js";
import { prisma } from "../database.js";
import { logger } from "../logger.js";
export function parseDuration(value) {
    const match = /^(\d+)(m|h|d)$/i.exec(value.trim());
    if (!match)
        return null;
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    const multiplier = unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
    const ms = amount * multiplier;
    return ms >= 60_000 && ms <= 30 * 86_400_000 ? ms : null;
}
function pickWinners(userIds, count) {
    const pool = [...userIds];
    const winners = [];
    while (pool.length && winners.length < count) {
        winners.push(pool.splice(randomInt(0, pool.length), 1)[0]);
    }
    return winners;
}
export async function endGiveaway(client, giveawayId) {
    const giveaway = await prisma.giveaway.findUnique({ where: { id: giveawayId }, include: { entries: true } });
    if (!giveaway || giveaway.endedAt)
        return;
    const winners = pickWinners(giveaway.entries.map(x => x.userId), giveaway.winnerCount);
    const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
    if (channel && "send" in channel) {
        await channel.send(winners.length
            ? `🎉 Giveaway **#${giveaway.id}** ended! ${winners.map(id => `<@${id}>`).join(", ")} won **${giveaway.prize}**.`
            : `Giveaway **#${giveaway.id}** ended with no eligible entries.`);
    }
    await prisma.giveaway.update({ where: { id: giveaway.id }, data: { endedAt: new Date() } });
}
export function startGiveawayMonitor(client) {
    const timer = setInterval(async () => {
        try {
            const due = await prisma.giveaway.findMany({ where: { endedAt: null, endsAt: { lte: new Date() } }, select: { id: true } });
            for (const giveaway of due)
                await endGiveaway(client, giveaway.id);
        }
        catch (error) {
            logger.error({ error }, "Giveaway monitor failed");
        }
    }, 30_000);
    timer.unref();
}
export function giveawayEmbed(prize, endsAt, id) {
    return new EmbedBuilder().setColor(0x9b59b6).setTitle(`🎁 ${prize}`)
        .setDescription(`${id ? `Giveaway **#${id}**\n` : ""}Use \`/giveaway-enter ${id ?? ""}\` to enter.\nEnds <t:${Math.floor(endsAt.getTime() / 1000)}:R>.`)
        .setTimestamp(endsAt);
}
