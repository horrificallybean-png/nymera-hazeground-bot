import { ChannelType, EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import cron from "node-cron";
import { prisma } from "../database.js";
import { herbs, spells, tarotCards } from "../data-magic.js";
import { deterministicDraw, moonPhase, symbolicPlanetaryHour } from "../services/magic.js";
const findByKeyOrName = (items, query) => items.find(x => x.key === query.toLowerCase().replaceAll(" ", "_")) ??
    items.find(x => x.name.toLowerCase().includes(query.toLowerCase()));
export const magicCommands = [
    {
        data: new SlashCommandBuilder().setName("tarot").setDescription("Draw a reflective tarot card")
            .addStringOption(o => o.setName("question").setDescription("Optional reflection question").setMaxLength(500)),
        async execute(i) {
            const draw = deterministicDraw(`${i.id}:${i.user.id}:${Date.now()}`);
            const meaning = draw.reversed ? draw.card.reversed : draw.card.upright;
            await i.reply({ embeds: [new EmbedBuilder().setColor(0x6f42c1).setTitle(`${draw.card.name}${draw.reversed ? " â€” Reversed" : ""}`)
                        .setDescription(`${meaning}\n\n**Reflection prompt:** ${draw.card.prompt}`)
                        .setFooter({ text: "For reflection and entertainment; not a prediction or professional advice." })] });
        }
    },
    {
        data: new SlashCommandBuilder().setName("daily-draw").setDescription("Receive your stable daily tarot reflection"),
        async execute(i) {
            const dateKey = new Date().toISOString().slice(0, 10);
            const draw = deterministicDraw(`${i.guildId}:${i.user.id}:${dateKey}`);
            const saved = await prisma.dailyDraw.upsert({
                where: { guildId_userId_dateKey: { guildId: i.guildId, userId: i.user.id, dateKey } },
                update: {},
                create: { guildId: i.guildId, userId: i.user.id, dateKey, cardKey: draw.card.key, reversed: draw.reversed }
            });
            const card = tarotCards.find(x => x.key === saved.cardKey) ?? draw.card;
            await i.reply({ embeds: [new EmbedBuilder().setColor(0x6f42c1).setTitle(`Daily Draw: ${card.name}${saved.reversed ? " â€” Reversed" : ""}`)
                        .setDescription(`${saved.reversed ? card.reversed : card.upright}\n\n**Reflection prompt:** ${card.prompt}`)
                        .setFooter({ text: `Your ${dateKey} draw remains the same all day.` })] });
        }
    },
    {
        data: new SlashCommandBuilder().setName("moon").setDescription("Show the approximate current moon phase"),
        async execute(i) {
            const phase = moonPhase();
            await i.reply(`${phase.emoji} **${phase.name}**\nApproximate lunar age: ${phase.age.toFixed(1)} days â€¢ illumination: ${Math.round(phase.illumination * 100)}%\n*Calculated estimate; exact observations vary by location and time.*`);
        }
    },
    {
        data: new SlashCommandBuilder().setName("planetary-hour").setDescription("Show the symbolic equal-hour planetary ruler"),
        async execute(i) {
            const value = symbolicPlanetaryHour();
            await i.reply(`ðŸª Symbolic hour **${value.hour}** is ruled by **${value.planet}**; today's ruler is **${value.ruler}**.\n*This uses equal civil-clock hours, not location-based sunrise and sunset.*`);
        }
    },
    {
        data: new SlashCommandBuilder().setName("herb").setDescription("Search the educational herb encyclopedia")
            .addStringOption(o => o.setName("name").setDescription("Herb name").setRequired(true)),
        async execute(i) {
            const herb = findByKeyOrName(herbs, i.options.getString("name", true));
            if (!herb)
                return void await i.reply({ content: `Not found. Available: ${herbs.map(x => x.name).join(", ")}`, ephemeral: true });
            await i.reply({ embeds: [new EmbedBuilder().setColor(0x3f7d4a).setTitle(`ðŸŒ¿ ${herb.name}`)
                        .addFields({ name: "Lore", value: herb.lore }, { name: "Common use", value: herb.uses }, { name: "Safety", value: herb.safety })
                        .setFooter({ text: "Educational only; not medical advice." })] });
        }
    },
    {
        data: new SlashCommandBuilder().setName("grimoire").setDescription("Open a reflective practice from the grimoire")
            .addStringOption(o => o.setName("entry").setDescription("Entry name").setRequired(true)),
        async execute(i) {
            const spell = findByKeyOrName(spells, i.options.getString("entry", true));
            if (!spell)
                return void await i.reply({ content: `Not found. Available: ${spells.map(x => `${x.name} (\`${x.key}\`)`).join(", ")}`, ephemeral: true });
            await i.reply({ embeds: [new EmbedBuilder().setColor(0x6f42c1).setTitle(`ðŸ“– ${spell.name}`)
                        .addFields({ name: "Purpose", value: spell.purpose }, { name: "Materials", value: spell.materials }, { name: "Steps", value: spell.steps.map((x, n) => `${n + 1}. ${x}`).join("\n") }, { name: "Note", value: spell.note })] });
        }
    },
    {
        data: new SlashCommandBuilder().setName("magic-search").setDescription("Search tarot, herbs, and grimoire entries")
            .addStringOption(o => o.setName("query").setDescription("Search words").setRequired(true).setMinLength(2)),
        async execute(i) {
            const q = i.options.getString("query", true).toLowerCase();
            const results = [
                ...tarotCards.filter(x => JSON.stringify(x).toLowerCase().includes(q)).map(x => `ðŸ”® **${x.name}** â€” tarot key \`${x.key}\``),
                ...herbs.filter(x => JSON.stringify(x).toLowerCase().includes(q)).map(x => `ðŸŒ¿ **${x.name}** â€” herb key \`${x.key}\``),
                ...spells.filter(x => JSON.stringify(x).toLowerCase().includes(q)).map(x => `ðŸ“– **${x.name}** â€” grimoire key \`${x.key}\``)
            ].slice(0, 15);
            await i.reply({ content: results.join("\n") || "No matching entries.", ephemeral: true });
        }
    },
    {
        data: new SlashCommandBuilder().setName("magic-favorite").setDescription("Save a magic-library entry")
            .addStringOption(o => o.setName("kind").setDescription("Library").setRequired(true)
            .addChoices({ name: "Tarot", value: "tarot" }, { name: "Herb", value: "herb" }, { name: "Grimoire", value: "spell" }))
            .addStringOption(o => o.setName("key").setDescription("Entry key").setRequired(true)),
        async execute(i) {
            const kind = i.options.getString("kind", true);
            const key = i.options.getString("key", true).toLowerCase();
            const exists = kind === "tarot" ? tarotCards.some(x => x.key === key) : kind === "herb" ? herbs.some(x => x.key === key) : spells.some(x => x.key === key);
            if (!exists)
                return void await i.reply({ content: "That entry key does not exist.", ephemeral: true });
            await prisma.magicFavorite.upsert({
                where: { guildId_userId_kind_entryKey: { guildId: i.guildId, userId: i.user.id, kind, entryKey: key } },
                update: {},
                create: { guildId: i.guildId, userId: i.user.id, kind, entryKey: key }
            });
            await i.reply({ content: "Saved to your favorites.", ephemeral: true });
        }
    },
    {
        data: new SlashCommandBuilder().setName("magic-favorites").setDescription("View your saved magic entries"),
        async execute(i) {
            const rows = await prisma.magicFavorite.findMany({ where: { guildId: i.guildId, userId: i.user.id }, orderBy: { createdAt: "desc" } });
            await i.reply({ content: rows.map(x => `**${x.kind}** â€” \`${x.entryKey}\``).join("\n") || "You have no saved entries.", ephemeral: true });
        }
    },
    {
        data: new SlashCommandBuilder().setName("magic-schedule").setDescription("Schedule rotating magic content").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
            .addChannelOption(o => o.setName("channel").setDescription("Destination").setRequired(true).addChannelTypes(ChannelType.GuildText))
            .addStringOption(o => o.setName("content").setDescription("Content type").setRequired(true)
            .addChoices({ name: "Daily tarot", value: "{{daily_tarot}}" }, { name: "Moon phase", value: "{{moon_phase}}" }, { name: "Herb lore", value: "{{herb_lore}}" }))
            .addStringOption(o => o.setName("cron").setDescription("Cron, e.g. 0 14 * * *").setRequired(true))
            .addRoleOption(o => o.setName("ping_role").setDescription("Optional role to notify with each lore post"))
            .addStringOption(o => o.setName("timezone").setDescription("IANA timezone, e.g. America/Denver")),
        async execute(i) {
            const expression = i.options.getString("cron", true);
            if (!cron.validate(expression))
                return void await i.reply({ content: "Invalid cron expression.", ephemeral: true });
            await prisma.scheduledPost.create({ data: {
                    guildId: i.guildId, channelId: i.options.getChannel("channel", true).id,
                    content: `${i.options.getRole("ping_role") ? `<@&${i.options.getRole("ping_role").id}>` + "\n" : ""}${i.options.getString("content", true)}`, cron: expression,
                    timezone: i.options.getString("timezone") ?? "America/Denver"
                } });
            await i.reply({ content: "Magic post scheduled. Restart Nymera to load the new schedule.", ephemeral: true });
        }
    }
];
