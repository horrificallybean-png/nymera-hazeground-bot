import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { prisma } from "../database.js";
import { logger } from "../logger.js";
const backupDirectory = resolve(process.cwd(), "prisma", "backups");
const RETENTION = 7;
let backupTimer;
export async function createDatabaseBackup() {
    await mkdir(backupDirectory, { recursive: true });
    const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
    const fileName = `nymera-${stamp}.db`;
    const target = join(backupDirectory, fileName);
    const sqlTarget = target.replaceAll("'", "''").replaceAll("\\", "/");
    await prisma.$executeRawUnsafe(`VACUUM INTO '${sqlTarget}'`);
    const files = (await readdir(backupDirectory))
        .filter(name => /^nymera-.*\.db$/.test(name))
        .map(name => join(backupDirectory, name));
    const dated = await Promise.all(files.map(async (file) => ({ file, modified: (await stat(file)).mtimeMs })));
    dated.sort((a, b) => b.modified - a.modified);
    for (const old of dated.slice(RETENTION))
        await unlink(old.file);
    logger.info({ fileName }, "SQLite backup created");
    return { fileName, target };
}
export async function getBackupStatus() {
    await mkdir(backupDirectory, { recursive: true });
    const names = (await readdir(backupDirectory)).filter(name => /^nymera-.*\.db$/.test(name));
    const files = await Promise.all(names.map(async (name) => {
        const details = await stat(join(backupDirectory, name));
        return { name, modified: details.mtime, size: details.size };
    }));
    return files.sort((a, b) => b.modified.getTime() - a.modified.getTime());
}
export function startBackupMonitor() {
    if (backupTimer)
        clearInterval(backupTimer);
    void createDatabaseBackup().catch(error => logger.error({ error }, "Initial SQLite backup failed"));
    backupTimer = setInterval(() => {
        void createDatabaseBackup().catch(error => logger.error({ error }, "Automatic SQLite backup failed"));
    }, 24 * 60 * 60 * 1000);
    backupTimer.unref();
    logger.info({ retention: RETENTION }, "Automatic backup monitor initialized");
}
