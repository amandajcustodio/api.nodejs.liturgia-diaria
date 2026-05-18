import express from "express";
import cors from "cors";
import cron from "node-cron";
import { routes } from "./routes/index"
import { pageNotFoundHandler } from "./middlewares/page-not-found.middleware";
import { errorHandler } from "./middlewares/error-handler.middleware";
import { initializeApp } from "firebase-admin/app";
import { PdfService } from "./modules/pdf/pdf.service";
import { PushService } from "./modules/push/push.service";
import { addDays, formatIsoDate, getApiTodayDateParts, getWeekday } from "./shared/utils/api-date.util";

initializeApp();
const app = express();

app.use(cors());

routes(app);
pageNotFoundHandler(app);
errorHandler(app);

app.listen(3000);

// Check for Sunday booklet every hour on Thu/Fri/Sat/Sun and notify subscribers when it's newly available
cron.schedule("0 * * * *", async () => {
  try {
    const dayOfWeek = new Date().getDay(); // 0=Sun, 4=Thu, 5=Fri, 6=Sat
    if (![0, 4, 5, 6].includes(dayOfWeek)) {
      return;
    }

    const pdfService = new PdfService();
    const pushService = new PushService();

    // Resolve upcoming Sunday's ISO date
    const today = getApiTodayDateParts();
    const daysUntilSunday = (7 - getWeekday(today)) % 7;
    const upcomingSunday = addDays(today, daysUntilSunday);
    const upcomingSundayIso = formatIsoDate(upcomingSunday);

    // Skip entirely if we already sent the notification for this Sunday
    const lastNotifiedDate = await pushService.getLastNotifiedSundayDate();
    if (lastNotifiedDate === upcomingSundayIso) {
      return;
    }

    const sundayMissallete = await pdfService.getNextSunday();
    if (!sundayMissallete?.content) {
      return;
    }

    await pushService.setLastNotifiedBookletUrl(sundayMissallete.content, upcomingSundayIso);
    await pushService.sendSundayBookletNotification(sundayMissallete.content);
  } catch {
    // Silently ignore cron errors to avoid crashing the server
  }
}, { timezone: "America/Sao_Paulo" });
