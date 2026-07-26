import { randomInt } from "node:crypto";
import { EmbedBuilder, SlashCommandBuilder, userMention } from "discord.js";
import type { Command } from "../types.js";
import { prisma } from "../database.js";
import { accountKey, advanceQuestProgress, seedGuildEconomy } from "../services/economy.js";

const recipes = {
  comforting_draught: {
    name: "Comforting Draught",
    output: "healing_potion",
    ingredients: { lavender_bundle: 2, moonwater_vial: 1 }
  },
  focus_tonic: {
    name: "Focus Tonic",
    output: "focus_potion",
    ingredients: { rosemary_sprig: 2, crystal_shard: 1 }
  },
  boundary_charm: {
    name: "Boundary Charm",
    output: "boundary_spell",
    ingredients: { rosemary_sprig: 2, crystal_shard: 2 }
  },
  moonlit_intention: {
    name: "Moonlit Intention",
    output: "moon_spell",
    ingredients: { moonwater_vial: 2, ghost_mushroom: 1, crystal_shard: 1 }
  }
} as const;

const species = [
  ["mist_cat", "Mist Cat"], ["raven", "Raven"], ["moon_moth", "Moon Moth"],
  ["shadow_fox", "Shadow Fox"], ["spirit_bat", "Spirit Bat"], ["ghost_hare", "Ghost Hare"]
] as const;

const rarityRoll = () => {
  const roll = randomInt(100);
  if (roll < 3) return "mythic";
  if (roll < 13) return "legendary";
  if (roll < 38) return "rare";
  if (roll < 70) return "uncommon";
  return "common";
};

