import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.js";
import { askNymera } from "../services/ai.js";
import { trimDiscord } from "../utils/respond.js";

export const aiCommands: Command[] = [{
  data: new SlashCommandBuilder().setName("ask").setDescription("Ask Nymera a question")
    .addStringOption(o => o.setName("question").setDescription("What would you like to ask?").setRequired(true).setMaxLength(1500)),
  async execute(i) {
    if (!i.guildId || !i.channelId) return void await i.reply({ content: "Use this in a server channel.", ephemeral: true });
    await i.deferReply();
    const answer = await askNymera({
      guildId: i.guildId,
      channelId: i.channelId,
      userId: i.user.id,
      prompt: i.options.getString("question", true)
    });
    await i.editReply(trimDiscord(answer));
  }
}];
