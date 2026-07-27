import { prisma } from "../database.js";
import { sendGuildLog } from "./logging.js";
const invitePattern = /(discord(?:\.gg|\.com\/invite)\/[a-z0-9-]+)/i;
const recent = new Map();
export async function runAutomod(message) {
    if (!message.guild || message.author.bot || message.member?.permissions.has("ManageMessages"))
        return false;
    const config = await prisma.guildConfig.findUnique({ where: { guildId: message.guild.id } });
    if (!config?.automodEnabled)
        return false;
    const lowered = message.content.toLowerCase();
    let blockedWords = [];
    try {
        const parsed = JSON.parse(config.blockedWords);
        if (Array.isArray(parsed))
            blockedWords = parsed.filter((word) => typeof word === "string");
    }
    catch {
        blockedWords = [];
    }
    const blocked = blockedWords.some(word => word && lowered.includes(word.toLowerCase()));
    const invite = config.blockInvites && invitePattern.test(message.content);
    const key = `${message.guild.id}:${message.author.id}`;
    const now = Date.now();
    const timestamps = (recent.get(key) ?? []).filter(t => now - t < 8_000);
    timestamps.push(now);
    recent.set(key, timestamps);
    const spam = timestamps.length >= 6;
    if (!blocked && !invite && !spam)
        return false;
    await message.delete().catch(() => undefined);
    if (spam && message.member?.moderatable)
        await message.member.timeout(5 * 60_000, "Nymera automod: message spam").catch(() => undefined);
    await sendGuildLog(message.guild, "Automod action", `${message.author.tag}: ${spam ? "spam" : invite ? "invite" : "blocked word"}`);
    return true;
}
