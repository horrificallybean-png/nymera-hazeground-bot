import "dotenv/config";
import { z } from "zod";
const schema = z.object({
    DISCORD_TOKEN: z.string().trim().min(1),
    DISCORD_CLIENT_ID: z.string().trim().min(1),
    DISCORD_GUILD_ID: z.string().trim().optional(),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_MODEL: z.string().default("gpt-5-mini"),
    TWITCH_CLIENT_ID: z.string().trim().optional(),
    TWITCH_CLIENT_SECRET: z.string().trim().optional(),
    LOG_LEVEL: z.string().default("info"),
    DEFAULT_TIMEZONE: z.string().default("America/Denver")
});
const parsed = schema.safeParse(process.env);
if (!parsed.success) {
    console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
    process.exit(1);
}
export const env = parsed.data;
