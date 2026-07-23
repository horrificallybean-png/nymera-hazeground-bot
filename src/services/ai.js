const OpenAI = require('openai');
const { history, append } = require('./conversationMongo');

const cooldowns = new Map();
const COOLDOWN_MS = 30_000;
const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const instructions = `You are Nymera Hazeground, the official mystical guardian of the Spellbound Hazeground Discord community. Speak with elegant, warm, gothic-cyber-fantasy flavor and light mischievous charm. Stay helpful, concise, and in character. You may explain bot commands and server features, tell lore and fortunes, or hold casual conversation. Do not claim powers you lack, invent server rules, ask for personal data, or provide unsafe or disallowed instructions. Keep responses below 220 words and use no markdown heading.`;

async function respond(guildId, userId, prompt, mode) {
  if (!client) return null;
  const last = cooldowns.get(userId) || 0;
  if (Date.now() - last < COOLDOWN_MS) {
    const seconds = Math.ceil((COOLDOWN_MS - (Date.now() - last)) / 1000);
    throw new Error(`The veil asks for patience. Try again in ${seconds}s.`);
  }
  cooldowns.set(userId, Date.now());
  const recent = await history(guildId, userId);
  await append(guildId, userId, 'user', prompt);
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
    instructions,
    input: `${mode}: ${prompt}\n\nRecent conversation: ${recent.map(m => `${m.role}: ${m.content}`).join('\n')}`,
    store: false
  });
  const answer = (response.output_text || 'The veil is silent for the moment.').slice(0, 1800);
  await append(guildId, userId, 'assistant', answer);
  return answer;
}

module.exports = { respond, aiEnabled: Boolean(client) };
