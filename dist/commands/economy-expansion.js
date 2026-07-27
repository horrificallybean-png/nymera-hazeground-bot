import { EmbedBuilder, SlashCommandBuilder, userMention } from "discord.js";
import { prisma } from "../database.js";
import { accountKey, currency, formatDuration, getAccount, remaining, seedGuildEconomy } from "../services/economy.js";
import { secureInt, settleGame } from "../services/games.js";
const DAY = 86_400_000;
const bankCapacity = (level) => 5_000 * (level + 1);
const bankUpgradeCost = (level) => 2_000 * (level + 1);
const profileLabels = {
    mist_title: "Mist-Walker",
    raven_title: "Raven-Kissed",
    coven_title: "Coven Keeper",
    violet_badge: "Violet Moon",
    halloween_badge: "Pumpkin Moon",
    mist_badge: "Silver Mist",
    oracle_badge: "Oracle Eye",
    moonlit_background: "Moonlit Graveyard",
    forest_background: "Enchanted Forest",
    velvet_background: "Crimson Velvet"
};
const profileType = (key) => {
    if (key.endsWith("_title"))
        return "title";
    if (key.endsWith("_badge"))
        return "badge";
    if (key.endsWith("_background"))
        return "background";
    return null;
};
export const economyExpansionCommands = [
    {
        data: new SlashCommandBuilder().setName("bank").setDescription("Manage your upgraded Spellmark bank")
            .addSubcommand(s => s.setName("info").setDescription("View your bank tier, capacity, and interest"))
            .addSubcommand(s => s.setName("upgrade").setDescription("Upgrade your bank capacity and interest rate"))
            .addSubcommand(s => s.setName("interest").setDescription("Claim your daily bank interest")),
        async execute(i) {
            const action = i.options.getSubcommand();
            const account = await getAccount(i.guildId, i.user.id);
            const capacity = bankCapacity(account.bankLevel);
            const rate = Math.min(1 + account.bankLevel, 5);
            if (action === "info") {
                const wait = remaining(account.bankInterestAt, DAY);
                await i.reply({
                    embeds: [new EmbedBuilder().setColor(0x6f42c1).setTitle("Mistbound Bank")
                            .addFields({ name: "Bank tier", value: `${account.bankLevel + 1}/11`, inline: true }, { name: "Savings", value: `${account.bank}/${capacity} ${currency}`, inline: true }, { name: "Daily interest", value: `${rate}%`, inline: true }, { name: "Next upgrade", value: account.bankLevel >= 10 ? "Maximum tier" : `${bankUpgradeCost(account.bankLevel)} ${currency}`, inline: true }, { name: "Interest ready", value: wait ? `In ${formatDuration(wait)}` : "Now", inline: true })]
                });
                return;
            }
            if (action === "upgrade") {
                if (account.bankLevel >= 10)
                    return void await i.reply({ content: "Your bank is already at its maximum tier.", ephemeral: true });
                const cost = bankUpgradeCost(account.bankLevel);
                if (account.wallet < cost)
                    return void await i.reply({ content: `You need ${cost} ${currency} in your wallet.`, ephemeral: true });
                await prisma.$transaction([
                    prisma.economyAccount.update({
                        ...accountKey(i.guildId, i.user.id),
                        data: { wallet: { decrement: cost }, bankLevel: { increment: 1 } }
                    }),
                    prisma.economyTransaction.create({
                        data: { guildId: i.guildId, userId: i.user.id, type: "bank_upgrade", amount: -cost, note: `Tier ${account.bankLevel + 2}` }
                    })
                ]);
                await i.reply(`Your bank reached **tier ${account.bankLevel + 2}** and can now hold **${bankCapacity(account.bankLevel + 1)} ${currency}**.`);
                return;
            }
            const wait = remaining(account.bankInterestAt, DAY);
            if (wait)
                return void await i.reply({ content: `Interest returns in ${formatDuration(wait)}.`, ephemeral: true });
            if (account.bank < 100)
                return void await i.reply({ content: `Keep at least 100 ${currency} in the bank to earn interest.`, ephemeral: true });
            if (account.bank >= capacity)
                return void await i.reply({ content: "Your bank is full. Withdraw some savings or upgrade it before claiming interest.", ephemeral: true });
            const earned = Math.max(1, Math.min(2_500, capacity - account.bank, Math.floor(account.bank * rate / 100)));
            await prisma.$transaction([
                prisma.economyAccount.update({
                    ...accountKey(i.guildId, i.user.id),
                    data: { bank: { increment: earned }, bankInterestAt: new Date() }
                }),
                prisma.economyTransaction.create({
                    data: { guildId: i.guildId, userId: i.user.id, type: "bank_interest", amount: earned, note: `${rate}% interest` }
                })
            ]);
            await i.reply(`The Mistbound Bank added **${earned} ${currency}** to your savings.`);
        }
    },
    {
        data: new SlashCommandBuilder().setName("profile").setDescription("View or customize an economy profile")
            .addSubcommand(s => s.setName("view").setDescription("View a member's profile")
            .addUserOption(o => o.setName("user").setDescription("Member")))
            .addSubcommand(s => s.setName("equip").setDescription("Equip a title, badge, or background you own")
            .addStringOption(o => o.setName("item").setDescription("Inventory item key").setRequired(true)))
            .addSubcommand(s => s.setName("clear").setDescription("Clear an equipped profile slot")
            .addStringOption(o => o.setName("slot").setDescription("Profile slot").setRequired(true)
            .addChoices({ name: "Title", value: "title" }, { name: "Badge", value: "badge" }, { name: "Background", value: "background" }))),
        async execute(i) {
            const action = i.options.getSubcommand();
            if (action === "view") {
                const user = i.options.getUser("user") ?? i.user;
                const account = await getAccount(i.guildId, user.id);
                const collection = await prisma.inventoryItem.count({ where: { guildId: i.guildId, userId: user.id } });
                await i.reply({
                    embeds: [new EmbedBuilder().setColor(0x6f42c1).setTitle(`${user.username}'s Hazeground Profile`)
                            .setDescription(account.equippedBackground ? `Background: **${profileLabels[account.equippedBackground] ?? account.equippedBackground}**` : "A wanderer moving quietly through the mist.")
                            .addFields({ name: "Title", value: account.equippedTitle ? profileLabels[account.equippedTitle] ?? account.equippedTitle : "None", inline: true }, { name: "Badge", value: account.equippedBadge ? profileLabels[account.equippedBadge] ?? account.equippedBadge : "None", inline: true }, { name: "Level", value: String(account.level), inline: true }, { name: "Wealth", value: `${account.wallet + account.bank} ${currency}`, inline: true }, { name: "Collection", value: `${collection} unique items`, inline: true })]
                });
                return;
            }
            if (action === "equip") {
                await seedGuildEconomy(i.guildId);
                const key = i.options.getString("item", true).toLowerCase();
                const type = profileType(key);
                if (!type)
                    return void await i.reply({ content: "That item is not an equipable title, badge, or background.", ephemeral: true });
                const owned = await prisma.inventoryItem.findFirst({
                    where: { guildId: i.guildId, userId: i.user.id, quantity: { gt: 0 }, item: { key } }
                });
                if (!owned)
                    return void await i.reply({ content: "You do not own that item. Check `/shop` and `/inventory`.", ephemeral: true });
                const field = type === "title" ? "equippedTitle" : type === "badge" ? "equippedBadge" : "equippedBackground";
                await prisma.economyAccount.update({ ...accountKey(i.guildId, i.user.id), data: { [field]: key } });
                await i.reply(`Equipped **${profileLabels[key] ?? key}** as your ${type}.`);
                return;
            }
            const slot = i.options.getString("slot", true);
            const field = slot === "title" ? "equippedTitle" : slot === "badge" ? "equippedBadge" : "equippedBackground";
            await getAccount(i.guildId, i.user.id);
            await prisma.economyAccount.update({ ...accountKey(i.guildId, i.user.id), data: { [field]: null } });
            await i.reply({ content: `Your equipped ${slot} was cleared.`, ephemeral: true });
        }
    },
    {
        data: new SlashCommandBuilder().setName("blackjack").setDescription("Play a quick game of mist blackjack")
            .addIntegerOption(o => o.setName("bet").setDescription("Spellmarks wager").setRequired(true).setMinValue(25).setMaxValue(10_000)),
        async execute(i) {
            const bet = i.options.getInteger("bet", true);
            const card = () => secureInt(2, 11);
            let player = card() + card();
            let dealer = card() + card();
            while (player < 17)
                player += card();
            while (dealer < 17)
                dealer += card();
            const playerBust = player > 21;
            const dealerBust = dealer > 21;
            const won = !playerBust && (dealerBust || player > dealer);
            const push = !playerBust && !dealerBust && player === dealer;
            const payout = push ? bet : won ? bet * 2 : 0;
            try {
                const settled = await settleGame({
                    guildId: i.guildId, userId: i.user.id, game: "blackjack",
                    outcome: push ? "draw" : won ? "win" : "loss", wager: bet, payout,
                    detail: `player=${player},dealer=${dealer}`, score: playerBust ? 0 : player
                });
                await i.reply(`You drew **${player}**; Nymera drew **${dealer}**. ${push ? "The wager was returned." : won ? `You won ${bet} ${currency}!` : `You lost ${bet} ${currency}.`} Balance: ${settled.balance}.`);
            }
            catch {
                await i.reply({ content: "You do not have enough Spellmarks.", ephemeral: true });
            }
        }
    },
    {
        data: new SlashCommandBuilder().setName("high-low").setDescription("Guess whether the next rune is higher or lower")
            .addStringOption(o => o.setName("choice").setDescription("Your prediction").setRequired(true)
            .addChoices({ name: "Higher", value: "higher" }, { name: "Lower", value: "lower" }))
            .addIntegerOption(o => o.setName("bet").setDescription("Spellmarks wager").setRequired(true).setMinValue(10).setMaxValue(5_000)),
        async execute(i) {
            const choice = i.options.getString("choice", true);
            const bet = i.options.getInteger("bet", true);
            const first = secureInt(1, 13);
            const second = secureInt(1, 13);
            const push = first === second;
            const won = !push && (choice === "higher" ? second > first : second < first);
            try {
                const settled = await settleGame({
                    guildId: i.guildId, userId: i.user.id, game: "high_low",
                    outcome: push ? "draw" : won ? "win" : "loss", wager: bet, payout: push ? bet : won ? bet * 2 : 0,
                    detail: `${first}->${second}`, score: won ? 1 : 0
                });
                await i.reply(`The runes shift from **${first}** to **${second}**. ${push ? "A tie—your wager returns." : won ? `You won ${bet} ${currency}!` : `You lost ${bet} ${currency}.`} Balance: ${settled.balance}.`);
            }
            catch {
                await i.reply({ content: "You do not have enough Spellmarks.", ephemeral: true });
            }
        }
    },
    {
        data: new SlashCommandBuilder().setName("scratch-card").setDescription("Buy a 100-Spellmark haunted scratch card"),
        async execute(i) {
            const symbols = ["Moon", "Raven", "Candle", "Skull", "Key"];
            const draws = [symbols[secureInt(0, 4)], symbols[secureInt(0, 4)], symbols[secureInt(0, 4)]];
            const triple = new Set(draws).size === 1;
            const pair = new Set(draws).size === 2;
            const payout = triple ? (draws[0] === "Key" ? 2_000 : 750) : pair ? 150 : 0;
            try {
                const settled = await settleGame({
                    guildId: i.guildId, userId: i.user.id, game: "scratch_card",
                    outcome: payout ? "win" : "loss", wager: 100, payout, detail: draws.join("|"), score: payout
                });
                await i.reply(`${userMention(i.user.id)} scratched: **${draws.join(" • ")}**\n${payout ? `The card pays ${payout} ${currency}!` : "No match—the mist keeps this card."} Balance: ${settled.balance}.`);
            }
            catch {
                await i.reply({ content: `You need 100 ${currency} in your wallet.`, ephemeral: true });
            }
        }
    }
];
