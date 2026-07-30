import { ChannelType, EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder, channelMention, roleMention } from "discord.js";
import cron from "node-cron";
import { ensureGuild, prisma } from "../database.js";
import { createCommunityRolePanels } from "./community.js";
import { createThemedLevelRoles } from "./levels.js";
import { discordAsset } from "../services/assets.js";
import { runScheduledPostNow } from "../services/scheduler.js";
const mentalHealthMarker = "🌿 **Gentle Mental Health Check-In**";
function mentalHealthContent(roleId) {
    return `${roleId ? `${roleMention(roleId)}\n\n` : ""}${mentalHealthMarker}\n\n{{daily_wellness}}\n\nThis is peer support, not professional care.`;
}
async function saveMentalHealthSchedule(input) {
    await prisma.$transaction([
        prisma.scheduledPost.deleteMany({
            where: { guildId: input.guildId, content: { contains: mentalHealthMarker } }
        }),
        prisma.scheduledPost.create({
            data: {
                guildId: input.guildId,
                channelId: input.channelId,
                content: mentalHealthContent(input.roleId),
                cron: `0 ${input.hour} * * *`,
                timezone: input.timezone
            }
        })
    ]);
}
function validTimezone(timezone) {
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
        return true;
    }
    catch {
        return false;
    }
}
async function publishServerRules(channel) {
    const files = discordAsset("welcome-banner.png");
    const embed = new EmbedBuilder()
        .setColor(0x6f42c1)
        .setTitle("📜 The Coven Laws")
        .setDescription("Welcome to **Spellbound Hazeground**—a realm of magic, mystery, horror, gaming, and community. " +
        "By remaining here, every soul agrees to protect the coven and follow these laws.")
        .addFields({
        name: "🕯️ 1. Respect Every Soul",
        value: "Treat members with kindness. Harassment, bullying, discrimination, hate speech, threats, or targeted hostility are forbidden."
    }, {
        name: "🌫️ 2. Keep the Haze Safe",
        value: "No doxxing, stalking, scams, malicious links, impersonation, ban evasion, or sharing another person's private information."
    }, {
        name: "🔞 3. Keep Shared Spaces Appropriate",
        value: "No explicit sexual content, graphic gore, or illegal material. Use content warnings for sensitive horror topics and follow Discord's age requirements."
    }, {
        name: "💬 4. Use the Correct Chambers",
        value: "Keep conversations in their matching channels. Avoid spam, disruptive walls of text, excessive mentions, and repeated self-promotion."
    }, {
        name: "🎮 5. Play Fair",
        value: "Do not cheat, exploit Nymera, manipulate rewards, reveal active game answers, or deliberately ruin community events."
    }, {
        name: "🔮 6. Magic Is Reflective and Educational",
        value: "Tarot, herbs, astrology, rituals, and folklore are discussed for reflection, culture, history, and entertainment—not as medical, legal, or financial advice."
    }, {
        name: "🌿 7. Protect Wellness Conversations",
        value: "Be compassionate, respect boundaries, and do not pressure anyone to disclose personal experiences. Peer support is not professional care."
    }, {
        name: "📣 8. Promotion Requires Permission",
        value: "Post social links, streams, invitations, and advertisements only in approved areas or with staff permission."
    }, {
        name: "🛡️ 9. Respect Staff Decisions",
        value: "Follow moderator directions. If you disagree, use a private support ticket instead of arguing in public channels."
    }, {
        name: "👁️ 10. Discord Rules Still Apply",
        value: "Follow the Discord Terms of Service and Community Guidelines. Staff may act on harmful behavior not explicitly listed here."
    })
        .setFooter({ text: "Spellbound Hazeground • React with ✅ to acknowledge the Coven Laws" })
        .setTimestamp();
    if (files.length)
        embed.setImage("attachment://welcome-banner.png");
    const recent = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    const existing = recent?.find(message => message.author.id === channel.client.user.id &&
        message.embeds.some(item => item.title === "📜 The Coven Laws"));
    const message = existing
        ? await existing.edit({ embeds: [embed], files })
        : await channel.send({ embeds: [embed], files });
    await message.react("✅").catch(() => null);
    return message;
}
const completeMagicSchedule = [
    { hour: 6, token: "{{magic_six_daily_dawn}}", roleNames: ["Tarot & Oracle", "Divination"] },
    { hour: 9, token: "{{magic_six_daily_morning}}", roleNames: ["Herbal Lore"] },
    { hour: 12, token: "{{magic_six_daily_midday}}", roleNames: ["Folklore", "Mythology"] },
    { hour: 15, token: "{{magic_six_daily_afternoon}}", roleNames: ["Crystals", "Spellcraft"] },
    { hour: 18, token: "{{magic_six_daily_evening}}", roleNames: ["Astrology", "Moon & Cosmos"] },
    { hour: 21, token: "{{magic_six_daily_night}}", roleNames: ["Witchcraft History", "Spellcraft"] }
];
async function findOrCreateCategory(i, name, isPrivate = false) {
    const guild = i.guild;
    let category = guild.channels.cache.find(candidate => candidate.type === ChannelType.GuildCategory && candidate.name === name);
    category ??= await guild.channels.create({
        name,
        type: ChannelType.GuildCategory,
        permissionOverwrites: isPrivate ? [
            { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: i.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
        ] : undefined,
        reason: `Complete Nymera setup requested by ${i.user.tag}`
    });
    return category;
}
async function findOrCreateTextChannel(i, category, name, topic, legacyNames = []) {
    const guild = i.guild;
    let channel = guild.channels.cache.find(candidate => candidate.type === ChannelType.GuildText &&
        (candidate.name === name || legacyNames.includes(candidate.name)));
    if (channel) {
        if (channel.name !== name || channel.parentId !== category.id || channel.topic !== topic) {
            await channel.edit({
                name,
                parent: category.id,
                topic,
                reason: `Nymera horror-theme upgrade requested by ${i.user.tag}`
            });
        }
    }
    else {
        channel = await guild.channels.create({
            name,
            type: ChannelType.GuildText,
            parent: category.id,
            topic,
            reason: `Complete Nymera setup requested by ${i.user.tag}`
        });
    }
    return channel;
}
async function findOrCreateVoiceChannel(i, category, name, legacyNames = []) {
    const guild = i.guild;
    const channel = guild.channels.cache.find(candidate => candidate.type === ChannelType.GuildVoice &&
        (candidate.name === name || legacyNames.includes(candidate.name)));
    if (channel?.type === ChannelType.GuildVoice) {
        if (channel.name !== name || channel.parentId !== category.id) {
            await channel.edit({
                name,
                parent: category.id,
                reason: `Nymera horror-theme upgrade requested by ${i.user.tag}`
            });
        }
        return channel;
    }
    return guild.channels.create({
        name,
        type: ChannelType.GuildVoice,
        parent: category.id,
        reason: `Complete Nymera setup requested by ${i.user.tag}`
    });
}
export const configurationCommands = [
    {
        data: new SlashCommandBuilder().setName("setup").setDescription("Configure Nymera's server features").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
            .addSubcommand(s => s.setName("complete").setDescription("Create a complete horror-themed Nymera server setup")
            .addStringOption(o => o.setName("timezone").setDescription("IANA timezone (default: America/Denver)")))
            .addSubcommand(s => s.setName("configure").setDescription("Manually change Nymera's main settings")
            .addChannelOption(o => o.setName("welcome_channel").setDescription("Welcome messages").addChannelTypes(ChannelType.GuildText))
            .addChannelOption(o => o.setName("goodbye_channel").setDescription("Goodbye messages").addChannelTypes(ChannelType.GuildText))
            .addChannelOption(o => o.setName("log_channel").setDescription("Audit logs").addChannelTypes(ChannelType.GuildText))
            .addRoleOption(o => o.setName("auto_role").setDescription("Role assigned on join"))
            .addChannelOption(o => o.setName("scheduled_channel").setDescription("Daily scheduled posts").addChannelTypes(ChannelType.GuildText))
            .addBooleanOption(o => o.setName("ai_enabled").setDescription("Enable /ask and mention replies"))
            .addBooleanOption(o => o.setName("automod_enabled").setDescription("Enable basic automod"))
            .addBooleanOption(o => o.setName("block_invites").setDescription("Delete Discord invite links"))
            .addChannelOption(o => o.setName("ticket_category").setDescription("Category for support tickets").addChannelTypes(ChannelType.GuildCategory))
            .addChannelOption(o => o.setName("starboard_channel").setDescription("Starboard destination").addChannelTypes(ChannelType.GuildText))
            .addIntegerOption(o => o.setName("starboard_threshold").setDescription("Stars required").setMinValue(1).setMaxValue(25))),
        async execute(i) {
            if (i.options.getSubcommand() === "complete") {
                const timezone = i.options.getString("timezone") ?? "America/Denver";
                if (!validTimezone(timezone)) {
                    return void await i.reply({ content: "That timezone is invalid. Try `America/Denver`.", ephemeral: true });
                }
                const me = i.guild.members.me;
                if (!me?.permissions.has(PermissionFlagsBits.ManageChannels) || !me.permissions.has(PermissionFlagsBits.ManageRoles)) {
                    return void await i.reply({
                        content: "Nymera needs **Manage Channels** and **Manage Roles** before running the complete setup.",
                        ephemeral: true
                    });
                }
                await i.deferReply({ ephemeral: true });
                await i.guild.channels.fetch();
                await i.guild.roles.fetch();
                const threshold = await findOrCreateCategory(i, "🕯️ THE THRESHOLD");
                const commons = await findOrCreateCategory(i, "🌫️ THE HAUNTED COMMONS");
                const archives = await findOrCreateCategory(i, "🔮 THE ARCANE ARCHIVES");
                const arcade = await findOrCreateCategory(i, "👻 THE MIDNIGHT ARCADE");
                const beyond = await findOrCreateCategory(i, "🐦‍⬛ BEYOND THE VEIL");
                const allies = await findOrCreateCategory(i, "🤝 ALLIED COVENS");
                const bumpCrypt = await findOrCreateCategory(i, "📣 SUMMON THE COVEN");
                const voiceCrypt = await findOrCreateCategory(i, "🎙️ ECHOING CHAMBERS");
                const sanctuary = await findOrCreateCategory(i, "🌿 THE SHADOW SANCTUARY");
                const staffCrypt = await findOrCreateCategory(i, "💀 NYMERA'S WATCH", true);
                const innerCircle = await findOrCreateCategory(i, "🛡️ THE INNER CIRCLE", true);
                const tickets = await findOrCreateCategory(i, "🗝️ SEALED CONFESSIONS", true);
                const welcome = await findOrCreateTextChannel(i, threshold, "🕯️・𝖊𝖓𝖙𝖊𝖗-𝖙𝖍𝖊-𝖍𝖆𝖟𝖊", "New souls arrive through the veil.", ["enter-the-haze"]);
                const goodbye = await findOrCreateTextChannel(i, threshold, "🌫️・𝖑𝖔𝖘𝖙-𝖙𝖔-𝖙𝖍𝖊-𝖒𝖎𝖘𝖙", "Farewells to souls departing the Hazeground.", ["lost-to-the-mist"]);
                const rulesChannel = await findOrCreateTextChannel(i, threshold, "📜・𝖈𝖔𝖛𝖊𝖓-𝖑𝖆𝖜𝖘", "The laws and boundaries that protect the coven.", ["coven-laws"]);
                const roles = await findOrCreateTextChannel(i, threshold, "🎭・𝖈𝖍𝖔𝖔𝖘𝖊-𝖞𝖔𝖚𝖗-𝖋𝖆𝖙𝖊", "Choose pronouns, interests, notifications, games, and magical paths.", ["choose-your-fate"]);
                const general = await findOrCreateTextChannel(i, commons, "💬・𝖜𝖍𝖎𝖘𝖕𝖊𝖗𝖘-𝖋𝖗𝖔𝖒-𝖙𝖍𝖊-𝖛𝖔𝖎𝖉", "The coven's primary conversation chamber.", ["whispers-from-the-void"]);
                await findOrCreateTextChannel(i, commons, "🖼️・𝖘𝖕𝖊𝖈𝖙𝖗𝖆𝖑-𝖘𝖍𝖔𝖜𝖈𝖆𝖘𝖊", "Share art, creations, screenshots, pets, and victories.", ["spectral-showcase"]);
                await findOrCreateTextChannel(i, commons, "🃏・𝖈𝖚𝖗𝖘𝖊𝖉-𝖒𝖊𝖒𝖊𝖘", "Memes, cursed images, and chaotic offerings to the haze.", ["cursed-memes"]);
                const announcements = await findOrCreateTextChannel(i, commons, "📣・𝖔𝖒𝖊𝖓𝖘-𝖆𝖓𝖉-𝖆𝖓𝖓𝖔𝖚𝖓𝖈𝖊𝖒𝖊𝖓𝖙𝖘", "Official community news and important omens.", ["omens-and-announcements"]);
                const magic = await findOrCreateTextChannel(i, archives, "🔮・𝖋𝖔𝖗𝖇𝖎𝖉𝖉𝖊𝖓-𝖑𝖔𝖗𝖊", "Nymera's automatic magical lore and reflections.", ["forbidden-lore"]);
                await findOrCreateTextChannel(i, archives, "🌙・𝖒𝖔𝖔𝖓𝖑𝖎𝖙-𝖗𝖎𝖙𝖚𝖆𝖑𝖘", "Reflective practices, tarot, herbs, astrology, and folklore.", ["moonlit-rituals"]);
                const games = await findOrCreateTextChannel(i, arcade, "🎮・𝖌𝖆𝖒𝖊𝖘-𝖎𝖓-𝖙𝖍𝖊-𝖉𝖆𝖗𝖐", "Automatic games, riddles, trivia, encounters, and giveaways.", ["games-in-the-dark"]);
                await findOrCreateTextChannel(i, arcade, "🩸・𝖙𝖗𝖎𝖆𝖑𝖘-𝖎𝖓-𝖙𝖍𝖊-𝖋𝖔𝖌", "Dead by Daylight discussion, builds, lore, and challenges.", ["trials-in-the-fog"]);
                await findOrCreateTextChannel(i, arcade, "👻・𝖍𝖔𝖗𝖗𝖔𝖗-𝖌𝖆𝖒𝖊𝖘", "Survival horror, paranormal games, and frightening adventures.");
                await findOrCreateTextChannel(i, arcade, "🍄・𝖈𝖔𝖟𝖞-𝖌𝖆𝖒𝖊𝖘", "Comforting games, farming sims, and peaceful adventures.");
                await findOrCreateTextChannel(i, arcade, "🐉・𝖗𝖕𝖌-𝖗𝖊𝖆𝖑𝖒𝖘", "Roleplaying games, character builds, quests, and fantasy worlds.");
                await findOrCreateTextChannel(i, arcade, "🎯・𝖆𝖈𝖙𝖎𝖔𝖓-𝖆𝖓𝖉-𝖋𝖕𝖘", "Action games, shooters, squads, and competitive play.");
                await findOrCreateTextChannel(i, arcade, "🕹️・𝖎𝖓𝖉𝖎𝖊-𝖈𝖗𝖞𝖕𝖙", "Independent games, hidden gems, and unusual discoveries.");
                await findOrCreateTextChannel(i, arcade, "🎉・𝖕𝖆𝖗𝖙𝖞-𝖌𝖆𝖒𝖊𝖘", "Party games, group sessions, and community game nights.");
                await findOrCreateTextChannel(i, arcade, "🎲・𝖙𝖆𝖇𝖑𝖊𝖙𝖔𝖕-𝖙𝖔𝖒𝖇", "Board games, tabletop RPGs, card games, and dice.");
                const social = await findOrCreateTextChannel(i, beyond, "📱・𝖘𝖎𝖌𝖓𝖆𝖑𝖘-𝖇𝖊𝖞𝖔𝖓𝖉-𝖙𝖍𝖊-𝖛𝖊𝖎𝖑", "Automatic social-media and community alerts.", ["signals-beyond-the-veil"]);
                await findOrCreateTextChannel(i, beyond, "📡・𝖘𝖙𝖗𝖊𝖆𝖒-𝖘𝖚𝖒𝖒𝖔𝖓𝖎𝖓𝖌𝖘", "Twitch live alerts and streaming conversation.", ["stream-summonings"]);
                await findOrCreateTextChannel(i, allies, "🤝・𝖕𝖆𝖗𝖙𝖓𝖊𝖗𝖊𝖉-𝖗𝖊𝖆𝖑𝖒𝖘", "Discover trusted partner servers and allied communities.", ["partnered-servers", "server-partners"]);
                await findOrCreateTextChannel(i, bumpCrypt, "🔔・𝖇𝖚𝖒𝖕-𝖙𝖍𝖊-𝖍𝖆𝖟𝖊", "Use approved server-list bump commands here and help summon new souls into the coven.", ["bump-the-haze", "server-bumps"]);
                await findOrCreateVoiceChannel(i, voiceCrypt, "🕯️・Whispers by Candlelight", ["General Voice"]);
                await findOrCreateVoiceChannel(i, voiceCrypt, "🎮・The Haunted Party", ["Gaming Voice"]);
                await findOrCreateVoiceChannel(i, voiceCrypt, "🩸・Campfire in the Fog", ["Dead by Daylight Voice"]);
                await findOrCreateVoiceChannel(i, voiceCrypt, "🌙・Moonlit Lounge", ["Chill Voice"]);
                await findOrCreateVoiceChannel(i, voiceCrypt, "🌫️・Lost in the Fog", ["AFK"]);
                const wellness = await findOrCreateTextChannel(i, sanctuary, "🌿・𝖒𝖔𝖗𝖙𝖆𝖑-𝖈𝖍𝖊𝖈𝖐-𝖎𝖓", "A gentle peer-support space; not a replacement for professional care.", ["mortal-check-in"]);
                const levels = await findOrCreateTextChannel(i, commons, "✨・𝖆𝖘𝖈𝖊𝖓𝖘𝖎𝖔𝖓-𝖗𝖎𝖙𝖊𝖘", "Level-up announcements and coven milestones.", ["ascension-rites"]);
                const starboard = await findOrCreateTextChannel(i, commons, "⭐・𝖍𝖆𝖑𝖑-𝖔𝖋-𝖔𝖒𝖊𝖓𝖘", "The community's most treasured messages.", ["hall-of-omens"]);
                const logs = await findOrCreateTextChannel(i, staffCrypt, "📚・𝖓𝖞𝖒𝖊𝖗𝖆𝖘-𝖆𝖗𝖈𝖍𝖎𝖛𝖊𝖘", "Private moderation and server activity records.", ["nymeras-archives"]);
                const review = await findOrCreateTextChannel(i, staffCrypt, "👁️・𝖔𝖗𝖆𝖈𝖑𝖊-𝖗𝖊𝖛𝖎𝖊𝖜", "Private staff review for AI moderation suggestions.", ["oracle-review"]);
                let staffRole = i.guild.roles.cache.find(role => role.name.toLowerCase() === "🛡️ coven staff");
                staffRole ??= await i.guild.roles.create({
                    name: "🛡️ Coven Staff",
                    color: 0x7e22ce,
                    mentionable: true,
                    reason: `Complete Nymera setup requested by ${i.user.tag}`
                });
                await innerCircle.permissionOverwrites.edit(staffRole.id, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                    Connect: true,
                    Speak: true
                });
                await findOrCreateTextChannel(i, innerCircle, "🕯️・𝖎𝖓𝖓𝖊𝖗-𝖈𝖎𝖗𝖈𝖑𝖊-𝖈𝖍𝖆𝖙", "Private conversation for the Spellbound Hazeground staff team.", ["staff-chat"]);
                await findOrCreateTextChannel(i, innerCircle, "📜・𝖘𝖙𝖆𝖋𝖋-𝖔𝖒𝖊𝖓𝖘", "Private staff announcements, plans, and important updates.", ["staff-announcements"]);
                await findOrCreateTextChannel(i, innerCircle, "⚙️・𝖓𝖞𝖒𝖊𝖗𝖆-𝖈𝖔𝖒𝖒𝖆𝖓𝖉𝖘", "Private workspace for moderation and Nymera administration commands.", ["staff-commands", "bot-commands"]);
                await findOrCreateVoiceChannel(i, innerCircle, "🗝️・Council Chamber", ["Staff Voice"]);
                let autoRole = i.guild.roles.cache.find(role => role.name.toLowerCase() === "🌫️ lost soul");
                autoRole ??= await i.guild.roles.create({
                    name: "🌫️ Lost Soul",
                    color: 0x4b5563,
                    reason: `Complete Nymera setup requested by ${i.user.tag}`
                });
                const existingPanelButtons = await prisma.reactionRole.count({
                    where: { guildId: i.guildId, channelId: roles.id, emoji: { startsWith: "button:" } }
                });
                let panelSummary = "existing panels kept";
                if (existingPanelButtons < 65) {
                    const result = await createCommunityRolePanels(i.guild, roles, `Complete Nymera setup requested by ${i.user.tag}`);
                    panelSummary = `${result.createdRoles} roles created, ${result.reusedRoles} reused`;
                    await i.guild.roles.fetch();
                }
                const levelRoles = await createThemedLevelRoles(i.guild, `Complete Nymera setup requested by ${i.user.tag}`);
                await ensureGuild(i.guildId);
                await prisma.guildConfig.update({
                    where: { guildId: i.guildId },
                    data: {
                        welcomeChannelId: welcome.id,
                        goodbyeChannelId: goodbye.id,
                        logChannelId: logs.id,
                        autoRoleId: autoRole.id,
                        scheduledChannelId: announcements.id,
                        aiEnabled: true,
                        aiMode: "mystic",
                        aiAutoReplyEnabled: true,
                        aiAutoReplyChance: 15,
                        aiConversationChannelId: general.id,
                        aiAutoReplyCooldownMinutes: 10,
                        aiConversationStarterEnabled: true,
                        aiConversationStarterMinutes: 180,
                        aiModerationEnabled: true,
                        aiReviewChannelId: review.id,
                        automodEnabled: true,
                        blockInvites: true,
                        timezone,
                        ticketCategoryId: tickets.id,
                        starboardChannelId: starboard.id,
                        starboardThreshold: 3,
                        levelUpEnabled: true,
                        levelUpChannelId: levels.id
                    }
                });
                const gameAlertRole = i.guild.roles.cache.find(role => role.name.toLowerCase() === "game alerts");
                await prisma.autoGameConfig.upsert({
                    where: { guildId: i.guildId },
                    update: { channelId: games.id, pingRoleId: gameAlertRole?.id, enabled: true, intervalMinutes: 90, answerSeconds: 300 },
                    create: { guildId: i.guildId, channelId: games.id, pingRoleId: gameAlertRole?.id, intervalMinutes: 90, answerSeconds: 300 }
                });
                const magicAlertRole = i.guild.roles.cache.find(role => role.name.toLowerCase() === "magic post alerts");
                const wellnessRole = i.guild.roles.cache.find(role => role.name.toLowerCase() === "wellness check-in alerts");
                await prisma.scheduledPost.deleteMany({
                    where: {
                        guildId: i.guildId,
                        OR: [
                            { content: { contains: "{{magic_six_daily_" } },
                            { content: { contains: mentalHealthMarker } },
                            { content: { contains: "{{daily_night_checkin}}" } },
                            { content: { in: ["{{daily_morning}}", "{{daily_midday}}", "{{daily_evening}}", "{{daily_night}}"] } }
                        ]
                    }
                });
                for (const post of completeMagicSchedule) {
                    const roleIds = [...post.roleNames, "Magic Post Alerts"]
                        .map(name => i.guild.roles.cache.find(role => role.name.toLowerCase() === name.toLowerCase())?.id)
                        .filter((id) => Boolean(id));
                    await prisma.scheduledPost.create({
                        data: {
                            guildId: i.guildId,
                            channelId: magic.id,
                            content: `${[...new Set([magicAlertRole?.id, ...roleIds].filter(Boolean))].map(id => `<@&${id}>`).join(" ")}\n${post.token}`.trim(),
                            cron: `0 ${post.hour} * * *`,
                            timezone
                        }
                    });
                }
                for (const daily of [
                    { hour: 9, token: "{{daily_morning}}" },
                    { hour: 12, token: "{{daily_midday}}" },
                    { hour: 18, token: "{{daily_evening}}" },
                    { hour: 21, token: "{{daily_night}}" }
                ]) {
                    await prisma.scheduledPost.create({
                        data: { guildId: i.guildId, channelId: announcements.id, content: daily.token, cron: `0 ${daily.hour} * * *`, timezone }
                    });
                }
                await saveMentalHealthSchedule({
                    guildId: i.guildId,
                    channelId: wellness.id,
                    roleId: wellnessRole?.id,
                    hour: 15,
                    timezone
                });
                await prisma.scheduledPost.create({
                    data: {
                        guildId: i.guildId,
                        channelId: wellness.id,
                        content: `${wellnessRole ? `<@&${wellnessRole.id}>\n` : ""}{{daily_night_checkin}}`,
                        cron: "0 22 * * *",
                        timezone
                    }
                });
                await publishServerRules(rulesChannel);
                await i.editReply(`Complete horror-themed setup finished.\n\n` +
                    `• **12 categories**, **31 text channels**, and **6 voice channels** are ready\n` +
                    `• Partner-server area and private staff headquarters created\n` +
                    `• Community panels: **${panelSummary}**\n` +
                    `• Coven rules embed posted in ${rulesChannel}\n` +
                    `• **${levelRoles.length} level roles** connected\n` +
                    `• Welcome, goodbye, logs, tickets, starboard, autorole, levels, automod, and AI configured\n` +
                    `• Automatic games run every **90 minutes** in ${games}\n` +
                    `• Six magic posts and four community messages are scheduled daily\n` +
                    `• Mental-health check-in runs daily at **3 PM**\n` +
                    `• Nighttime wellness check-in runs daily at **10 PM**\n\n` +
                    `Nymera will activate every new schedule automatically within one minute. Add social feeds to ${social}; Twitch and social feeds still require your account URLs or credentials.`);
                return;
            }
            await ensureGuild(i.guildId);
            const data = {
                welcomeChannelId: i.options.getChannel("welcome_channel")?.id,
                goodbyeChannelId: i.options.getChannel("goodbye_channel")?.id,
                logChannelId: i.options.getChannel("log_channel")?.id,
                autoRoleId: i.options.getRole("auto_role")?.id,
                scheduledChannelId: i.options.getChannel("scheduled_channel")?.id,
                aiEnabled: i.options.getBoolean("ai_enabled") ?? undefined,
                automodEnabled: i.options.getBoolean("automod_enabled") ?? undefined,
                blockInvites: i.options.getBoolean("block_invites") ?? undefined,
                ticketCategoryId: i.options.getChannel("ticket_category")?.id,
                starboardChannelId: i.options.getChannel("starboard_channel")?.id,
                starboardThreshold: i.options.getInteger("starboard_threshold") ?? undefined
            };
            await prisma.guildConfig.update({ where: { guildId: i.guildId }, data });
            await i.reply({ content: "Nymera's server settings were updated.", ephemeral: true });
        }
    },
    {
        data: new SlashCommandBuilder().setName("settings").setDescription("View Nymera's server configuration").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
        async execute(i) {
            const c = await ensureGuild(i.guildId);
            const showChannel = (id) => id ? channelMention(id) : "Not set";
            await i.reply({ embeds: [new EmbedBuilder().setColor(0x6f42c1).setTitle("Nymera settings").addFields({ name: "Welcome", value: showChannel(c.welcomeChannelId), inline: true }, { name: "Goodbye", value: showChannel(c.goodbyeChannelId), inline: true }, { name: "Logs", value: showChannel(c.logChannelId), inline: true }, { name: "Auto role", value: c.autoRoleId ? roleMention(c.autoRoleId) : "Not set", inline: true }, { name: "Scheduled posts", value: showChannel(c.scheduledChannelId), inline: true }, { name: "Ticket category", value: showChannel(c.ticketCategoryId), inline: true }, { name: "Starboard", value: `${showChannel(c.starboardChannelId)} • ${c.starboardThreshold} stars`, inline: true }, { name: "AI / Automod / Invites", value: `${c.aiEnabled ? "On" : "Off"} / ${c.automodEnabled ? "On" : "Off"} / ${c.blockInvites ? "Blocked" : "Allowed"}` })], ephemeral: true });
        }
    },
    {
        data: new SlashCommandBuilder().setName("schedule").setDescription("Create a repeating scheduled post").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
            .addChannelOption(o => o.setName("channel").setDescription("Destination").addChannelTypes(ChannelType.GuildText).setRequired(true))
            .addStringOption(o => o.setName("cron").setDescription("Cron, e.g. 0 14 * * *").setRequired(true))
            .addStringOption(o => o.setName("content").setDescription("Post text; separate rotating versions with |||").setRequired(true).setMaxLength(1800))
            .addStringOption(o => o.setName("timezone").setDescription("IANA zone, e.g. America/Denver")),
        async execute(i) {
            const expression = i.options.getString("cron", true);
            if (!cron.validate(expression))
                return void await i.reply({ content: "That cron expression is invalid.", ephemeral: true });
            await prisma.scheduledPost.create({ data: {
                    guildId: i.guildId,
                    channelId: i.options.getChannel("channel", true).id,
                    cron: expression,
                    content: i.options.getString("content", true),
                    timezone: i.options.getString("timezone") ?? "America/Denver"
                } });
            await i.reply({ content: "Scheduled post saved. Nymera will activate it automatically within one minute.", ephemeral: true });
        }
    },
    {
        data: new SlashCommandBuilder().setName("daily-message").setDescription("Schedule a rotating daily community message")
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
            .addChannelOption(o => o.setName("channel").setDescription("Destination").setRequired(true).addChannelTypes(ChannelType.GuildText))
            .addStringOption(o => o.setName("preset").setDescription("Message rotation").setRequired(true).addChoices({ name: "Morning", value: "{{daily_morning}}" }, { name: "Midday", value: "{{daily_midday}}" }, { name: "Evening", value: "{{daily_evening}}" }, { name: "Night", value: "{{daily_night}}" }, { name: "Wellness", value: "{{daily_wellness}}" }))
            .addStringOption(o => o.setName("cron").setDescription("Cron, e.g. 0 9 * * *").setRequired(true))
            .addStringOption(o => o.setName("timezone").setDescription("IANA timezone, e.g. America/Denver")),
        async execute(i) {
            const expression = i.options.getString("cron", true);
            if (!cron.validate(expression))
                return void await i.reply({ content: "That cron expression is invalid.", ephemeral: true });
            const post = await prisma.scheduledPost.create({ data: {
                    guildId: i.guildId,
                    channelId: i.options.getChannel("channel", true).id,
                    cron: expression,
                    content: i.options.getString("preset", true),
                    timezone: i.options.getString("timezone") ?? "America/Denver"
                } });
            await i.reply({ content: `Rotating daily message #${post.id} saved. Nymera will activate it automatically within one minute.`, ephemeral: true });
        }
    },
    {
        data: new SlashCommandBuilder().setName("scheduled-posts").setDescription("List or delete scheduled posts")
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
            .addSubcommand(s => s.setName("list").setDescription("List this server's scheduled posts"))
            .addSubcommand(s => s.setName("test").setDescription("Post one saved schedule immediately")
            .addIntegerOption(o => o.setName("id").setDescription("Post ID from the list").setRequired(true).setMinValue(1)))
            .addSubcommand(s => s.setName("delete").setDescription("Delete a scheduled post")
            .addIntegerOption(o => o.setName("id").setDescription("Post ID from the list").setRequired(true).setMinValue(1))),
        async execute(i) {
            const subcommand = i.options.getSubcommand();
            if (subcommand === "delete") {
                const result = await prisma.scheduledPost.deleteMany({
                    where: { id: i.options.getInteger("id", true), guildId: i.guildId }
                });
                await i.reply({ content: result.count ? "Scheduled post deleted. Nymera will unload it automatically within one minute." : "Scheduled post not found.", ephemeral: true });
                return;
            }
            if (subcommand === "test") {
                await i.deferReply({ ephemeral: true });
                const result = await runScheduledPostNow(i.client, i.guildId, i.options.getInteger("id", true));
                await i.editReply(result.ok
                    ? "The scheduled post was delivered successfully."
                    : `The scheduled post failed: ${result.reason ?? "Unknown error"}`);
                return;
            }
            const posts = await prisma.scheduledPost.findMany({
                where: { guildId: i.guildId },
                orderBy: { id: "asc" }
            });
            await i.reply({
                content: posts.map(post => `**#${post.id}** • <#${post.channelId}> • \`${post.cron}\` • ${post.content.slice(0, 70)}`).join("\n") || "No scheduled posts configured.",
                ephemeral: true
            });
        }
    },
    {
        data: new SlashCommandBuilder().setName("mental-health-checkin").setDescription("Schedule a gentle daily mental-health check-in")
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
            .addChannelOption(o => o.setName("channel").setDescription("Where to post the daily check-in").setRequired(true).addChannelTypes(ChannelType.GuildText))
            .addRoleOption(o => o.setName("ping_role").setDescription("Optional role to notify"))
            .addIntegerOption(o => o.setName("hour").setDescription("Posting hour, 0–23 (default: 15 for 3 PM)").setMinValue(0).setMaxValue(23))
            .addStringOption(o => o.setName("timezone").setDescription("IANA timezone (default: America/Denver)")),
        async execute(i) {
            const channel = i.options.getChannel("channel", true);
            const role = i.options.getRole("ping_role");
            const hour = i.options.getInteger("hour") ?? 15;
            const timezone = i.options.getString("timezone") ?? "America/Denver";
            if (!validTimezone(timezone)) {
                return void await i.reply({
                    content: "That timezone is invalid. Try one such as `America/Denver`.",
                    ephemeral: true
                });
            }
            await saveMentalHealthSchedule({
                guildId: i.guildId,
                channelId: channel.id,
                roleId: role?.id,
                hour,
                timezone
            });
            await i.reply({
                content: `Daily mental-health check-in scheduled in ${channel} at **${hour.toString().padStart(2, "0")}:00** (${timezone}). Nymera will activate it automatically within one minute.`,
                ephemeral: true
            });
        }
    },
    {
        data: new SlashCommandBuilder().setName("mental-health-space").setDescription("Create a wellness category, check-in channel, and daily post")
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
            .addRoleOption(o => o.setName("ping_role").setDescription("Optional role to notify"))
            .addIntegerOption(o => o.setName("hour").setDescription("Posting hour, 0–23 (default: 15 for 3 PM)").setMinValue(0).setMaxValue(23))
            .addStringOption(o => o.setName("timezone").setDescription("IANA timezone (default: America/Denver)")),
        async execute(i) {
            const timezone = i.options.getString("timezone") ?? "America/Denver";
            if (!validTimezone(timezone)) {
                return void await i.reply({
                    content: "That timezone is invalid. Try one such as `America/Denver`.",
                    ephemeral: true
                });
            }
            await i.deferReply({ ephemeral: true });
            const guild = i.guild;
            const categoryName = "Mental Health & Wellness";
            const channelName = "mental-health-check-in";
            let category = guild.channels.cache.find(channel => channel.type === ChannelType.GuildCategory && channel.name === categoryName);
            category ??= await guild.channels.create({
                name: categoryName,
                type: ChannelType.GuildCategory,
                reason: `Mental-health space created by ${i.user.tag}`
            });
            let channel = guild.channels.cache.find(candidate => candidate.type === ChannelType.GuildText &&
                candidate.name === channelName &&
                candidate.parentId === category.id);
            channel ??= await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: category.id,
                topic: "A gentle community check-in space. Peer support is not a substitute for professional care.",
                reason: `Mental-health space created by ${i.user.tag}`
            });
            const hour = i.options.getInteger("hour") ?? 15;
            await saveMentalHealthSchedule({
                guildId: guild.id,
                channelId: channel.id,
                roleId: i.options.getRole("ping_role")?.id,
                hour,
                timezone
            });
            await i.editReply(`Created **${categoryName}** with ${channel}. The daily check-in is set for **${hour.toString().padStart(2, "0")}:00** (${timezone}). Nymera will activate it automatically within one minute.`);
        }
    }
];
