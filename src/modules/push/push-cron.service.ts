import { PdfService } from "../pdf/pdf.service";
import { PushService } from "./push.service";
import { addDays, formatIsoDate, getApiTodayDateParts, getWeekday } from "../../shared/utils/api-date.util";

const BOOKLET_CHECK_WEEKDAYS = [0, 4, 5, 6]; // Sun, Thu, Fri, Sat
const REMINDER_WEEKDAYS = [0, 5, 6]; // Sun, Fri, Sat

export type BookletCheckResult = {
  checked: boolean;
  availabilitySent: boolean;
  pdfUrl: string | null;
  sundayIsoDate: string | null;
};

export type BookletReminderResult = {
  checked: boolean;
  remindersSent: number;
  pdfUrl: string | null;
  sundayIsoDate: string | null;
};

async function resolveUpcomingSundayBooklet(): Promise<{ pdfUrl: string; sundayIsoDate: string } | null> {
  const today = getApiTodayDateParts();
  const daysUntilSunday = (7 - getWeekday(today)) % 7;
  const upcomingSunday = addDays(today, daysUntilSunday);
  const upcomingSundayIso = formatIsoDate(upcomingSunday);

  const sundayMissallete = await new PdfService().getNextSunday();
  if (!sundayMissallete?.content) {
    return null;
  }

  return {
    pdfUrl: sundayMissallete.content,
    sundayIsoDate: upcomingSundayIso,
  };
}

export async function runSundayBookletAvailabilityCheck(): Promise<BookletCheckResult> {
  const today = getApiTodayDateParts();
  const weekday = getWeekday(today);

  if (!BOOKLET_CHECK_WEEKDAYS.includes(weekday)) {
    return { checked: false, availabilitySent: false, pdfUrl: null, sundayIsoDate: null };
  }

  const booklet = await resolveUpcomingSundayBooklet();
  if (!booklet) {
    return { checked: true, availabilitySent: false, pdfUrl: null, sundayIsoDate: null };
  }

  const pushService = new PushService();
  const lastNotifiedDate = await pushService.getLastNotifiedSundayDate();

  if (lastNotifiedDate === booklet.sundayIsoDate) {
    return {
      checked: true,
      availabilitySent: false,
      pdfUrl: booklet.pdfUrl,
      sundayIsoDate: booklet.sundayIsoDate,
    };
  }

  const todayIso = formatIsoDate(today);
  await pushService.setLastNotifiedBookletUrl(booklet.pdfUrl, booklet.sundayIsoDate);
  await pushService.sendSundayBookletNotification(booklet.pdfUrl, todayIso);

  return {
    checked: true,
    availabilitySent: true,
    pdfUrl: booklet.pdfUrl,
    sundayIsoDate: booklet.sundayIsoDate,
  };
}

export async function runSundayBookletDailyReminders(): Promise<BookletReminderResult> {
  const today = getApiTodayDateParts();
  const weekday = getWeekday(today);

  if (!REMINDER_WEEKDAYS.includes(weekday)) {
    return { checked: false, remindersSent: 0, pdfUrl: null, sundayIsoDate: null };
  }

  const booklet = await resolveUpcomingSundayBooklet();
  if (!booklet) {
    return { checked: true, remindersSent: 0, pdfUrl: null, sundayIsoDate: null };
  }

  const pushService = new PushService();
  const lastNotifiedDate = await pushService.getLastNotifiedSundayDate();

  // Only remind after the availability notification was sent for this Sunday.
  if (lastNotifiedDate !== booklet.sundayIsoDate) {
    return {
      checked: true,
      remindersSent: 0,
      pdfUrl: booklet.pdfUrl,
      sundayIsoDate: booklet.sundayIsoDate,
    };
  }

  const todayIso = formatIsoDate(today);
  const remindersSent = await pushService.sendDailyBookletReminders(
    booklet.pdfUrl,
    booklet.sundayIsoDate,
    todayIso
  );

  return {
    checked: true,
    remindersSent,
    pdfUrl: booklet.pdfUrl,
    sundayIsoDate: booklet.sundayIsoDate,
  };
}
