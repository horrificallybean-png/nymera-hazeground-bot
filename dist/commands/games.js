import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder, SlashCommandBuilder, userMention } from "discord.js";
import { prisma } from "../database.js";
import { currency } from "../services/economy.js";
import { hangmanWords, secureInt, settleGame, triviaQuestions } from "../services/games.js";
const cooldowns = new Map();
const sessions = new Map();
const sessionKey = (guildId, channelId) => `${guildId}:${channelId}`;
const checkCooldown = (guildId, userId) => {
    const key = `${guildId}:${userId}`;
    const now = Date.now();
    const wait = Math.max(0, (cooldowns.get(key) ?? 0) - now);
    if (!wait)
        cooldowns.set(key, now + 5_000);
    return wait;
};
export const gameCommands = [
    {
        data: new SlashCommandBuilder().setName("coinflip").setDescription("Wager on a secure coin flip")
            .addStringOption(o => o.setName("choice").setDescription("Heads or tails").setRequired(true)
            .addChoices({ name: "Heads", value: "heads" }, { name: "Tails", value: "tails" }))
            .addIntegerOption(o => o.setName("bet").setDescription("Spellmarks wager").setRequired(true).setMinValue(10).setMaxValue(10000)),
        async execute(i) {
            if (checkCooldown(i.guildId, i.user.id))
                return void await i.reply({ content: "The coin is still spinning. Wait a few seconds.", ephemeral: true });
            const choice = i.options.getString("choice", true);
            const bet = i.options.getInteger("bet", true);
            const result = secureInt(0, 1) ? "heads" : "tails";
            const won = choice === result;
            try {
                const settled = await settleGame({ guildId: i.guildId, userId: i.user.id, game: "coinflip", outcome: won ? "win" : "loss", wager: bet, payout: won ? bet * 2 : 0, detail: result });
                await i.reply(`The coin shows **${result}**. You ${won ? `won ${bet}` : `lost ${bet}`} ${currency}. Balance: ${settled.balance}.`);
            }
            catch {
                await i.reply({ content: "You do not have enough Spellmarks.", ephemeral: true });
            }
        }
    },
    {
        data: new SlashCommandBuilder().setName("bone-dice").setDescription("Guess a bone die roll")
            .addIntegerOption(o => o.setName("guess").setDescription("1–6").setRequired(true).setMinValue(1).setMaxValue(6))
            .addIntegerOption(o => o.setName("bet").setDescription("Spellmarks wager").setRequired(true).setMinValue(10).setMaxValue(5000)),
        async execute(i) {
            if (checkCooldown(i.guildId, i.user.id))
                return void await i.reply({ content: "Wait a few seconds before playing again.", ephemeral: true });
            const guess = i.options.getInteger("guess", true);
            const bet = i.options.getInteger("bet", true);
            const roll = secureInt(1, 6);
            const won = guess === roll;
            try {
                const settled = await settleGame({ guildId: i.guildId, userId: i.user.id, game: "bone_dice", outcome: won ? "win" : "loss", wager: bet, payout: won ? bet * 6 : 0, detail: `roll=${roll}` });
                await i.reply(`The bone die rolls **${roll}**. You ${won ? `won ${bet * 5}` : `lost ${bet}`} ${currency}. Balance: ${settled.balance}.`);
            }
            catch {
                await i.reply({ content: "You do not have enough Spellmarks.", ephemeral: true });
            }
        }
    },
    {
        data: new SlashCommandBuilder().setName("haunted-slots").setDescription("Spin the haunted slots")
            .addIntegerOption(o => o.setName("bet").setDescription("Spellmarks wager").setRequired(true).setMinValue(10).setMaxValue(5000)),
        async execute(i) {
            if (checkCooldown(i.guildId, i.user.id))
                return void await i.reply({ content: "The reels need a moment.", ephemeral: true });
            const bet = i.options.getInteger("bet", true);
            const symbols = ["🌙", "🔮", "🕯️", "💀", "🦇"];
            const reels = [symbols[secureInt(0, 4)], symbols[secureInt(0, 4)], symbols[secureInt(0, 4)]];
            const triple = reels[0] === reels[1] && reels[1] === reels[2];
            const pair = !triple && new Set(reels).size === 2;
            const multiplier = triple ? (reels[0] === "💀" ? 10 : 5) : pair ? 2 : 0;
            try {
                const settled = await settleGame({ guildId: i.guildId, userId: i.user.id, game: "slots", outcome: multiplier ? "win" : "loss", wager: bet, payout: bet * multiplier, detail: reels.join(""), score: multiplier });
                await i.reply(`╔ ${reels.join(" │ ")} ╗\n${multiplier ? `A ${multiplier}× payout!` : "The mist takes the wager."} Balance: ${settled.balance} ${currency}.`);
            }
            catch {
                await i.reply({ content: "You do not have enough Spellmarks.", ephemeral: true });
            }
        }
    },
    {
        data: new SlashCommandBuilder().setName("horror-trivia").setDescription("Answer a random trivia question"),
        async execute(i) {
            const recent = await prisma.gameResult.findMany({
                where: { guildId: i.guildId, userId: i.user.id, game: "trivia" },
                orderBy: { createdAt: "desc" },
                take: Math.min(10, triviaQuestions.length - 1),
                select: { detail: true }
            });
            const seen = new Set(recent.map(result => result.detail));
            const available = triviaQuestions.filter(question => !seen.has(question.q));
            const pool = available.length ? available : triviaQuestions;
            const q = pool[secureInt(0, pool.length - 1)];
            const row = new ActionRowBuilder().addComponents(q.choices.map((choice, index) => new ButtonBuilder().setCustomId(`trivia:${index}`).setLabel(`${index + 1}. ${choice}`).setStyle(ButtonStyle.Secondary)));
            const message = await i.reply({ content: `**${q.q}**`, components: [row], fetchReply: true });
            let answer;
            try {
                const click = await message.awaitMessageComponent({
                    componentType: ComponentType.Button,
                    time: 30_000,
                    filter: interaction => interaction.user.id === i.user.id && interaction.customId.startsWith("trivia:")
                });
                answer = Number(click.customId.split(":")[1]);
                await click.deferUpdate();
            }
            catch {
                await i.editReply({ content: `Time expired. The answer was **${q.choices[q.answer]}**.`, components: [] });
                return;
            }
            const won = answer === q.answer;
            await settleGame({ guildId: i.guildId, userId: i.user.id, game: "trivia", outcome: won ? "win" : "loss", payout: won ? 75 : 0, detail: q.q });
            await i.editReply({ content: `${won ? `Correct — you earn 75 ${currency}!` : `Not this time. The answer was **${q.choices[q.answer]}**.`}`, components: [] });
        }
    },
    {
        data: new SlashCommandBuilder().setName("haunted-hangman").setDescription("Start or play channel hangman")
            .addSubcommand(s => s.setName("start").setDescription("Start a new game"))
            .addSubcommand(s => s.setName("guess").setDescription("Guess one letter")
            .addStringOption(o => o.setName("letter").setDescription("One letter").setRequired(true).setMinLength(1).setMaxLength(1))),
        async execute(i) {
            const key = sessionKey(i.guildId, i.channelId);
            if (i.options.getSubcommand() === "start") {
                if (sessions.has(key))
                    return void await i.reply({ content: "A hangman game is already active here.", ephemeral: true });
                const word = hangmanWords[secureInt(0, hangmanWords.length - 1)];
                sessions.set(key, { word, guessed: new Set(), misses: 0, ownerId: i.user.id });
                await i.reply(`**Haunted Hangman begins.**\n${"_ ".repeat(word.length)}\nUse \`/haunted-hangman guess\`. Six missed letters end the ritual.`);
                return;
            }
            const session = sessions.get(key);
            if (!session)
                return void await i.reply({ content: "Start a game first.", ephemeral: true });
            const letter = i.options.getString("letter", true).toLowerCase();
            if (!/^[a-z]$/.test(letter) || session.guessed.has(letter))
                return void await i.reply({ content: "Choose a new A–Z letter.", ephemeral: true });
            session.guessed.add(letter);
            if (!session.word.includes(letter))
                session.misses++;
            const display = [...session.word].map(c => session.guessed.has(c) ? c.toUpperCase() : "_").join(" ");
            const won = [...session.word].every(c => session.guessed.has(c));
            const lost = session.misses >= 6;
            if (won || lost) {
                sessions.delete(key);
                await settleGame({ guildId: i.guildId, userId: i.user.id, game: "hangman", outcome: won ? "win" : "loss", payout: won ? 150 : 0, detail: session.word, score: won ? 6 - session.misses : 0 });
            }
            await i.reply(`${display}\nMisses: ${session.misses}/6${won ? `\nYou broke the curse and earned 150 ${currency}!` : lost ? `\nThe word was **${session.word.toUpperCase()}**.` : ""}`);
        }
    },
    {
        data: new SlashCommandBuilder().setName("game-stats").setDescription("View a member's game statistics")
            .addUserOption(o => o.setName("user").setDescription("Member")),
        async execute(i) {
            const user = i.options.getUser("user") ?? i.user;
            const stats = await prisma.gameStat.findMany({ where: { guildId: i.guildId, userId: user.id }, orderBy: { played: "desc" } });
            await i.reply({ embeds: [new EmbedBuilder().setColor(0x6f42c1).setTitle(`${user.username}'s Game Stats`)
                        .setDescription(stats.map(s => `**${s.game}** — ${s.won}W/${s.lost}L • ${s.earned >= 0 ? "+" : ""}${s.earned} ${currency}`).join("\n") || "No games played yet.")] });
        }
    },
    {
        data: new SlashCommandBuilder().setName("game-leaderboard").setDescription("Show top game winners"),
        async execute(i) {
            const grouped = await prisma.gameStat.groupBy({ by: ["userId"], where: { guildId: i.guildId }, _sum: { won: true, earned: true }, orderBy: { _sum: { won: "desc" } }, take: 10 });
            await i.reply({ embeds: [new EmbedBuilder().setColor(0x6f42c1).setTitle("Game Leaderboard")
                        .setDescription(grouped.map((x, n) => `**${n + 1}.** ${userMention(x.userId)} — ${x._sum.won ?? 0} wins • ${(x._sum.earned ?? 0) >= 0 ? "+" : ""}${x._sum.earned ?? 0}`).join("\n") || "No games played.")] });
        }
    }
];
