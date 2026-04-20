export const API_TIMEZONE = "America/Sao_Paulo";

export type DateParts = {
  year: number,
  month: number,
  day: number
}

// const FIXED_NOW = new Date("2026-04-18T12:00:00-03:00");
export function getApiNow(): Date {
  return new Date();
}

export function getDatePartsInTimeZone(date: Date, timeZone: string = API_TIMEZONE): DateParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  return { year, month, day };
}

export function getApiTodayDateParts(): DateParts {
  return getDatePartsInTimeZone(getApiNow(), API_TIMEZONE);
}

export function addDays(date: DateParts, amount: number): DateParts {
  const utcDate = new Date(Date.UTC(date.year, date.month - 1, date.day));
  utcDate.setUTCDate(utcDate.getUTCDate() + amount);

  return {
    year: utcDate.getUTCFullYear(),
    month: utcDate.getUTCMonth() + 1,
    day: utcDate.getUTCDate()
  };
}

export function getWeekday(date: DateParts): number {
  const utcDate = new Date(Date.UTC(date.year, date.month - 1, date.day));
  return utcDate.getUTCDay();
}

export function formatIsoDate(date: DateParts): string {
  const day = String(date.day).padStart(2, "0");
  const month = String(date.month).padStart(2, "0");
  const year = String(date.year);

  return `${year}-${month}-${day}`;
}
