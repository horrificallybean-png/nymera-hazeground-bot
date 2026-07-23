const { EmbedBuilder } = require('discord.js');

const COLORS = { violet: 0x6d28d9, green: 0x39ff88, danger: 0xc026d3 };

function nymeraEmbed(title, description, color = COLORS.violet) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`✦ ${title}`)
    .setDescription(description)
    .setFooter({ text: 'Nymera Hazeground • Guardian of Spellbound' })
    .setTimestamp();
}

module.exports = { COLORS, nymeraEmbed };