export const craftingCommands: Command[] = [
  {
    data: new SlashCommandBuilder().setName("recipes").setDescription("View potion and spell crafting recipes"),
    async execute(i) {
      await seedGuildEconomy(i.guildId!);
      const lines = Object.entries(recipes).map(([key, recipe]) =>
        `**${recipe.name}** (\`${key}\`)\n${Object.entries(recipe.ingredients).map(([item, amount]) => `${amount}× \`${item}\``).join(" • ")}`
      );
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x6f42c1).setTitle("Nymera's Recipes").setDescription(lines.join("\n\n"))
        .setFooter({ text: "Crafted potions and spells are symbolic collectibles, not medical products." })] });
    }
  },
  {
    data: new SlashCommandBuilder().setName("craft").setDescription("Craft a potion or spell")
      .addStringOption(o => o.setName("recipe").setDescription("Recipe key from /recipes").setRequired(true))
      .addIntegerOption(o => o.setName("quantity").setDescription("Number to craft").setMinValue(1).setMaxValue(10)),
    async execute(i) {
      await seedGuildEconomy(i.guildId!);
      const key = i.options.getString("recipe", true).toLowerCase() as keyof typeof recipes;
      const recipe = recipes[key];
      if (!recipe) return void await i.reply({ content: "Recipe not found. Use `/recipes`.", ephemeral: true });
      const quantity = i.options.getInteger("quantity") ?? 1;
      try {
        await prisma.$transaction(async tx => {
          await tx.economyAccount.upsert({ ...accountKey(i.guildId!, i.user.id), update: {}, create: { guildId: i.guildId!, userId: i.user.id } });
          for (const [itemKey, needed] of Object.entries(recipe.ingredients)) {
            const item = await tx.shopItem.findUniqueOrThrow({ where: { guildId_key: { guildId: i.guildId!, key: itemKey } } });
            const owned = await tx.inventoryItem.findUnique({ where: { guildId_userId_itemId: { guildId: i.guildId!, userId: i.user.id, itemId: item.id } } });
            const amount = needed * quantity;
            if (!owned || owned.quantity < amount) throw new Error(`MISSING:${itemKey}:${amount}`);
            if (owned.quantity === amount) await tx.inventoryItem.delete({ where: { id: owned.id } });
            else await tx.inventoryItem.update({ where: { id: owned.id }, data: { quantity: { decrement: amount } } });
          }
          const output = await tx.shopItem.findUniqueOrThrow({ where: { guildId_key: { guildId: i.guildId!, key: recipe.output } } });
          await tx.inventoryItem.upsert({
            where: { guildId_userId_itemId: { guildId: i.guildId!, userId: i.user.id, itemId: output.id } },
            update: { quantity: { increment: quantity } },
            create: { guildId: i.guildId!, userId: i.user.id, itemId: output.id, quantity }
          });
          await tx.economyTransaction.create({
            data: { guildId: i.guildId!, userId: i.user.id, type: "crafting", amount: 0, note: `${quantity}x ${key}` }
          });
          await tx.economyAccount.update({
            ...accountKey(i.guildId!, i.user.id),
            data: { crafted: { increment: quantity } }
          });
        });
        await advanceQuestProgress(i.guildId!, i.user.id, "crafting", quantity);
        await i.reply(`🧪 Crafted **${quantity}× ${recipe.name}**.`);
      } catch {
        await i.reply({ content: "You do not have all required ingredients. Check `/recipes` and `/inventory`.", ephemeral: true });
      }
    }
  },
  {
    data: new SlashCommandBuilder().setName("familiar").setDescription("Collect, care for, and upgrade familiars")
      .addSubcommand(s => s.setName("summon").setDescription("Hatch a Mysterious Familiar Egg"))
      .addSubcommand(s => s.setName("list").setDescription("View your familiars"))
      .addSubcommand(s => s.setName("view").setDescription("View your active familiar"))
      .addSubcommand(s => s.setName("select").setDescription("Choose your active familiar")
        .addIntegerOption(o => o.setName("id").setDescription("Familiar ID").setRequired(true).setMinValue(1)))
      .addSubcommand(s => s.setName("rename").setDescription("Rename one of your familiars")
        .addIntegerOption(o => o.setName("id").setDescription("Familiar ID").setRequired(true).setMinValue(1))
        .addStringOption(o => o.setName("name").setDescription("New name").setRequired(true).setMinLength(1).setMaxLength(32)))
      .addSubcommand(s => s.setName("care").setDescription("Care for your active familiar"))
      .addSubcommand(s => s.setName("upgrade").setDescription("Upgrade your active familiar with Spellmarks")),
    async execute(i) {
      await seedGuildEconomy(i.guildId!);
      const sub = i.options.getSubcommand();
      if (sub === "summon") {
        try {
          const familiar = await prisma.$transaction(async tx => {
            const egg = await tx.shopItem.findUniqueOrThrow({ where: { guildId_key: { guildId: i.guildId!, key: "familiar_egg" } } });
            const owned = await tx.inventoryItem.findUnique({ where: { guildId_userId_itemId: { guildId: i.guildId!, userId: i.user.id, itemId: egg.id } } });
            if (!owned?.quantity) throw new Error("NO_EGG");
            if (owned.quantity === 1) await tx.inventoryItem.delete({ where: { id: owned.id } });
            else await tx.inventoryItem.update({ where: { id: owned.id }, data: { quantity: { decrement: 1 } } });
            const [speciesKey, speciesName] = species[randomInt(species.length)]!;
            const hasActive = await tx.familiar.findFirst({ where: { guildId: i.guildId!, userId: i.user.id, active: true } });
            return tx.familiar.create({ data: {
              guildId: i.guildId!, userId: i.user.id, speciesKey, name: speciesName,
              rarity: rarityRoll(), active: !hasActive
            } });
          });
          await i.reply(`✨ Your egg revealed **${familiar.name}**, a **${familiar.rarity}** familiar! ID: \`${familiar.id}\``);
        } catch {
          await i.reply({ content: "You need a `familiar_egg` from `/shop` and `/buy`.", ephemeral: true });
        }
        return;
      }
      if (sub === "list") {
        const rows = await prisma.familiar.findMany({ where: { guildId: i.guildId!, userId: i.user.id }, orderBy: [{ active: "desc" }, { rarity: "desc" }] });
        await i.reply({ content: rows.map(f => `${f.active ? "✨" : "•"} \`#${f.id}\` **${f.name}** • ${f.rarity} • level ${f.level} • bond ${f.bond}`).join("\n") || "You have no familiars yet.", ephemeral: true });
        return;
      }
      if (sub === "select" || sub === "rename") {
        const id = i.options.getInteger("id", true);
        const familiar = await prisma.familiar.findFirst({ where: { id, guildId: i.guildId!, userId: i.user.id } });
        if (!familiar) return void await i.reply({ content: "That familiar is not in your collection.", ephemeral: true });
        if (sub === "select") {
          await prisma.$transaction([
            prisma.familiar.updateMany({ where: { guildId: i.guildId!, userId: i.user.id }, data: { active: false } }),
            prisma.familiar.update({ where: { id }, data: { active: true } })
          ]);
          await i.reply(`**${familiar.name}** is now your active familiar.`);
        } else {
          const name = i.options.getString("name", true).trim();
          await prisma.familiar.update({ where: { id }, data: { name } });
          await i.reply(`Your familiar is now named **${name}**.`);
        }
        return;
      }
      const familiar = await prisma.familiar.findFirst({ where: { guildId: i.guildId!, userId: i.user.id, active: true } });
      if (!familiar) return void await i.reply({ content: "Select or summon an active familiar first.", ephemeral: true });
      if (sub === "view") {
        await i.reply({ embeds: [new EmbedBuilder().setColor(0x6f42c1).setTitle(familiar.name).setDescription(`**Species:** ${familiar.speciesKey.replaceAll("_", " ")}\n**Rarity:** ${familiar.rarity}\n**Level:** ${familiar.level}\n**Bond:** ${familiar.bond}\n**XP:** ${familiar.xp}`)] });
        return;
      }
      if (sub === "care") {
        const cooldown = 6 * 60 * 60 * 1000;
        if (familiar.lastCareAt && Date.now() - familiar.lastCareAt.getTime() < cooldown) {
          return void await i.reply({ content: `Your familiar needs quiet time. Care again <t:${Math.floor((familiar.lastCareAt.getTime() + cooldown) / 1000)}:R>.`, ephemeral: true });
        }
        await prisma.familiar.update({ where: { id: familiar.id }, data: { bond: { increment: 10 }, xp: { increment: 25 }, lastCareAt: new Date() } });
        await i.reply(`💜 You cared for **${familiar.name}**. Bond +10, XP +25.`);
        return;
      }
      const cost = familiar.level * 250;
      try {
        await prisma.$transaction(async tx => {
          const account = await tx.economyAccount.findUniqueOrThrow(accountKey(i.guildId!, i.user.id));
          if (account.wallet < cost) throw new Error("FUNDS");
          await tx.economyAccount.update({ ...accountKey(i.guildId!, i.user.id), data: { wallet: { decrement: cost } } });
          await tx.familiar.update({ where: { id: familiar.id }, data: { level: { increment: 1 }, bond: { increment: 5 } } });
          await tx.economyTransaction.create({ data: { guildId: i.guildId!, userId: i.user.id, type: "familiar_upgrade", amount: -cost, note: String(familiar.id) } });
        });
        await i.reply(`🌟 **${familiar.name}** reached level ${familiar.level + 1} for ${cost} Spellmarks.`);
      } catch {
        await i.reply({ content: `You need ${cost} wallet Spellmarks for this upgrade.`, ephemeral: true });
      }
    }
  },
  {
    data: new SlashCommandBuilder().setName("open-lootbox").setDescription("Open a Haunted Loot Box"),
    async execute(i) {
      await seedGuildEconomy(i.guildId!);
      try {
        const reward = await prisma.$transaction(async tx => {
          const box = await tx.shopItem.findUniqueOrThrow({ where: { guildId_key: { guildId: i.guildId!, key: "haunted_lootbox" } } });
          const owned = await tx.inventoryItem.findUnique({ where: { guildId_userId_itemId: { guildId: i.guildId!, userId: i.user.id, itemId: box.id } } });
          if (!owned?.quantity) throw new Error("NO_BOX");
          if (owned.quantity === 1) await tx.inventoryItem.delete({ where: { id: owned.id } });
          else await tx.inventoryItem.update({ where: { id: owned.id }, data: { quantity: { decrement: 1 } } });
          const roll = randomInt(100);
          if (roll < 25) {
            const marks = 300 + randomInt(501);
            await tx.economyAccount.upsert({ ...accountKey(i.guildId!, i.user.id), update: { wallet: { increment: marks } }, create: { guildId: i.guildId!, userId: i.user.id, wallet: marks } });
            return `${marks} Spellmarks`;
          }
          const rewardKey = roll < 35 ? "familiar_egg" : roll < 55 ? "ghost_mushroom" : roll < 75 ? "crystal_shard" : roll < 88 ? "moonwater_vial" : "halloween_badge";
          const item = await tx.shopItem.findUniqueOrThrow({ where: { guildId_key: { guildId: i.guildId!, key: rewardKey } } });
          const quantity = rewardKey === "crystal_shard" || rewardKey === "moonwater_vial" ? 2 : 1;
          await tx.economyAccount.upsert({ ...accountKey(i.guildId!, i.user.id), update: {}, create: { guildId: i.guildId!, userId: i.user.id } });
          await tx.inventoryItem.upsert({
            where: { guildId_userId_itemId: { guildId: i.guildId!, userId: i.user.id, itemId: item.id } },
            update: { quantity: { increment: quantity } },
            create: { guildId: i.guildId!, userId: i.user.id, itemId: item.id, quantity }
          });
          return `${quantity}× ${item.name}`;
        });
        await i.reply(`🎁 The Haunted Loot Box contained **${reward}**!`);
      } catch {
        await i.reply({ content: "You need a `haunted_lootbox` from `/shop`.", ephemeral: true });
      }
    }
  },
  {
    data: new SlashCommandBuilder().setName("trade").setDescription("Offer and manage secure member trades")
      .addSubcommand(s => s.setName("offer").setDescription("Offer an inventory item for Spellmarks")
        .addUserOption(o => o.setName("user").setDescription("Recipient").setRequired(true))
        .addStringOption(o => o.setName("item").setDescription("Item key from /inventory or /shop").setRequired(true))
        .addIntegerOption(o => o.setName("quantity").setDescription("Quantity offered").setRequired(true).setMinValue(1).setMaxValue(100))
        .addIntegerOption(o => o.setName("price").setDescription("Requested Spellmarks").setRequired(true).setMinValue(0).setMaxValue(1000000)))
      .addSubcommand(s => s.setName("list").setDescription("List trades awaiting your response"))
      .addSubcommand(s => s.setName("accept").setDescription("Accept a trade")
        .addIntegerOption(o => o.setName("id").setDescription("Trade ID").setRequired(true).setMinValue(1)))
      .addSubcommand(s => s.setName("decline").setDescription("Decline a trade")
        .addIntegerOption(o => o.setName("id").setDescription("Trade ID").setRequired(true).setMinValue(1))),
    async execute(i) {
      await seedGuildEconomy(i.guildId!);
      const sub = i.options.getSubcommand();
      if (sub === "offer") {
        const recipient = i.options.getUser("user", true);
        if (recipient.bot || recipient.id === i.user.id) return void await i.reply({ content: "Choose another human member.", ephemeral: true });
        const item = await prisma.shopItem.findUnique({ where: { guildId_key: { guildId: i.guildId!, key: i.options.getString("item", true).toLowerCase() } } });
        const quantity = i.options.getInteger("quantity", true);
        if (!item) return void await i.reply({ content: "Item not found.", ephemeral: true });
        const owned = await prisma.inventoryItem.findUnique({ where: { guildId_userId_itemId: { guildId: i.guildId!, userId: i.user.id, itemId: item.id } } });
        if (!owned || owned.quantity < quantity) return void await i.reply({ content: "You do not own enough of that item.", ephemeral: true });
        const trade = await prisma.itemTrade.create({ data: {
          guildId: i.guildId!, senderId: i.user.id, recipientId: recipient.id, itemId: item.id,
          quantity, requestedMarks: i.options.getInteger("price", true), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        } });
        await i.reply(`${userMention(recipient.id)}, trade **#${trade.id}** offers ${quantity}× **${item.name}** for ${trade.requestedMarks} Spellmarks. Use \`/trade accept\` or \`/trade decline\` within 24 hours.`);
        return;
      }
      if (sub === "list") {
        const rows = await prisma.itemTrade.findMany({ where: { guildId: i.guildId!, recipientId: i.user.id, status: "pending", expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
        const items = await prisma.shopItem.findMany({ where: { id: { in: rows.map(row => row.itemId) } } });
        const names = new Map(items.map(item => [item.id, item.name]));
        await i.reply({ content: rows.map(row => `**#${row.id}** • ${userMention(row.senderId)} offers ${row.quantity}× ${names.get(row.itemId) ?? "item"} for ${row.requestedMarks} Spellmarks`).join("\n") || "No pending trades.", ephemeral: true });
        return;
      }
      const id = i.options.getInteger("id", true);
      const trade = await prisma.itemTrade.findFirst({ where: { id, guildId: i.guildId!, recipientId: i.user.id, status: "pending" } });
      if (!trade || trade.expiresAt <= new Date()) return void await i.reply({ content: "That trade is unavailable or expired.", ephemeral: true });
      if (sub === "decline") {
        await prisma.itemTrade.update({ where: { id }, data: { status: "declined", completedAt: new Date() } });
        await i.reply({ content: `Trade #${id} declined.`, ephemeral: true });
        return;
      }
      try {
        await prisma.$transaction(async tx => {
          const sellerItem = await tx.inventoryItem.findUnique({ where: { guildId_userId_itemId: { guildId: trade.guildId, userId: trade.senderId, itemId: trade.itemId } } });
          if (!sellerItem || sellerItem.quantity < trade.quantity) throw new Error("ITEMS");
          const buyer = await tx.economyAccount.upsert({ ...accountKey(trade.guildId, trade.recipientId), update: {}, create: { guildId: trade.guildId, userId: trade.recipientId } });
          await tx.economyAccount.upsert({ ...accountKey(trade.guildId, trade.senderId), update: {}, create: { guildId: trade.guildId, userId: trade.senderId } });
          if (buyer.wallet < trade.requestedMarks) throw new Error("FUNDS");
          if (sellerItem.quantity === trade.quantity) await tx.inventoryItem.delete({ where: { id: sellerItem.id } });
          else await tx.inventoryItem.update({ where: { id: sellerItem.id }, data: { quantity: { decrement: trade.quantity } } });
          await tx.inventoryItem.upsert({
            where: { guildId_userId_itemId: { guildId: trade.guildId, userId: trade.recipientId, itemId: trade.itemId } },
            update: { quantity: { increment: trade.quantity } },
            create: { guildId: trade.guildId, userId: trade.recipientId, itemId: trade.itemId, quantity: trade.quantity }
          });
          if (trade.requestedMarks) {
            await tx.economyAccount.update({ ...accountKey(trade.guildId, trade.recipientId), data: { wallet: { decrement: trade.requestedMarks } } });
            await tx.economyAccount.update({ ...accountKey(trade.guildId, trade.senderId), data: { wallet: { increment: trade.requestedMarks } } });
          }
          await tx.itemTrade.update({ where: { id }, data: { status: "accepted", completedAt: new Date() } });
        });
        await i.reply(`Trade **#${id}** completed securely.`);
      } catch {
        await i.reply({ content: "Trade failed because the item or Spellmarks are no longer available.", ephemeral: true });
      }
    }
  }
];
