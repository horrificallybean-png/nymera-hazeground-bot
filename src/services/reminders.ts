import type { Client } from "discord.js";
import { prisma } from "../database.js";
import { logger } from "../logger.js";

let reminderTimer: NodeJS.Timeout | undefined;

async function deliverDueReminders(client: Client) {
  const due = await prisma.reminder.findMany({
    where: { sentAt: null, dueAt: { lte: new Date() } },
    orderBy: { dueAt: "asc" },
    take: 25
  });
  for (const reminder of due) {
    const channel = await client.channels.fetch(reminder.channelId).catch(() => null);
    if (!channel || !("send" in channel)) {
      logger.warn({ reminderId: reminder.id }, "Reminder channel unavailable");
      continue;
    }
    try {
      await channel.send(`<@${reminder.userId}> ${reminder.kind === "ritual" ? "🕯️ **Ritual reminder:**" : "⏰ **Reminder:**"} ${reminder.content}`);
      await prisma.reminder.update({ where: { id: reminder.id }, data: { sentAt: new Date() } });
    } catch (error) {
      logger.error({ error, reminderId: reminder.id }, "Reminder delivery failed");
    }
  }
}

export function startReminderMonitor(client: Client) {
  if (reminderTimer) clearInterval(reminderTimer);
  void deliverDueReminders(client);
  reminderTimer = setInterval(() => void deliverDueReminders(client), 30_000);
  reminderTimer.unref();
  logger.info("Reminder monitor initialized");
}
