import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { ensureGuild, prisma } from "../database.js";
import { endGiveaway, giveawayEmbed, parseDuration } from "../services/community.js";
import { discordAsset } from "../services/assets.js";
import { checkTwitchAlert, twitchConfigured } from "../services/twitch-alerts.js";
const communityRolePanels = [
    {
        title: "Choose Your Pronouns",
        description: "Choose every option that feels right for you. Click a button again whenever you want to remove it.",
        image: "roles-pronouns-banner.png",
        color: 0xa86ee8,
        roles: [
            ["She / Her", "🌙 She / Her"],
            ["He / Him", "🗡️ He / Him"],
            ["They / Them", "✨ They / Them"],
            ["Any Pronouns", "🌈 Any Pronouns"],
            ["Ask My Pronouns", "💬 Ask Me"]
        ]
    },
    {
        title: "Choose Your Games",
        description: "Find members who enjoy the same kinds of games and receive relevant community pings.",
        image: "roles-games-banner.png",
        color: 0x6f42c1,
        roles: [
            ["Dead by Daylight", "🩸 Dead by Daylight"],
            ["Horror Games", "👻 Horror Games"],
            ["Cozy Games", "🍄 Cozy Games"],
            ["Roleplaying Games", "🐉 RPGs"],
            ["Party Games", "🎉 Party Games"],
            ["Action & FPS", "🎯 Action / FPS"],
            ["Indie Games", "🕹️ Indie Games"],
            ["Tabletop Games", "🎲 Tabletop"]
        ]
    },
    {
        title: "Choose Your Interests",
        description: "Show the community what you love and discover people with shared interests.",
        image: "roles-interests-banner.png",
        color: 0x8e55b7,
        roles: [
            ["Art", "🎨 Art"],
            ["Music", "🎧 Music"],
            ["Books", "📚 Books"],
            ["Movies & TV", "🎬 Movies / TV"],
            ["Anime", "🌸 Anime"],
            ["Writing", "✒️ Writing"],
            ["Nature", "🌿 Nature"],
            ["Pets", "🐈 Pets"],
            ["Community Events", "🎊 Events"],
            ["Friendly Chat", "☕ Friendly Chat"]
        ]
    },
    {
        title: "Choose Your Magic Interests",
        description: "Select the magical, historical, and reflective subjects you would enjoy exploring.",
        image: "roles-magic-banner.png",
        color: 0x5f9f48,
        roles: [
            ["Tarot & Oracle", "🔮 Tarot / Oracle"],
            ["Astrology", "🪐 Astrology"],
            ["Herbal Lore", "🌿 Herbal Lore"],
            ["Crystals", "💎 Crystals"],
            ["Witchcraft History", "🕯️ Witchcraft"],
            ["Folklore", "📜 Folklore"],
            ["Moon & Cosmos", "🌙 Moon / Cosmos"],
            ["Spellcraft", "📖 Spellcraft"],
            ["Divination", "🪞 Divination"],
            ["Mythology", "🏛️ Mythology"]
        ]
    },
    {
        title: "Choose Your Notifications",
        description: "Opt into only the community notifications you want. You can change these choices at any time.",
        image: "roles-notifications-banner.png",
        color: 0x9b73d1,
        roles: [
            ["Announcement Alerts", "📣 Announcements"],
            ["Event Alerts", "🎊 Events"],
            ["Giveaway Alerts", "🎁 Giveaways"],
            ["Game Alerts", "🎮 Game Alerts"],
            ["Magic Post Alerts", "🔮 Magic Posts"],
            ["Social Media Alerts", "📱 Social Media"],
            ["Wellness Check-In Alerts", "🌿 Wellness"],
            ["Server Update Alerts", "🛠️ Server Updates"]
        ]
    },
    {
        title: "How Do You Like to Socialize?",
        description: "Choose the ways you enjoy connecting. These roles help other members understand your social style.",
        image: "roles-social-banner.png",
        color: 0x9368c7,
        roles: [
            ["Looking for Friends", "💜 New Friends"],
            ["Text Chat", "💬 Text Chat"],
            ["Voice Chat", "🎙️ Voice Chat"],
            ["Quiet Company", "🌙 Quiet Company"],
            ["Creative Sharing", "🎨 Creative Sharing"],
            ["Casual Gamer", "🍄 Casual Gamer"],
            ["Competitive Gamer", "⚔️ Competitive"],
            ["Group Activities", "✨ Group Activities"]
        ]
    },
    {
        title: "Choose Your Horror",
        description: "Show which kinds of spooky stories, films, games, and folklore you enjoy. Keep discussions non-graphic in shared spaces.",
        image: "roles-horror-banner.png",
        color: 0x713e91,
        roles: [
            ["Gothic Horror", "🏰 Gothic"],
            ["Supernatural Horror", "👻 Supernatural"],
            ["Psychological Horror", "🪞 Psychological"],
            ["Slasher Horror", "🔪 Slashers"],
            ["Creature Features", "🐺 Creatures"],
            ["Found Footage", "📹 Found Footage"],
            ["Horror Literature", "📚 Horror Books"],
            ["Paranormal Lore", "🕯️ Paranormal Lore"]
        ]
    },
    {
        title: "Choose Your Trial Role",
        description: "Find other Dead by Daylight players by role, play style, and favorite activities.",
        image: "roles-dbd-banner.png",
        color: 0x60408c,
        roles: [
            ["Survivor Main", "🏃 Survivor Main"],
            ["Killer Main", "🩸 Killer Main"],
            ["Solo Queue", "🌫️ Solo Queue"],
            ["SWF Player", "🤝 SWF"],
            ["Custom Games", "🎲 Custom Games"],
            ["DBD Build Crafter", "🧰 Build Crafter"],
            ["DBD Lore Fan", "📜 Lore Fan"],
            ["DBD Challenge Hunter", "🏆 Challenges"]
        ]
    }
];
function buttonRows(entries) {
    const rows = [];
    for (let index = 0; index < entries.length; index += 5) {
        rows.push(new ActionRowBuilder().addComponents(entries.slice(index, index + 5).map(entry => new ButtonBuilder()
            .setCustomId(`rolebutton:${entry.roleId}`)
            .setLabel(entry.label)
            .setStyle(ButtonStyle.Secondary))));
    }
    return rows;
}
export const communityCommands = [
    {
        data: new SlashCommandBuilder().setName("ticket").setDescription("Open or manage a support ticket")
            .addSubcommand(s => s.setName("open").setDescription("Open a private ticket")
            .addStringOption(o => o.setName("subject").setDescription("How can staff help?").setRequired(true).setMaxLength(300)))
            .addSubcommand(s => s.setName("close").setDescription("Close the current ticket"))
            .addSubcommand(s => s.setName("add").setDescription("Add a member to this ticket")
            .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))),
        async execute(i) {
            const sub = i.options.getSubcommand();
            if (sub === "open") {
                const config = await ensureGuild(i.guildId);
                const existing = await prisma.ticket.findFirst({ where: { guildId: i.guildId, ownerId: i.user.id, status: "open" } });
                if (existing)
                    return void await i.reply({ content: `You already have an open ticket: <#${existing.channelId}>.`, ephemeral: true });
                const channel = await i.guild.channels.create({
                    name: `ticket-${i.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 80),
                    type: ChannelType.GuildText,
                    parent: config.ticketCategoryId ?? undefined,
                    topic: `Nymera ticket for ${i.user.tag} (${i.user.id})`,
                    permissionOverwrites: [
                        { id: i.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
                        { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                        { id: i.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
                    ]
                });
                const ticket = await prisma.ticket.create({ data: { guildId: i.guildId, channelId: channel.id, ownerId: i.user.id, subject: i.options.getString("subject", true) } });
                await channel.send({ embeds: [new EmbedBuilder().setColor(0x6f42c1).setTitle(`Ticket #${ticket.id}`).setDescription(`Opened by ${i.user}\n\n**Subject:** ${ticket.subject}\n\nStaff with server-level channel access can view this ticket. Use \`/ticket close\` when finished.`)] });
                await i.reply({ content: `Your ticket is ready: ${channel}.`, ephemeral: true });
                return;
            }
            const ticket = await prisma.ticket.findUnique({ where: { channelId: i.channelId } });
            if (!ticket || ticket.status !== "open")
                return void await i.reply({ content: "This is not an open ticket channel.", ephemeral: true });
            const isStaff = i.memberPermissions?.has(PermissionFlagsBits.ManageChannels) ?? false;
            if (sub === "add") {
                if (!isStaff && ticket.ownerId !== i.user.id)
                    return void await i.reply({ content: "Only the ticket owner or staff can add members.", ephemeral: true });
                const user = i.options.getUser("user", true);
                const channel = i.channel;
                if (!channel || !("permissionOverwrites" in channel))
                    return;
                await channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
                await i.reply(`${user} was added.`);
                return;
            }
            if (!isStaff && ticket.ownerId !== i.user.id)
                return void await i.reply({ content: "Only the ticket owner or staff can close it.", ephemeral: true });
            await prisma.ticket.update({ where: { id: ticket.id }, data: { status: "closed", closedAt: new Date(), closedBy: i.user.id } });
            await i.reply("Ticket closed. This channel will remain as a transcript until staff deletes or archives it.");
            if (i.channel && "permissionOverwrites" in i.channel)
                await i.channel.permissionOverwrites.edit(ticket.ownerId, { SendMessages: false });
        }
    },
    {
        data: new SlashCommandBuilder().setName("role-buttons").setDescription("Create a panel with multiple role buttons")
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
            .addChannelOption(o => o.setName("channel").setDescription("Channel for the role panel").setRequired(true).addChannelTypes(ChannelType.GuildText))
            .addStringOption(o => o.setName("title").setDescription("Panel title").setRequired(true).setMaxLength(100))
            .addRoleOption(o => o.setName("role_1").setDescription("First role").setRequired(true))
            .addStringOption(o => o.setName("label_1").setDescription("First button label").setMaxLength(80))
            .addRoleOption(o => o.setName("role_2").setDescription("Second role"))
            .addStringOption(o => o.setName("label_2").setDescription("Second button label").setMaxLength(80))
            .addRoleOption(o => o.setName("role_3").setDescription("Third role"))
            .addStringOption(o => o.setName("label_3").setDescription("Third button label").setMaxLength(80))
            .addRoleOption(o => o.setName("role_4").setDescription("Fourth role"))
            .addStringOption(o => o.setName("label_4").setDescription("Fourth button label").setMaxLength(80))
            .addRoleOption(o => o.setName("role_5").setDescription("Fifth role"))
            .addStringOption(o => o.setName("label_5").setDescription("Fifth button label").setMaxLength(80)),
        async execute(i) {
            const channel = i.options.getChannel("channel", true);
            if (!("send" in channel))
                return;
            const roles = [1, 2, 3, 4, 5].map(position => {
                const role = i.options.getRole(`role_${position}`);
                if (!role)
                    return null;
                return {
                    role,
                    label: i.options.getString(`label_${position}`)?.trim() || role.name
                };
            }).filter((entry) => entry !== null);
            const uniqueRoles = new Set(roles.map(entry => entry.role.id));
            if (uniqueRoles.size !== roles.length) {
                return void await i.reply({ content: "Each button must use a different role.", ephemeral: true });
            }
            const botMember = i.guild.members.me;
            const invalid = roles.find(entry => entry.role.managed || entry.role.id === i.guild.roles.everyone.id || !botMember || entry.role.position >= botMember.roles.highest.position);
            if (invalid) {
                return void await i.reply({
                    content: `I cannot manage ${invalid.role}. Move Nymera's bot role above it, then try again.`,
                    ephemeral: true
                });
            }
            await i.deferReply({ ephemeral: true });
            const row = new ActionRowBuilder().addComponents(roles.map(entry => new ButtonBuilder()
                .setCustomId(`rolebutton:${entry.role.id}`)
                .setLabel(entry.label)
                .setStyle(ButtonStyle.Secondary)));
            const message = await channel.send({
                embeds: [new EmbedBuilder()
                        .setColor(0x6f42c1)
                        .setTitle(i.options.getString("title", true))
                        .setDescription("Choose your roles below. Click a button again to remove its role.")],
                components: [row]
            });
            await prisma.$transaction(roles.map(entry => prisma.reactionRole.upsert({
                where: { guildId_messageId_emoji: { guildId: i.guildId, messageId: message.id, emoji: `button:${entry.role.id}` } },
                update: { roleId: entry.role.id, channelId: channel.id },
                create: { guildId: i.guildId, channelId: channel.id, messageId: message.id, emoji: `button:${entry.role.id}`, roleId: entry.role.id }
            })));
            await i.editReply(`Role panel created in ${channel}.`);
        }
    },
    {
        data: new SlashCommandBuilder().setName("reaction-role").setDescription("Configure a reaction role").setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
            .addStringOption(o => o.setName("message_id").setDescription("Message ID").setRequired(true))
            .addChannelOption(o => o.setName("channel").setDescription("Message channel").setRequired(true).addChannelTypes(ChannelType.GuildText))
            .addStringOption(o => o.setName("emoji").setDescription("Unicode emoji or custom emoji ID").setRequired(true))
            .addRoleOption(o => o.setName("role").setDescription("Role to assign").setRequired(true)),
        async execute(i) {
            const channel = i.options.getChannel("channel", true);
            if (!("messages" in channel))
                return;
            const messageId = i.options.getString("message_id", true);
            const emoji = i.options.getString("emoji", true);
            const role = i.options.getRole("role", true);
            const message = await channel.messages.fetch(messageId).catch(() => null);
            if (!message)
                return void await i.reply({ content: "Message not found in that channel.", ephemeral: true });
            await message.react(emoji);
            await prisma.reactionRole.upsert({
                where: { guildId_messageId_emoji: { guildId: i.guildId, messageId, emoji } },
                update: { roleId: role.id, channelId: channel.id },
                create: { guildId: i.guildId, channelId: channel.id, messageId, emoji, roleId: role.id }
            });
            await i.reply({ content: `Reaction role saved for ${role}.`, ephemeral: true });
        }
    },
    {
        data: new SlashCommandBuilder().setName("social-media-alert").setDescription("Announce a new social media post")
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
            .addChannelOption(o => o.setName("channel").setDescription("Where Nymera should post the alert").setRequired(true).addChannelTypes(ChannelType.GuildText))
            .addStringOption(o => o.setName("platform").setDescription("Social platform").setRequired(true).addChoices({ name: "Instagram", value: "Instagram" }, { name: "TikTok", value: "TikTok" }, { name: "YouTube", value: "YouTube" }, { name: "Twitch", value: "Twitch" }, { name: "Bluesky", value: "Bluesky" }, { name: "Facebook", value: "Facebook" }, { name: "Other", value: "Social Media" }))
            .addStringOption(o => o.setName("link").setDescription("Direct link to the new post").setRequired(true).setMaxLength(1000))
            .addStringOption(o => o.setName("message").setDescription("Optional announcement text").setMaxLength(1000))
            .addStringOption(o => o.setName("image_url").setDescription("Optional direct HTTPS preview-image URL").setMaxLength(1000)),
        async execute(i) {
            const channel = i.options.getChannel("channel", true);
            if (!("send" in channel))
                return;
            const link = i.options.getString("link", true).trim();
            const imageUrl = i.options.getString("image_url")?.trim();
            const isHttpUrl = (value) => {
                try {
                    const parsed = new URL(value);
                    return parsed.protocol === "https:" || parsed.protocol === "http:";
                }
                catch {
                    return false;
                }
            };
            if (!isHttpUrl(link)) {
                return void await i.reply({ content: "The post link must begin with `https://` or `http://`.", ephemeral: true });
            }
            if (imageUrl && (!isHttpUrl(imageUrl) || !imageUrl.startsWith("https://"))) {
                return void await i.reply({ content: "The optional image URL must be a direct `https://` link.", ephemeral: true });
            }
            const platform = i.options.getString("platform", true);
            const message = i.options.getString("message")?.trim() || "A new post has appeared beyond the haze. Visit the link to see it.";
            const alertRole = i.guild.roles.cache.find(role => role.name.toLowerCase() === "social media alerts");
            const files = imageUrl ? [] : discordAsset("roles-notifications-banner.png");
            const embed = new EmbedBuilder()
                .setColor(0x9b73d1)
                .setTitle(`📱 New ${platform} Post`)
                .setDescription(message)
                .setURL(link)
                .addFields({ name: "View the post", value: `[Open on ${platform}](${link})` })
                .setTimestamp()
                .setFooter({ text: "Spellbound Hazeground • Social Media Alert" });
            if (imageUrl)
                embed.setImage(imageUrl);
            else if (files.length)
                embed.setImage("attachment://roles-notifications-banner.png");
            await channel.send({
                content: alertRole ? `<@&${alertRole.id}>` : undefined,
                embeds: [embed],
                files,
                allowedMentions: { roles: alertRole ? [alertRole.id] : [] }
            });
            await i.reply({
                content: `Social media alert posted in ${channel}.${alertRole ? ` ${alertRole} was notified.` : " The **Social Media Alerts** role was not found; run `/community-role-panels` to create it."}`,
                ephemeral: true
            });
        }
    },
    {
        data: new SlashCommandBuilder().setName("twitch-alerts").setDescription("Configure automatic Twitch live alerts")
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
            .addSubcommand(s => s.setName("setup").setDescription("Watch a Twitch channel and announce when it goes live")
            .addChannelOption(o => o.setName("channel").setDescription("Discord channel for live alerts").setRequired(true).addChannelTypes(ChannelType.GuildText))
            .addStringOption(o => o.setName("twitch_username").setDescription("Twitch channel username, without the URL").setRequired(true).setMaxLength(25)))
            .addSubcommand(s => s.setName("status").setDescription("Show the Twitch live-alert configuration"))
            .addSubcommand(s => s.setName("test-now").setDescription("Check Twitch now and post an alert if the channel is live"))
            .addSubcommand(s => s.setName("disable").setDescription("Disable Twitch live alerts")),
        async execute(i) {
            const subcommand = i.options.getSubcommand();
            if (subcommand === "setup") {
                if (!twitchConfigured) {
                    return void await i.reply({
                        content: "Twitch credentials are missing. Add `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` to Railway, then redeploy.",
                        ephemeral: true
                    });
                }
                const twitchLogin = i.options.getString("twitch_username", true).trim().toLowerCase();
                if (!/^[a-z0-9_]{3,25}$/.test(twitchLogin)) {
                    return void await i.reply({ content: "Enter only the Twitch username, using letters, numbers, or underscores.", ephemeral: true });
                }
                const channel = i.options.getChannel("channel", true);
                await prisma.twitchAlertConfig.upsert({
                    where: { guildId: i.guildId },
                    update: { channelId: channel.id, twitchLogin, enabled: true, lastStreamId: null },
                    create: { guildId: i.guildId, channelId: channel.id, twitchLogin }
                });
                await i.reply({
                    content: `Nymera will check **twitch.tv/${twitchLogin}** every two minutes and announce new live streams in ${channel}. Members with **Social Media Alerts** will be pinged.`,
                    ephemeral: true
                });
                return;
            }
            if (subcommand === "disable") {
                await prisma.twitchAlertConfig.updateMany({ where: { guildId: i.guildId }, data: { enabled: false } });
                await i.reply({ content: "Automatic Twitch live alerts are disabled.", ephemeral: true });
                return;
            }
            const config = await prisma.twitchAlertConfig.findUnique({ where: { guildId: i.guildId } });
            if (subcommand === "status") {
                await i.reply({
                    content: config
                        ? `Status: **${config.enabled ? "enabled" : "disabled"}**\nTwitch channel: **${config.twitchLogin}**\nDiscord channel: <#${config.channelId}>\nAPI credentials: **${twitchConfigured ? "configured" : "missing"}**\nLast check: ${config.lastCheckedAt ? `<t:${Math.floor(config.lastCheckedAt.getTime() / 1000)}:R>` : "not yet"}`
                        : "Twitch live alerts are not configured.",
                    ephemeral: true
                });
                return;
            }
            if (!config?.enabled) {
                return void await i.reply({ content: "Run `/twitch-alerts setup` first.", ephemeral: true });
            }
            await i.deferReply({ ephemeral: true });
            try {
                const result = await checkTwitchAlert(i.client, i.guildId, true);
                await i.editReply(result.live
                    ? "The Twitch channel is live, and Nymera posted a test alert."
                    : result.reason ?? "The Twitch channel is currently offline.");
            }
            catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                await i.editReply(`The Twitch check failed: \`${reason.slice(0, 500)}\``);
            }
        }
    },
    {
        data: new SlashCommandBuilder().setName("community-role-panels").setDescription("Create eight themed community role panels")
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
            .addChannelOption(o => o.setName("channel").setDescription("Channel where all four panels will be posted").setRequired(true).addChannelTypes(ChannelType.GuildText)),
        async execute(i) {
            const channel = i.options.getChannel("channel", true);
            if (!("send" in channel))
                return;
            const botMember = i.guild.members.me;
            if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
                return void await i.reply({ content: "Nymera needs the **Manage Roles** permission first.", ephemeral: true });
            }
            await i.deferReply({ ephemeral: true });
            let createdRoles = 0;
            let reusedRoles = 0;
            for (const panel of communityRolePanels) {
                const entries = [];
                for (const [roleName, label] of panel.roles) {
                    let role = i.guild.roles.cache.find(candidate => candidate.name.toLowerCase() === roleName.toLowerCase());
                    if (role) {
                        if (role.managed || role.position >= botMember.roles.highest.position) {
                            await i.editReply(`I found **${role.name}**, but I cannot manage it. Move Nymera's bot role above that role and run the command again.`);
                            return;
                        }
                        reusedRoles++;
                    }
                    else {
                        role = await i.guild.roles.create({
                            name: roleName,
                            color: panel.color,
                            mentionable: false,
                            reason: `Community role panel created by ${i.user.tag}`
                        });
                        createdRoles++;
                    }
                    entries.push({ roleId: role.id, label });
                }
                const files = discordAsset(panel.image);
                const embed = new EmbedBuilder()
                    .setColor(panel.color)
                    .setTitle(panel.title)
                    .setDescription(panel.description);
                if (files.length)
                    embed.setImage(`attachment://${panel.image}`);
                const message = await channel.send({
                    embeds: [embed],
                    components: buttonRows(entries),
                    files
                });
                await prisma.$transaction(entries.map(entry => prisma.reactionRole.upsert({
                    where: {
                        guildId_messageId_emoji: {
                            guildId: i.guildId,
                            messageId: message.id,
                            emoji: `button:${entry.roleId}`
                        }
                    },
                    update: { roleId: entry.roleId, channelId: channel.id },
                    create: {
                        guildId: i.guildId,
                        channelId: channel.id,
                        messageId: message.id,
                        emoji: `button:${entry.roleId}`,
                        roleId: entry.roleId
                    }
                })));
            }
            await i.editReply(`Eight image role panels were created in ${channel}. Created **${createdRoles}** roles and reused **${reusedRoles}** existing roles.`);
        }
    },
    {
        data: new SlashCommandBuilder().setName("giveaway-start").setDescription("Start a giveaway").setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
            .addStringOption(o => o.setName("prize").setDescription("Prize").setRequired(true).setMaxLength(300))
            .addStringOption(o => o.setName("duration").setDescription("Examples: 30m, 12h, 7d").setRequired(true))
            .addIntegerOption(o => o.setName("winners").setDescription("Winner count").setMinValue(1).setMaxValue(10)),
        async execute(i) {
            if (!i.channel || !("send" in i.channel))
                return;
            const duration = parseDuration(i.options.getString("duration", true));
            if (!duration)
                return void await i.reply({ content: "Use a duration from 1m to 30d, such as `30m`, `12h`, or `7d`.", ephemeral: true });
            const prize = i.options.getString("prize", true);
            const endsAt = new Date(Date.now() + duration);
            const giveaway = await prisma.giveaway.create({ data: { guildId: i.guildId, channelId: i.channelId, prize, endsAt, winnerCount: i.options.getInteger("winners") ?? 1, createdBy: i.user.id } });
            const message = await i.channel.send({ embeds: [giveawayEmbed(prize, endsAt, giveaway.id)] });
            await prisma.giveaway.update({ where: { id: giveaway.id }, data: { messageId: message.id } });
            await i.reply({ content: `Giveaway #${giveaway.id} started.`, ephemeral: true });
        }
    },
    {
        data: new SlashCommandBuilder().setName("giveaway-enter").setDescription("Enter an active giveaway")
            .addIntegerOption(o => o.setName("id").setDescription("Giveaway ID").setRequired(true).setMinValue(1)),
        async execute(i) {
            const giveaway = await prisma.giveaway.findUnique({ where: { id: i.options.getInteger("id", true) } });
            if (!giveaway || giveaway.guildId !== i.guildId || giveaway.endedAt || giveaway.endsAt <= new Date())
                return void await i.reply({ content: "That giveaway is not active.", ephemeral: true });
            await prisma.giveawayEntry.upsert({ where: { giveawayId_userId: { giveawayId: giveaway.id, userId: i.user.id } }, update: {}, create: { giveawayId: giveaway.id, userId: i.user.id } });
            await i.reply({ content: `You entered giveaway #${giveaway.id}.`, ephemeral: true });
        }
    },
    {
        data: new SlashCommandBuilder().setName("giveaway-end").setDescription("End a giveaway now").setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
            .addIntegerOption(o => o.setName("id").setDescription("Giveaway ID").setRequired(true).setMinValue(1)),
        async execute(i) {
            const giveaway = await prisma.giveaway.findUnique({ where: { id: i.options.getInteger("id", true) } });
            if (!giveaway || giveaway.guildId !== i.guildId)
                return void await i.reply({ content: "Giveaway not found.", ephemeral: true });
            await endGiveaway(i.client, giveaway.id);
            await i.reply({ content: "Giveaway ended.", ephemeral: true });
        }
    }
];
