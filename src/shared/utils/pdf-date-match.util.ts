import { DateParts } from "./api-date.util";

const MAX_DATE_TOKEN_LENGTH_DIFF = 2;
const MAX_DATE_EDIT_DISTANCE = 2;

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

  return buildDdMmYyVariants(date).some((variant) => isFuzzyDateTokenMatch(variant, normalizedCandidate));
}

export function isFuzzyDateTokenMatch(expectedToken: string, candidateToken: string): boolean {
  if (expectedToken === candidateToken) {
    return true;
  }

  const lengthDifference = Math.abs(expectedToken.length - candidateToken.length);

  if (lengthDifference > MAX_DATE_TOKEN_LENGTH_DIFF) {
    return false;
  }

  if (levenshteinDistance(expectedToken, candidateToken) <= MAX_DATE_EDIT_DISTANCE) {
    return true;
  }

  if (
    isDigitSubsequence(candidateToken, expectedToken)
    && expectedToken.length - candidateToken.length <= MAX_DATE_TOKEN_LENGTH_DIFF
  ) {
    return true;
  }

  if (
    isDigitSubsequence(expectedToken, candidateToken)
    && candidateToken.length - expectedToken.length <= MAX_DATE_TOKEN_LENGTH_DIFF
  ) {
    return true;
  }

  return false;
}

function isDigitSubsequence(shorter: string, longer: string): boolean {
  if (shorter.length > longer.length) {
    return false;
  }

  let shorterIndex = 0;

  for (let longerIndex = 0; longerIndex < longer.length && shorterIndex < shorter.length; longerIndex++) {
    if (longer[longerIndex] === shorter[shorterIndex]) {
      shorterIndex++;
    }
  }

  return shorterIndex === shorter.length;
}

function levenshteinDistance(left: string, right: string): number {
  const rows = left.length + 1;
  const columns = right.length + 1;
  const distances = Array.from({ length: rows }, () => Array<number>(columns).fill(0));

  for (let row = 0; row < rows; row++) {
    distances[row][0] = row;
  }

  for (let column = 0; column < columns; column++) {
    distances[0][column] = column;
  }

  for (let row = 1; row < rows; row++) {
    for (let column = 1; column < columns; column++) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;

      distances[row][column] = Math.min(
        distances[row - 1][column] + 1,
        distances[row][column - 1] + 1,
        distances[row - 1][column - 1] + substitutionCost
      );
    }
  }

  return distances[left.length][right.length];
}
