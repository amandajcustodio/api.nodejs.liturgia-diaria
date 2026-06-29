import { DateParts } from "./api-date.util";

export function buildDdMmYyVariants(date: DateParts): string[] {
  const day = date.day;
  const month = date.month;
  const year = date.year;
  const shortYear = year % 100;
  const dayPadded = String(day).padStart(2, "0");
  const monthPadded = String(month).padStart(2, "0");
  const shortYearPadded = String(shortYear).padStart(2, "0");

  return [
    ...new Set([
      `${dayPadded}${monthPadded}${shortYearPadded}`,
      `${day}${month}${shortYearPadded}`,
      `${dayPadded}${month}${shortYearPadded}`,
      `${day}${monthPadded}${shortYearPadded}`,
      `${day}${month}${shortYear}`,
      `${dayPadded}.${monthPadded}.${year}`,
      `${day}.${month}.${year}`
    ])
  ];
}

export function extractDateDigitTokens(text: string): string[] {
  return text.match(/\d{5,8}/g) ?? [];
}

export function matchesDateFuzzy(date: DateParts, candidateToken: string): boolean {
  const normalizedCandidate = candidateToken.trim();

  if (!/^\d{5,8}$/.test(normalizedCandidate)) {
    return false;
  }

  return buildDdMmYyVariants(date).includes(normalizedCandidate);
}

export function isFuzzyDateTokenMatch(expectedToken: string, candidateToken: string): boolean {
  return expectedToken === candidateToken;
}
