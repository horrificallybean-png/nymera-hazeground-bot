import { createHash } from "node:crypto";
import { herbs, tarotCards } from "../data-magic.js";
const synodicMonth = 29.53058867;
const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14);
export function moonPhase(date = new Date()) {
    const days = (date.getTime() - knownNewMoon) / 86_400_000;
    const age = ((days % synodicMonth) + synodicMonth) % synodicMonth;
    const fraction = age / synodicMonth;
    const phases = [
        ["New Moon", "🌑"], ["Waxing Crescent", "🌒"], ["First Quarter", "🌓"], ["Waxing Gibbous", "🌔"],
        ["Full Moon", "🌕"], ["Waning Gibbous", "🌖"], ["Last Quarter", "🌗"], ["Waning Crescent", "🌘"]
    ];
    const index = Math.floor((fraction * 8) + 0.5) % 8;
    return { name: phases[index][0], emoji: phases[index][1], age, illumination: (1 - Math.cos(2 * Math.PI * fraction)) / 2 };
}
export function deterministicDraw(seed) {
    const bytes = createHash("sha256").update(seed).digest();
    return { card: tarotCards[bytes[0] % tarotCards.length], reversed: bytes[1] % 2 === 1 };
}
const planets = ["Saturn", "Jupiter", "Mars", "Sun", "Venus", "Mercury", "Moon"];
const dayRulers = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"];
export function symbolicPlanetaryHour(date = new Date()) {
    const ruler = dayRulers[date.getDay()];
    const start = planets.indexOf(ruler);
    return { planet: planets[(start + date.getHours()) % 7], hour: date.getHours() + 1, ruler };
}
export function renderMagicTemplate(content, date = new Date(), rotation = Math.floor(date.getTime() / 86_400_000)) {
    const phase = moonPhase(date);
    const draw = deterministicDraw(`server-post:${rotation}`);
    const herb = herbs[((rotation % herbs.length) + herbs.length) % herbs.length];
    const rendered = content
        .replaceAll("{{moon_phase}}", `${phase.emoji} **${phase.name}** — about ${Math.round(phase.illumination * 100)}% illuminated.`)
        .replaceAll("{{daily_tarot}}", `🔮 **${draw.card.name}${draw.reversed ? " — reversed" : ""}**\n${draw.reversed ? draw.card.reversed : draw.card.upright}\n*Reflection:* ${draw.card.prompt}`)
        .replaceAll("{{herb_lore}}", `🌿 **${herb.name}**\n${herb.lore}\n*Safety:* ${herb.safety}`);
    return rendered
        .replaceAll("{{magic_six_daily_dawn}}", `🔮 **Dawn Symbolism**\n${draw.card.name} offers a reflective theme for beginning the day: ${draw.reversed ? draw.card.reversed : draw.card.upright}`)
        .replaceAll("{{magic_six_daily_morning}}", `🌿 **Morning Herb Lore**\n${herb.name}: ${herb.lore}\n*Safety:* ${herb.safety}`)
        .replaceAll("{{magic_six_daily_midday}}", "📜 **Midday Folklore**\nA brief educational glimpse into a magical tradition, symbol, legendary creature, or historic custom.")
        .replaceAll("{{magic_six_daily_afternoon}}", "✨ **Afternoon Curiosity**\nExplore the cultural history and symbolism associated with a crystal, charm, color, candle, or protective motif.")
        .replaceAll("{{magic_six_daily_evening}}", `${phase.emoji} **Evening Sky Lore**\nThe moon is approximately ${Math.round(phase.illumination * 100)}% illuminated in its ${phase.name} phase. Explore its astronomy and reflective symbolism.`)
        .replaceAll("{{magic_six_daily_night}}", "🕯️ **Night Grimoire**\nA calm, harmless reflective practice using ordinary items, journaling, creativity, or mindful observation.");
}
