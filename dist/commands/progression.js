import { randomBytes } from "node:crypto";
import { EmbedBuilder, SlashCommandBuilder, userMention } from "discord.js";
import { prisma } from "../database.js";
import { accountKey, currency, getAccount, periodKey, seedGuildEconomy } from "../services/economy.js";
const PRESTIGE_LEVEL = 25;
const MIN_CHALLENGE_CONTRIBUTION = 10;
async function createReferralCode(guildId, userId) {
    const existing = await prisma.referralCode.findUnique({ where: { guildId_userId: { guildId, userId } } });
    if (existing)
        return existing;
    for (let attempt = 0; attempt < 5; attempt++) {
        const code = `NYM-${randomBytes(3).toString("hex").toUpperCase()}`;
        try {
            return await prisma.referralCode.create({ data: { guildId, userId, code } });
        }
        catch {
            // A collision is extremely rare; generate another code.
        }
    }
    throw new Error("REFERRAL_CODE_FAILED");
}
export const progressionCommands = [
    {
        data: new SlashCommandBuilder().setName("prestige").setDescription("View or advance your prestige")
            .addSubcommand(s => s.setName("info").setDescription("View prestige requirements and rewards"))
            .addSubcommand(s => s.setName("ascend").setDescription("Reset level progress and gain a prestige rank")),
        async execute(i) {
            const action = i.options.getSubcommand();
            const account = await getAccount(i.guildId, i.user.id);
            const reward = 5_000 + account.prestige * 1_000;
            if (action === "info") {
                await i.reply({
                    embeds: [new EmbedBuilder().setColor(0x6f42c1).setTitle("Prestige Through the Veil")
                            .setDescription(`Reach level **${PRESTIGE_LEVEL}** to ascend. Ascending resets XP and level, but preserves your Spellmarks, bank, inventory, familiars, achievements, and cosmetics.`)
                            .addFields({ name: "Current prestige", value: String(account.prestige), inline: true }, { name: "Current level", value: `${account.level}/${PRESTIGE_LEVEL}`, inline: true }, { name: "Next reward", value: `${reward} ${currency}`, inline: true })]
                });
                return;
            }
            if (account.level < PRESTIGE_LEVEL) {
                return void await i.reply({ content: `You must reach level ${PRESTIGE_LEVEL} before ascending.`, ephemeral: true });
            }
            await prisma.$transaction([
                prisma.economyAccount.update({
                    ...accountKey(i.guildId, i.user.id),
                    data: { xp: 0, level: 0, prestige: { increment: 1 }, wallet: { increment: reward } }
                }),
                prisma.economyTransaction.create({
                    data: { guildId: i.guildId, userId: i.user.id, type: "prestige", amount: reward, note: `Prestige ${account.prestige + 1}` }
                })
            ]);
            await i.reply(`✨ You crossed the veil and reached **prestige ${account.prestige + 1}**. Nymera granted you **${reward} ${currency}**.`);
        }
    },
    {
        data: new SlashCommandBuilder().setName("quest-board").setDescription("View all daily and weekly quest progress"),
        async execute(i) {
            await seedGuildEconomy(i.guildId);
            await getAccount(i.guildId, i.user.id);
            const quests = await prisma.quest.findMany({ where: { guildId: i.guildId, enabled: true }, orderBy: { key: "asc" } });
            const lines = [];
            for (const quest of quests) {
                const progress = await prisma.userQuest.findUnique({
                    where: { guildId_userId_questId_periodKey: {
                            guildId: i.guildId, userId: i.user.id, questId: quest.id, periodKey: periodKey(quest.key)
                        } }
                });
                const value = Math.min(progress?.progress ?? 0, quest.target);
                const state = progress?.claimedAt ? "✅ Claimed" : value >= quest.target ? "🎁 Ready to claim" : `${value}/${quest.target}`;
                lines.push(`**${quest.name}** (\`${quest.key}\`)\n${quest.description}\n${state} • ${quest.reward} ${currency}`);
            }
            await i.reply({ embeds: [new EmbedBuilder().setColor(0x6f42c1).setTitle("Nymera's Quest Board")
                        .setDescription(lines.join("\n\n")).setFooter({ text: "Use /claim-quest with the quest key when complete." })] });
        }
    },
    {
        data: new SlashCommandBuilder().setName("achievement-list").setDescription("View every available achievement"),
        async execute(i) {
            await seedGuildEconomy(i.guildId);
            const achievements = await prisma.achievement.findMany({ where: { guildId: i.guildId }, orderBy: { reward: "asc" } });
            const unlocked = await prisma.userAchievement.findMany({ where: { guildId: i.guildId, userId: i.user.id } });
            const ids = new Set(unlocked.map(row => row.achievementId));
            await i.reply({
                embeds: [new EmbedBuilder().setColor(0x6f42c1).setTitle("Hazeground Achievements")
                        .setDescription(achievements.map(a => `${ids.has(a.id) ? "🏆" : "🔒"} **${a.name}** — ${a.description} • ${a.reward} ${currency}`).join("\n"))]
            });
        }
    },
    {
        data: new SlashCommandBuilder().setName("coven-challenge").setDescription("View or claim the weekly server challenge")
            .addSubcommand(s => s.setName("view").setDescription("View this week's community progress"))
            .addSubcommand(s => s.setName("claim").setDescription("Claim the completed community reward")),
        async execute(i) {
            const key = periodKey("weekly_coven");
            const challenge = await prisma.covenChallenge.upsert({
                where: { guildId_periodKey: { guildId: i.guildId, periodKey: key } },
                update: {},
                create: { guildId: i.guildId, periodKey: key }
            });
            const contribution = await prisma.covenContribution.findUnique({
                where: { guildId_periodKey_userId: { guildId: i.guildId, periodKey: key, userId: i.user.id } }
            });
            if (i.options.getSubcommand() === "view") {
                const leaders = await prisma.covenContribution.findMany({
                    where: { guildId: i.guildId, periodKey: key },
                    orderBy: { progress: "desc" },
                    take: 5
                });
                await i.reply({
                    embeds: [new EmbedBuilder().setColor(challenge.completedAt ? 0x2ecc71 : 0x6f42c1).setTitle("Weekly Coven Challenge")
                            .setDescription(`Send **${challenge.target} eligible messages** together before the weekly reset.`)
                            .addFields({ name: "Server progress", value: `${Math.min(challenge.progress, challenge.target)}/${challenge.target}`, inline: true }, { name: "Your contribution", value: `${contribution?.progress ?? 0}`, inline: true }, { name: "Reward", value: `${challenge.reward} ${currency}`, inline: true }, { name: "Top contributors", value: leaders.map((row, n) => `${n + 1}. ${userMention(row.userId)} — ${row.progress}`).join("\n") || "No contributions yet." })
                            .setFooter({ text: `Contribute at least ${MIN_CHALLENGE_CONTRIBUTION} eligible messages to claim.` })]
                });
                return;
            }
            if (!challenge.completedAt)
                return void await i.reply({ content: "The coven challenge is not complete yet.", ephemeral: true });
            if (!contribution || contribution.progress < MIN_CHALLENGE_CONTRIBUTION) {
                return void await i.reply({ content: `You need at least ${MIN_CHALLENGE_CONTRIBUTION} contributions to claim this reward.`, ephemeral: true });
            }
            if (contribution.claimedAt)
                return void await i.reply({ content: "You already claimed this week's reward.", ephemeral: true });
            await prisma.$transaction([
                prisma.covenContribution.update({
                    where: { guildId_periodKey_userId: { guildId: i.guildId, periodKey: key, userId: i.user.id } },
                    data: { claimedAt: new Date() }
                }),
                prisma.economyAccount.upsert({
                    ...accountKey(i.guildId, i.user.id),
                    update: { wallet: { increment: challenge.reward } },
                    create: { guildId: i.guildId, userId: i.user.id, wallet: challenge.reward }
                }),
                prisma.economyTransaction.create({
                    data: { guildId: i.guildId, userId: i.user.id, type: "coven_challenge", amount: challenge.reward, note: key }
                })
            ]);
            await i.reply(`The coven succeeded. You received **${challenge.reward} ${currency}**.`);
        }
    },
    {
        data: new SlashCommandBuilder().setName("referral").setDescription("Invite friends and earn referral rewards")
            .addSubcommand(s => s.setName("code").setDescription("Create or view your referral code"))
            .addSubcommand(s => s.setName("claim").setDescription("Claim a friend's referral code once")
            .addStringOption(o => o.setName("code").setDescription("Referral code").setRequired(true)))
            .addSubcommand(s => s.setName("stats").setDescription("View your successful referrals")),
        async execute(i) {
            const action = i.options.getSubcommand();
            if (action === "code") {
                const referral = await createReferralCode(i.guildId, i.user.id);
                await i.reply({ content: `Your referral code is **${referral.code}**. New members can use \`/referral claim code:${referral.code}\`.`, ephemeral: true });
                return;
            }
            if (action === "stats") {
                const total = await prisma.referralClaim.count({ where: { guildId: i.guildId, inviterId: i.user.id } });
                await i.reply({ content: `You have welcomed **${total} referred member${total === 1 ? "" : "s"}** and earned **${total * 500} ${currency}**.`, ephemeral: true });
                return;
            }
            const code = i.options.getString("code", true).trim().toUpperCase();
            const referral = await prisma.referralCode.findUnique({ where: { code } });
            if (!referral || referral.guildId !== i.guildId)
                return void await i.reply({ content: "That referral code is not valid in this server.", ephemeral: true });
            if (referral.userId === i.user.id)
                return void await i.reply({ content: "You cannot claim your own referral code.", ephemeral: true });
            if (Date.now() - i.user.createdTimestamp < 7 * 86_400_000) {
                return void await i.reply({ content: "Discord accounts must be at least seven days old to claim referral rewards.", ephemeral: true });
            }
            const account = await getAccount(i.guildId, i.user.id);
            if (account.messages > 50)
                return void await i.reply({ content: "Referral codes are for newer community members and must be claimed before 50 eligible messages.", ephemeral: true });
            try {
                await prisma.$transaction([
                    prisma.referralClaim.create({ data: { guildId: i.guildId, invitedUserId: i.user.id, inviterId: referral.userId, code } }),
                    prisma.economyAccount.update({ ...accountKey(i.guildId, i.user.id), data: { wallet: { increment: 250 } } }),
                    prisma.economyAccount.upsert({
                        ...accountKey(i.guildId, referral.userId),
                        update: { wallet: { increment: 500 } },
                        create: { guildId: i.guildId, userId: referral.userId, wallet: 500 }
                    }),
                    prisma.economyTransaction.createMany({ data: [
                            { guildId: i.guildId, userId: i.user.id, type: "referral_welcome", amount: 250, note: referral.userId },
                            { guildId: i.guildId, userId: referral.userId, type: "referral_reward", amount: 500, note: i.user.id }
                        ] })
                ]);
                await i.reply(`Welcome to the coven! You received **250 ${currency}**, and ${userMention(referral.userId)} received **500 ${currency}**.`);
            }
            catch {
                await i.reply({ content: "You have already claimed a referral code in this server.", ephemeral: true });
            }
        }
    }
];
