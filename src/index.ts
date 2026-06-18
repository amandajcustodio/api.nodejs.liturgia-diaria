import express from "express";
import cors from "cors";
import cron from "node-cron";
import { routes } from "./routes/index"
import { pageNotFoundHandler } from "./middlewares/page-not-found.middleware";
import { errorHandler } from "./middlewares/error-handler.middleware";
import { initializeApp } from "firebase-admin/app";
import {
  runSundayBookletAvailabilityCheck,
  runSundayBookletDailyReminders,
} from "./modules/push/push-cron.service";

initializeApp();
const app = express();

app.use(cors());

routes(app);
pageNotFoundHandler(app);
errorHandler(app);

if (!process.env.VERCEL) {
  app.listen(3000);

  // Local dev: mirror Vercel cron schedules
  cron.schedule("0 * * * *", async () => {
    try {
      await runSundayBookletAvailabilityCheck();
    } catch {
      // Silently ignore cron errors to avoid crashing the server
    }
  }, { timezone: "America/Sao_Paulo" });

  cron.schedule("0 12 * * *", async () => {
    try {
      await runSundayBookletDailyReminders();
    } catch {
      // Silently ignore cron errors to avoid crashing the server
    }
  }, { timezone: "America/Sao_Paulo" });
}

export default app;
