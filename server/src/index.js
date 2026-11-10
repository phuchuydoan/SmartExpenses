import { createApp } from './app.js';
import { config } from './config.js';
import { prisma } from './db.js';
import { runMaintenanceForAll } from './services/maintenance.js';
import { geminiEnabled } from './services/gemini.js';

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`SmartSpend API listening on http://localhost:${config.port}`);
  console.log(`Gemini AI: ${geminiEnabled() ? `enabled (${config.geminiModel})` : 'disabled - set GEMINI_API_KEY to enable'}`);
});

// Hourly: recurring transactions, bill reminders, unusual spending, weekly report.
const timer = setInterval(() => runMaintenanceForAll().catch(console.error), 60 * 60 * 1000);
timer.unref();

async function shutdown() {
  clearInterval(timer);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
