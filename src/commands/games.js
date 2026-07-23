const { SlashCommandBuilder } = require('discord.js');
const { getUser } = require('../services/store');
const { awardSpellmarks } = require('../services/economy');
const { nymeraEmbed, COLORS } = require('../lib/theme');

async function reward(interaction, title, story, amount) {
  await awardSpellmarks(interaction.guildId, interaction.user.id, amount, title);
  await interaction.reply({ embeds: [nymeraEmbed(title, `${story}\n\n**Reward:** ${amount} Spellmarks`, COLORS.green)] });
}
function simpleGame(name, description, scenes) {
  return { data: new SlashCommandBuilder().setName(name).setDescription(description), async execute(i) { await reward(i, name.replace(/^./, x => x.toUpperCase()), scenes[Math.floor(Math.random() * scenes.length)], 25 + Math.floor(Math.random() * 76)); } };
}

module.exports = [
  { data: new SlashCommandBuilder().setName('slots').setDescription('Spin Nymera’s haunted slot reels.').addIntegerOption(o => o.setName('bet').setDescription('Spellmarks to wager').setMinValue(1).setRequired(true)), async execute(i) { const bet = i.options.getInteger('bet'), user = await getUser(i.guildId, i.user.id); if (user.spellmarks < bet) return i.reply({ content: 'Your vault cannot cover that spin.', ephemeral: true }); const symbols = ['🌙','🦇','🔮','💀']; const spin = Array.from({ length: 3 }, () => symbols[Math.floor(Math.random()*symbols.length)]); const win = spin.every(x => x === spin[0]); user.spellmarks += win ? bet * 4 : -bet; await require('../services/store').save(); await i.reply({ embeds: [nymeraEmbed('Haunted Slots', `${spin.join(' │ ')}\n${win ? `Jackpot: **+${bet*4} Spellmarks**` : `The reels consume **${bet} Spellmarks**.`}`, win ? COLORS.green : COLORS.danger)] }); } },
  { data: new SlashCommandBuilder().setName('dice').setDescription('Roll dice against Nymera.').addIntegerOption(o => o.setName('bet').setDescription('Spellmarks to wager').setMinValue(1).setRequired(true)), async execute(i) { const bet=i.options.getInteger('bet'),u=await getUser(i.guildId,i.user.id); if(u.spellmarks<bet)return i.reply({content:'Your vault cannot cover that wager.',ephemeral:true}); const you=1+Math.floor(Math.random()*6), n=1+Math.floor(Math.random()*6), win=you>n; u.spellmarks+=win?bet:-bet; await require('../services/store').save(); await i.reply({embeds:[nymeraEmbed('Dice in the Dark',`You: **${you}** • Nymera: **${n}**\n${win?`You win **${bet} Spellmarks**.`:`You lose **${bet} Spellmarks**.`}`,win?COLORS.green:COLORS.danger)]}); } },
  { data: new SlashCommandBuilder().setName('highlow').setDescription('Guess whether the next number rises or falls.').addStringOption(o=>o.setName('guess').setDescription('Your prediction').addChoices({name:'Higher',value:'higher'},{name:'Lower',value:'lower'}).setRequired(true)), async execute(i) { const a=1+Math.floor(Math.random()*10),b=1+Math.floor(Math.random()*10), win=(b>a?'higher':'lower')===i.options.getString('guess'); if(win) await reward(i,'High or Low',`The cards reveal **${a} → ${b}**. Your instinct was true.`,70); else await i.reply({embeds:[nymeraEmbed('High or Low',`The cards reveal **${a} → ${b}**. The Haze misled you this time.`)]}); } },
  simpleGame('treasurehunt','Search the Haze for treasure.',['A raven guides you to a moonlit chest.','You evade a mimic beneath the old manor.','An ancient shrine grants you a hidden cache.']),
  simpleGame('fish','Fish the black waters for rare finds.',['A silver fish breaks the surface.','You hook a luminous eel from the fog.','An old relic catches on your line.']),
  { data:new SlashCommandBuilder().setName('tarot').setDescription('Draw a tarot card and reflection.'), async execute(i){ const cards=[['The Moon','Trust intuition, but examine the shadows around it.'],['The Star','Hope is a practice—make room for it.'],['The Hermit','A quiet hour may reveal what noise conceals.']]; const c=cards[Math.floor(Math.random()*cards.length)]; await i.reply({embeds:[nymeraEmbed(`Tarot: ${c[0]}`,`${c[1]}\n\nFor reflection and entertainment, not certainty.`)]}); } },
  simpleGame('spell','Learn a fictional folklore-inspired spell.',['The Candle Archive: a fictional ritual of journaling one hope beside a violet candle.','The Raven Knot: a fantasy charm about tying intentions to a ribbon.']),
  simpleGame('hangman','Begin a compact Hangman-themed challenge.',['The hidden word was **RAVEN**. The archives award your bravery.']),
  simpleGame('memory','Test your memory in Nymera’s archive.',['You match the final pair before the shadows close.']),
  simpleGame('scramble','Unscramble a word from the Haze.',['The scramble **LLEPS** resolves to **SPELL**.']),
  simpleGame('boss','Join a cooperative boss encounter.',['The Hollow Witch retreats after your opening strike; the community receives a shared omen.']),
  simpleGame('duel','Challenge the mist to a quick duel.',['Your sigil flares brighter than your rival’s shadow.'])
];
