import { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder, userMention } from "discord.js";
import { prisma } from "../database.js";
import { accountKey, changeWallet, currency, formatDuration, getAccount, periodKey, remaining, seedGuildEconomy } from "../services/economy.js";
const DAY = 86_400_000;
const WEEK = 7 * DAY;
const rewardCommand = (name, cooldown, amount) => ({
    data: new SlashCommandBuilder().setName(name).setDescription(`Claim your ${name} ${currency}`),
    async execute(i) {
        const account = await getAccount(i.guildId, i.user.id);
        const last = name === "daily" ? account.dailyAt : account.weeklyAt;
        const wait = remaining(last, cooldown);
        if (wait)
            return void await i.reply({ content: `Return in ${formatDuration(wait)}.`, ephemeral: true });
        await prisma.$transaction([
            prisma.economyAccount.update({ ...accountKey(i.guildId, i.user.id), data: { wallet: { increment: amount }, [name === "daily" ? "dailyAt" : "weeklyAt"]: new Date() } }),
            prisma.economyTransaction.create({ data: { guildId: i.guildId, userId: i.user.id, type: name, amount } })
        ]);
        await i.reply(`The mist grants you **${amount} ${currency}**.`);
    }
});
export const economyCommands = [
    {
        data: new SlashCommandBuilder().setName("balance").setDescription("View a member's Spellmarks")
            .addUserOption(o => o.setName("user").setDescription("Member")),
        async execute(i) {
            const user = i.options.getUser("user") ?? i.user;
            const a = await getAccount(i.guildId, user.id);
            await i.reply({ embeds: [new EmbedBuilder().setColor(0x6f42c1).setTitle(`${user.username}'s balance`)
                        .addFields({ name: "Wallet", value: `${a.wallet} ${currency}`, inline: true }, { name: "Bank", value: `${a.bank} ${currency}`, inline: true }, { name: "Level / XP", value: `${a.level} / ${a.xp}`, inline: true })] });
        }
    },
    rewardCommand("daily", DAY, 250),
    rewardCommand("weekly", WEEK, 1500),
    {
        data: new SlashCommandBuilder().setName("work").setDescription("Work for Spellmarks"),
        async execute(i) {
            const a = await getAccount(i.guildId, i.user.id);
            const wait = remaining(a.workAt, 3_600_000);
            if (wait)
                return void await i.reply({ content: `Rest for ${formatDuration(wait)}.`, ephemeral: true });
            const amount = 60 + Math.floor(Math.random() * 91);
            await prisma.$transaction([
                prisma.economyAccount.update({ ...accountKey(i.guildId, i.user.id), data: { wallet: { increment: amount }, workAt: new Date() } }),
                prisma.economyTransaction.create({ data: { guildId: i.guildId, userId: i.user.id, type: "work", amount } })
            ]);
            await i.reply(`Your work earned **${amount} ${currency}**.`);
        }
    },
    ...["deposit", "withdraw"].map((name) => ({
        data: new SlashCommandBuilder().setName(name).setDescription(`${name} Spellmarks`)
            .addIntegerOption(o => o.setName("amount").setDescription("Amount").setRequired(true).setMinValue(1)),
        async execute(i) {
            const amount = i.options.getInteger("amount", true);
            const a = await getAccount(i.guildId, i.user.id);
            if ((name === "deposit" ? a.wallet : a.bank) < amount)
                return void await i.reply({ content: "You do not have enough.", ephemeral: true });
            const capacity = 5_000 * (a.bankLevel + 1);
            if (name === "deposit" && a.bank + amount > capacity) {
                return void await i.reply({ content: `Your bank can hold ${capacity} ${currency}. Use \`/bank upgrade\` for more room.`, ephemeral: true });
            }
            await prisma.economyAccount.update({ ...accountKey(i.guildId, i.user.id), data: name === "deposit"
                    ? { wallet: { decrement: amount }, bank: { increment: amount } }
                    : { wallet: { increment: amount }, bank: { decrement: amount } } });
            await i.reply(`${name === "deposit" ? "Deposited" : "Withdrew"} **${amount} ${currency}**.`);
        }
    })),
    {
        data: new SlashCommandBuilder().setName("give").setDescription("Give Spellmarks to another member")
            .addUserOption(o => o.setName("user").setDescription("Recipient").setRequired(true))
            .addIntegerOption(o => o.setName("amount").setDescription("Amount").setRequired(true).setMinValue(1)),
        async execute(i) {
            const user = i.options.getUser("user", true);
            if (user.bot || user.id === i.user.id)
                return void await i.reply({ content: "Choose another human member.", ephemeral: true });
            const amount = i.options.getInteger("amount", true);
            try {
                await prisma.$transaction(async (tx) => {
                    const sender = await tx.economyAccount.upsert({ ...accountKey(i.guildId, i.user.id), update: {}, create: { guildId: i.guildId, userId: i.user.id } });
                    if (sender.wallet < amount)
                        throw new Error("INSUFFICIENT_FUNDS");
                    await tx.economyAccount.update({ ...accountKey(i.guildId, i.user.id), data: { wallet: { decrement: amount } } });
                    await tx.economyAccount.upsert({ ...accountKey(i.guildId, user.id), update: { wallet: { increment: amount } }, create: { guildId: i.guildId, userId: user.id, wallet: amount } });
                    await tx.economyTransaction.createMany({ data: [
                            { guildId: i.guildId, userId: i.user.id, type: "gift_sent", amount: -amount, note: user.id },
                            { guildId: i.guildId, userId: user.id, type: "gift_received", amount, note: i.user.id }
                        ] });
                });
                await i.reply(`Gave ${userMention(user.id)} **${amount} ${currency}**.`);
            }
            catch {
                await i.reply({ content: "You do not have enough Spellmarks.", ephemeral: true });
            }
        }
    },
    {
        data: new SlashCommandBuilder().setName("shop").setDescription("Browse the server shop"),
        async execute(i) {
            await seedGuildEconomy(i.guildId);
            const items = await prisma.shopItem.findMany({ where: { guildId: i.guildId, enabled: true }, orderBy: { price: "asc" } });
            await i.reply({ embeds: [new EmbedBuilder().setColor(0x6f42c1).setTitle("Hazeground Shop").setDescription(items.map(x => `**${x.name}** (\`${x.key}\`) — ${x.price} ${currency}\n${x.description}${x.stock === null ? "" : ` • ${x.stock} left`}`).join("\n\n"))] });
        }
    },
    {
        data: new SlashCommandBuilder().setName("buy").setDescription("Buy a shop item")
            .addStringOption(o => o.setName("item").setDescription("Item key from /shop").setRequired(true))
            .addIntegerOption(o => o.setName("quantity").setDescription("Quantity").setMinValue(1).setMaxValue(25)),
        async execute(i) {
            const key = i.options.getString("item", true).toLowerCase();
            const quantity = i.options.getInteger("quantity") ?? 1;
            const item = await prisma.shopItem.findUnique({ where: { guildId_key: { guildId: i.guildId, key } } });
            if (!item?.enabled || (item.stock !== null && item.stock < quantity))
                return void await i.reply({ content: "That item is unavailable.", ephemeral: true });
            const cost = item.price * quantity;
            try {
                await prisma.$transaction(async (tx) => {
                    const a = await tx.economyAccount.upsert({ ...accountKey(i.guildId, i.user.id), update: {}, create: { guildId: i.guildId, userId: i.user.id } });
                    if (a.wallet < cost)
                        throw new Error("INSUFFICIENT_FUNDS");
                    await tx.economyAccount.update({ ...accountKey(i.guildId, i.user.id), data: { wallet: { decrement: cost } } });
                    await tx.inventoryItem.upsert({
                        where: { guildId_userId_itemId: { guildId: i.guildId, userId: i.user.id, itemId: item.id } },
                        update: { quantity: { increment: quantity } },
                        create: { guildId: i.guildId, userId: i.user.id, itemId: item.id, quantity }
                    });
                    if (item.stock !== null)
                        await tx.shopItem.update({ where: { id: item.id }, data: { stock: { decrement: quantity } } });
                    await tx.economyTransaction.create({ data: { guildId: i.guildId, userId: i.user.id, type: "purchase", amount: -cost, note: `${quantity}x ${item.key}` } });
                });
                await i.reply(`Purchased **${quantity}× ${item.name}** for ${cost} ${currency}.`);
            }
            catch {
                await i.reply({ content: "You do not have enough Spellmarks.", ephemeral: true });
            }
        }
    },
    {
        data: new SlashCommandBuilder().setName("inventory").setDescription("View a member's inventory")
            .addUserOption(o => o.setName("user").setDescription("Member")),
        async execute(i) {
            const user = i.options.getUser("user") ?? i.user;
            const rows = await prisma.inventoryItem.findMany({ where: { guildId: i.guildId, userId: user.id }, include: { item: true } });
            await i.reply({ content: rows.length ? rows.map(r => `**${r.item.name}** ×${r.quantity}`).join("\n") : "The inventory is empty.", ephemeral: true });
        }
    },
    {
        data: new SlashCommandBuilder().setName("leaderboard").setDescription("Show the Spellmarks leaderboard"),
        async execute(i) {
            const rows = await prisma.economyAccount.findMany({ where: { guildId: i.guildId }, orderBy: [{ wallet: "desc" }, { bank: "desc" }], take: 10 });
            await i.reply({ embeds: [new EmbedBuilder().setColor(0x6f42c1).setTitle("Spellmarks Leaderboard").setDescription(rows.map((a, n) => `**${n + 1}.** ${userMention(a.userId)} — ${a.wallet + a.bank}`).join("\n") || "No accounts yet.")] });
        }
    },
    {
        data: new SlashCommandBuilder().setName("quests").setDescription("View your current quests"),
        async execute(i) {
            await seedGuildEconomy(i.guildId);
            await getAccount(i.guildId, i.user.id);
            const quests = await prisma.quest.findMany({ where: { guildId: i.guildId, enabled: true } });
            const lines = [];
            for (const quest of quests) {
                const progress = await prisma.userQuest.findUnique({
                    where: { guildId_userId_questId_periodKey: { guildId: i.guildId, userId: i.user.id, questId: quest.id, periodKey: periodKey(quest.key) } }
                });
                lines.push(`**${quest.name}** — ${Math.min(progress?.progress ?? 0, quest.target)}/${quest.target} • ${quest.reward} ${currency}${progress?.claimedAt ? " ✓ claimed" : ""}`);
            }
            await i.reply({ embeds: [new EmbedBuilder().setColor(0x6f42c1).setTitle("Your Quests").setDescription(lines.join("\n") || "No active quests.")] });
        }
    },
    {
        data: new SlashCommandBuilder().setName("claim-quest").setDescription("Claim a completed quest")
            .addStringOption(o => o.setName("quest").setDescription("Quest key, e.g. daily_messages").setRequired(true)),
        async execute(i) {
            const key = i.options.getString("quest", true).toLowerCase();
            const quest = await prisma.quest.findUnique({ where: { guildId_key: { guildId: i.guildId, key } } });
            if (!quest)
                return void await i.reply({ content: "Quest not found. Use `/quests`.", ephemeral: true });
            const pk = periodKey(quest.key);
            const progress = await prisma.userQuest.findUnique({
                where: { guildId_userId_questId_periodKey: { guildId: i.guildId, userId: i.user.id, questId: quest.id, periodKey: pk } }
            });
            if (!progress || progress.progress < quest.target || progress.claimedAt)
                return void await i.reply({ content: "That quest is incomplete or already claimed.", ephemeral: true });
            await prisma.$transaction([
                prisma.userQuest.update({ where: { id: progress.id }, data: { claimedAt: new Date() } }),
                prisma.economyAccount.update({ ...accountKey(i.guildId, i.user.id), data: { wallet: { increment: quest.reward } } }),
                prisma.economyTransaction.create({ data: { guildId: i.guildId, userId: i.user.id, type: "quest", amount: quest.reward, note: quest.key } })
            ]);
            await i.reply(`Claimed **${quest.reward} ${currency}** for ${quest.name}.`);
        }
    },
    {
        data: new SlashCommandBuilder().setName("achievements").setDescription("View and unlock achievements"),
        async execute(i) {
            await seedGuildEconomy(i.guildId);
            const account = await getAccount(i.guildId, i.user.id);
            const all = await prisma.achievement.findMany({ where: { guildId: i.guildId } });
            const [gameTotals, uniqueItems, familiarCount] = await Promise.all([
                prisma.gameStat.aggregate({ where: { guildId: i.guildId, userId: i.user.id }, _sum: { won: true } }),
                prisma.inventoryItem.count({ where: { guildId: i.guildId, userId: i.user.id, quantity: { gt: 0 } } }),
                prisma.familiar.count({ where: { guildId: i.guildId, userId: i.user.id, bond: { gt: 0 } } })
            ]);
            for (const achievement of all) {
                const qualifies = (achievement.key === "first_1000" && account.wallet + account.bank >= 1000) ||
                    (achievement.key === "level_5" && account.level >= 5) ||
                    (achievement.key === "level_15" && account.level >= 15) ||
                    (achievement.key === "wealth_10000" && account.wallet + account.bank >= 10_000) ||
                    (achievement.key === "game_winner" && (gameTotals._sum.won ?? 0) >= 1) ||
                    (achievement.key === "collector_10" && uniqueItems >= 10) ||
                    (achievement.key === "familiar_friend" && familiarCount >= 1) ||
                    (achievement.key === "first_prestige" && account.prestige >= 1) ||
                    (achievement.key === "craft_10" && account.crafted >= 10);
                if (qualifies) {
                    const existing = await prisma.userAchievement.findUnique({
                        where: { guildId_userId_achievementId: { guildId: i.guildId, userId: i.user.id, achievementId: achievement.id } }
                    });
                    if (!existing) {
                        await prisma.$transaction([
                            prisma.userAchievement.create({ data: { guildId: i.guildId, userId: i.user.id, achievementId: achievement.id } }),
                            prisma.economyAccount.update({ ...accountKey(i.guildId, i.user.id), data: { wallet: { increment: achievement.reward } } }),
                            prisma.economyTransaction.create({ data: { guildId: i.guildId, userId: i.user.id, type: "achievement", amount: achievement.reward, note: achievement.key } })
                        ]);
                    }
                }
            }
            const unlocked = await prisma.userAchievement.findMany({ where: { guildId: i.guildId, userId: i.user.id }, include: { achievement: true } });
            await i.reply({ embeds: [new EmbedBuilder().setColor(0x6f42c1).setTitle("Your Achievements")
                        .setDescription(unlocked.map(x => `🏆 **${x.achievement.name}** — ${x.achievement.description}`).join("\n") || "No achievements unlocked yet.")] });
        }
    },
    {
        data: new SlashCommandBuilder().setName("economy-admin").setDescription("Add or remove a member's Spellmarks").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
            .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
            .addIntegerOption(o => o.setName("amount").setDescription("Positive to add, negative to remove").setRequired(true).setMinValue(-1000000).setMaxValue(1000000)),
        async execute(i) {
            const user = i.options.getUser("user", true);
            const amount = i.options.getInteger("amount", true);
            try {
                const a = await changeWallet(i.guildId, user.id, amount, "admin", `By ${i.user.id}`);
                await i.reply({ content: `${user.tag} now has ${a.wallet} ${currency}.`, ephemeral: true });
            }
            catch {
                await i.reply({ content: "That change would make the wallet negative.", ephemeral: true });
            }
        }
    }
];
