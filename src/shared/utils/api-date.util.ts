// Temporary test override: force API current date to 2026-04-18.
const FIXED_NOW = new Date("2026-04-18T12:00:00-03:00");
export function getApiNow(): Date {
  return new Date(FIXED_NOW);
}
