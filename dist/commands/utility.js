import { EmbedBuilder, SlashCommandBuilder, time, userMention } from "discord.js";
const startedAt = new Date();
export const utilityCommands = [
    {
        data: new SlashCommandBuilder().setName("ping").setDescription("Check Nymera's responsiveness"),
        async execute(i) { await i.reply(`Pong — ${i.client.ws.ping}ms.`); }
    },
    {
        data: new SlashCommandBuilder().setName("help").setDescription("Show Nymera's available commands"),
        async execute(i) {
            await i.reply({
                embeds: [new EmbedBuilder()
                        .setColor(0x6f42c1)
                        .setTitle("Nymera Hazeground — Phase 1")
                        .setDescription("**AI:** `/ask`, `/ai-settings`, `/conversation-start`, `/ai-memory`\n**Community:** `/ticket`, `/reaction-role`, `/role-buttons`, `/giveaway-start`, `/giveaway-enter`, `/giveaway-end`\n**Familiars & crafting:** `/familiar`, `/recipes`, `/craft`, `/open-lootbox`, `/trade`\n**Progression:** `/rank`, `/levels`, `/prestige`, `/quest-board`, `/achievement-list`, `/coven-challenge`, `/referral`\n**Events:** `/seasonal-event`, `/trick-or-treat`, `/full-moon-offering`, `/dbd-build`, `/dbd-challenge`\n**Magic:** `/tarot`, `/oracle`, `/astrology`, `/daily-draw`, `/moon`, `/planetary-hour`, `/herb`, `/grimoire`\n**Utilities:** `/reminder`, `/ritual-reminder`, `/statistics`, `/backup`\n**Economy:** `/balance`, `/bank`, `/profile`, `/daily`, `/weekly`, `/work`, `/shop`, `/buy`, `/inventory`, `/quests`\n**Games:** `/coinflip`, `/bone-dice`, `/blackjack`, `/high-low`, `/scratch-card`, `/haunted-slots`, `/horror-trivia`, `/haunted-hangman`, `/auto-games`\n**Configuration:** `/setup`, `/settings`, `/schedule`, `/daily-message`, `/scheduled-posts`, `/mental-health-checkin`, `/mental-health-space`, plus moderation commands.")
                ],
                ephemeral: true
            });
        }
    },
    {
        data: new SlashCommandBuilder().setName("userinfo").setDescription("Show information about a member")
            .addUserOption(o => o.setName("user").setDescription("Member to inspect")),
        async execute(i) {
            const user = i.options.getUser("user") ?? i.user;
            const member = i.guild?.members.cache.get(user.id);
            await i.reply({ embeds: [new EmbedBuilder().setColor(0x6f42c1).setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
                        .addFields({ name: "User", value: userMention(user.id), inline: true }, { name: "Created", value: time(user.createdAt, "R"), inline: true }, { name: "Joined", value: member?.joinedAt ? time(member.joinedAt, "R") : "Unknown", inline: true })] });
        }
    },
    {
        data: new SlashCommandBuilder().setName("serverinfo").setDescription("Show server information"),
        async execute(i) {
            if (!i.guild)
                return void await i.reply({ content: "Use this in a server.", ephemeral: true });
            await i.reply({ embeds: [new EmbedBuilder().setColor(0x6f42c1).setTitle(i.guild.name)
                        .addFields({ name: "Members", value: String(i.guild.memberCount), inline: true }, { name: "Created", value: time(i.guild.createdAt, "R"), inline: true }, { name: "Owner", value: userMention(i.guild.ownerId), inline: true })] });
        }
    },
    {
        data: new SlashCommandBuilder().setName("avatar").setDescription("Show a user's avatar")
            .addUserOption(o => o.setName("user").setDescription("User")),
        async execute(i) {
            const user = i.options.getUser("user") ?? i.user;
            await i.reply(user.displayAvatarURL({ size: 1024 }));
        }
    },
    {
        data: new SlashCommandBuilder().setName("botinfo").setDescription("Show bot information"),
        async execute(i) { await i.reply("Nymera Hazeground Phase 5 • Foundation, moderation, AI, economy, games, magic lore, and community systems."); }
    },
    {
        data: new SlashCommandBuilder().setName("uptime").setDescription("Show process uptime"),
        async execute(i) { await i.reply(`Awake since ${time(startedAt, "R")}.`); }
    }
];
