import { ChannelType, EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder, userMention } from "discord.js";
import { ensureGuild, prisma } from "../database.js";
import { accountKey, applyLevelRewards, getAccount, levelForXp } from "../services/economy.js";
const xpForLevel = (level) => level * level * 100;
const themedLevelRoles = [
    { level: 5, name: "🌫️ Haze Wanderer", color: 0x6b7280 },
    { level: 10, name: "🕯️ Candle Keeper", color: 0xf59e0b },
    { level: 15, name: "🌿 Hedge Witch", color: 0x65a30d },
    { level: 20, name: "🔮 Crystal Seer", color: 0xa855f7 },
    { level: 25, name: "📜 Grimoire Keeper", color: 0x92400e },
    { level: 30, name: "🐦‍⬛ Raven Familiar", color: 0x374151 },
    { level: 40, name: "🌙 Moonlit Mystic", color: 0x818cf8 },
    { level: 50, name: "🧙 Coven Adept", color: 0x7e22ce },
    { level: 60, name: "💀 Bone Conjurer", color: 0xd1d5db },
    { level: 75, name: "🩸 Blood Moon Witch", color: 0xb91c1c },
    { level: 90, name: "✨ Arcane Elder", color: 0xc084fc },
    { level: 100, name: "👑 Sovereign of the Haze", color: 0x84cc16 }
];
export async function createThemedLevelRoles(guild, reason) {
    const botMember = guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
        throw new Error("Nymera needs the Manage Roles permission before creating level roles.");
    }
    const connected = [];
    for (const themed of themedLevelRoles) {
        let role = guild.roles.cache.find(candidate => candidate.name.toLowerCase() === themed.name.toLowerCase());
        role ??= await guild.roles.create({
            name: themed.name,
            color: themed.color,
            mentionable: false,
            reason
        });
        if (role.position >= botMember.roles.highest.position) {
            throw new Error(`Move Nymera's role above ${role.name}, then run the setup again.`);
        }
        await prisma.levelReward.upsert({
            where: { guildId_level: { guildId: guild.id, level: themed.level } },
            update: { roleId: role.id },
            create: { guildId: guild.id, level: themed.level, roleId: role.id }
        });
        connected.push({ level: themed.level, roleId: role.id });
    }
    return connected;
}
export const levelCommands = [
    {
        data: new SlashCommandBuilder().setName("rank").setDescription("View a member's level and XP")
            .addUserOption(o => o.setName("user").setDescription("Member")),
        async execute(i) {
            const user = i.options.getUser("user") ?? i.user;
            const account = await getAccount(i.guildId, user.id);
            const currentFloor = xpForLevel(account.level);
            const nextFloor = xpForLevel(account.level + 1);
            const progress = account.xp - currentFloor;
            const needed = nextFloor - currentFloor;
            const position = await prisma.economyAccount.count({
                where: { guildId: i.guildId, xp: { gt: account.xp } }
            }) + 1;
            await i.reply({ embeds: [new EmbedBuilder()
                        .setColor(0x6f42c1)
                        .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
                        .setTitle(`Prestige ${account.prestige} • Level ${account.level}`)
                        .setDescription(`**${progress.toLocaleString()} / ${needed.toLocaleString()} XP** toward level ${account.level + 1}`)
                        .addFields({ name: "Total XP", value: account.xp.toLocaleString(), inline: true }, { name: "Server Rank", value: `#${position}`, inline: true }, { name: "Messages", value: account.messages.toLocaleString(), inline: true })] });
        }
    },
    {
        data: new SlashCommandBuilder().setName("levels").setDescription("Show the server XP leaderboard"),
        async execute(i) {
            const rows = await prisma.economyAccount.findMany({
                where: { guildId: i.guildId },
                orderBy: [{ xp: "desc" }, { messages: "desc" }],
                take: 10
            });
            await i.reply({ embeds: [new EmbedBuilder()
                        .setColor(0x6f42c1)
                        .setTitle("Level Leaderboard")
                        .setDescription(rows.map((row, index) => `**${index + 1}.** ${userMention(row.userId)} — Prestige ${row.prestige} • Level ${row.level} • ${row.xp.toLocaleString()} XP`).join("\n") || "No one has earned XP yet.")] });
        }
    },
    {
        data: new SlashCommandBuilder().setName("level-settings").setDescription("Configure level-up announcements")
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
            .addBooleanOption(o => o.setName("enabled").setDescription("Enable or disable announcements").setRequired(true))
            .addChannelOption(o => o.setName("channel").setDescription("Announcement channel; omit to use the active chat").addChannelTypes(ChannelType.GuildText)),
        async execute(i) {
            await ensureGuild(i.guildId);
            const enabled = i.options.getBoolean("enabled", true);
            const channel = i.options.getChannel("channel");
            await prisma.guildConfig.update({
                where: { guildId: i.guildId },
                data: { levelUpEnabled: enabled, levelUpChannelId: channel?.id ?? null }
            });
            await i.reply({
                content: enabled
                    ? `Level-up announcements enabled ${channel ? `in ${channel}` : "in the channel where the member levels up"}.`
                    : "Level-up announcements disabled.",
                ephemeral: true
            });
        }
    },
    {
        data: new SlashCommandBuilder().setName("level-role").setDescription("Configure level reward roles")
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
            .addSubcommand(s => s.setName("add").setDescription("Add or replace a reward role")
            .addIntegerOption(o => o.setName("level").setDescription("Required level").setRequired(true).setMinValue(1).setMaxValue(1000))
            .addRoleOption(o => o.setName("role").setDescription("Role to award").setRequired(true)))
            .addSubcommand(s => s.setName("remove").setDescription("Remove a level reward")
            .addIntegerOption(o => o.setName("level").setDescription("Reward level").setRequired(true).setMinValue(1).setMaxValue(1000)))
            .addSubcommand(s => s.setName("create-themed").setDescription("Create and connect Nymera's complete themed level roles"))
            .addSubcommand(s => s.setName("list").setDescription("List all level rewards")),
        async execute(i) {
            const sub = i.options.getSubcommand();
            if (sub === "create-themed") {
                const botMember = i.guild.members.me;
                if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
                    return void await i.reply({
                        content: "I need the **Manage Roles** permission before I can create level roles.",
                        ephemeral: true
                    });
                }
                await i.deferReply({ ephemeral: true });
                const connected = await createThemedLevelRoles(i.guild, `Nymera themed level rewards created by ${i.user.tag}`);
                await i.editReply(`Created or reconnected all **${connected.length} themed level roles**:\n${connected.map(entry => `Level **${entry.level}** — <@&${entry.roleId}>`).join("\n")}\n\nKeep Nymera's bot role above these roles. Use \`/level-role list\` to verify them.`);
                return;
            }
            if (sub === "list") {
                const rewards = await prisma.levelReward.findMany({
                    where: { guildId: i.guildId },
                    orderBy: { level: "asc" }
                });
                await i.reply({
                    content: rewards.length
                        ? rewards.map(reward => `Level **${reward.level}** — <@&${reward.roleId}>`).join("\n")
                        : "No level reward roles are configured.",
                    ephemeral: true
                });
                return;
            }
            const level = i.options.getInteger("level", true);
            if (sub === "remove") {
                await prisma.levelReward.deleteMany({ where: { guildId: i.guildId, level } });
                await i.reply({ content: `Removed the level ${level} reward.`, ephemeral: true });
                return;
            }
            const role = i.options.getRole("role", true);
            const botMember = i.guild.members.me;
            if (role.managed || role.id === i.guild.roles.everyone.id || !botMember || role.position >= botMember.roles.highest.position) {
                return void await i.reply({
                    content: `I cannot manage ${role}. Move Nymera's bot role above it first.`,
                    ephemeral: true
                });
            }
            await prisma.levelReward.upsert({
                where: { guildId_level: { guildId: i.guildId, level } },
                update: { roleId: role.id },
                create: { guildId: i.guildId, level, roleId: role.id }
            });
            await i.reply({ content: `${role} will be awarded at level **${level}**.`, ephemeral: true });
        }
    },
    {
        data: new SlashCommandBuilder().setName("xp-admin").setDescription("Add or remove a member's XP")
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
            .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
            .addIntegerOption(o => o.setName("amount").setDescription("Positive to add, negative to remove").setRequired(true).setMinValue(-1000000).setMaxValue(1000000)),
        async execute(i) {
            const user = i.options.getUser("user", true);
            const amount = i.options.getInteger("amount", true);
            const account = await getAccount(i.guildId, user.id);
            const xp = Math.max(0, account.xp + amount);
            const level = levelForXp(xp);
            const updated = await prisma.economyAccount.update({
                ...accountKey(i.guildId, user.id),
                data: { xp, level }
            });
            const member = await i.guild.members.fetch(user.id).catch(() => null);
            if (member)
                await applyLevelRewards(i.guild, member, level);
            await i.reply({
                content: `${user.tag} now has **${updated.xp.toLocaleString()} XP** and is **level ${updated.level}**.`,
                ephemeral: true
            });
        }
    }
];
