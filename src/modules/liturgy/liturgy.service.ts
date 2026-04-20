import { Missallete, LiturgyMetadata } from "../../shared/models/base.model";
import { addDays, DateParts, formatIsoDate, getApiTodayDateParts } from "../../shared/utils/api-date.util";

export class LiturgyService {
  private static readonly BASE_URL = "https://www.liriocatolico.com.br/liturgia_diaria/dia";
  private static readonly REQUEST_TIMEOUT_MS = 12000;

  public async getToday(): Promise<Missallete | null> {
    const baseDate = getApiTodayDateParts();
    const fallbackOffsets = [0, -1, 1];

    for (const offset of fallbackOffsets) {
      const date = addDays(baseDate, offset);
      const missallete = await this.getByDateParts(date);

      if (missallete) {
        return missallete;
      }
    }

    return null;
  }

  public async getByIsoDate(isoDate: string): Promise<Missallete | null> {
    const [yearRaw, monthRaw, dayRaw] = isoDate.split("-");
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    const day = Number(dayRaw);

    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
      return null;
    }

    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return null;
    }

    return this.getByDateParts({ year, month, day });
  }

  private stripTags(value: string): string {
    return value
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private capitalizeFirst(value: string): string {
    if (!value) {
      return value;
    }

    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  }

  private extractLiturgyData(html: string): { content: string, metadata: LiturgyMetadata } {
    const seasonMatch = html.match(/<div\b[^>]*class="liturgy-title"[^>]*>([\s\S]*?)<\/div>/i);
    const season = seasonMatch ? this.stripTags(seasonMatch[1]).trim() || null : null;

    const colorMatch = html.match(/class="header[^"]*header-color-([a-zA-Z\u00C0-\u017E]+)/i);
    const color = colorMatch ? this.capitalizeFirst(colorMatch[1].trim()) : null;

    const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
    let content = mainMatch ? mainMatch[1] : html;

    content = content
      .replace(/<img\b[^>]*>/gi, "")
      .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1");

    return { content, metadata: { season, color } };
  }

  private async fetchHtml(url: string): Promise<string | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, LiturgyService.REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
          Referer: "https://www.liriocatolico.com.br/",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
        }
      });

      if (!response.ok) {
        this.logExternalFetchIssue("non-ok-status", url, response.status);
        return null;
      }

      const html = await response.text();

      if (this.looksLikeBlockedPage(html)) {
        this.logExternalFetchIssue("blocked-page", url, response.status);
        return null;
      }

      return html;
    } catch (_error) {
      this.logExternalFetchIssue("fetch-error", url);
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private looksLikeBlockedPage(html: string): boolean {
    return /access denied|forbidden|cloudflare|captcha|robot|security check/i.test(html);
  }

  private logExternalFetchIssue(reason: string, url: string, status?: number): void {
    if (process.env.DEBUG_EXTERNAL_FETCH !== "true") {
      return;
    }

    const statusLabel = status ? ` status=${status}` : "";
    console.warn(`[LiturgyService] ${reason}${statusLabel} url=${url}`);
  }

  private async getByDateParts(date: DateParts): Promise<Missallete | null> {
    const html = await this.fetchFirstAvailableHtml(date);

    if (!html) {
      return null;
    }

    const { content, metadata } = this.extractLiturgyData(html);

    return {
      type: "html",
      date: formatIsoDate(date),
      content,
      metadata
    };
  }

  private async fetchFirstAvailableHtml(date: DateParts): Promise<string | null> {
    const urls = this.buildLiturgyUrls(date);

    for (const url of urls) {
      const html = await this.fetchHtml(url);

      if (html && this.isValidLiturgyHtml(html)) {
        return html;
      }
    }

    return null;
  }

  private isValidLiturgyHtml(html: string): boolean {
    if (/class="liturgy-title"/i.test(html)) {
      return true;
    }

    const hasMainContent = /<main\b[^>]*>[\s\S]*<\/main>/i.test(html);
    const hasReadings = /primeira\s+leitura|salmo\s+responsorial|evangelho/i.test(html);

    return hasMainContent && hasReadings;
  }

  private buildLiturgyUrls(date: DateParts): string[] {
    const fullYear = String(date.year);
    const shortYear = fullYear.slice(2);
    const month = String(date.month);
    const day = String(date.day);
    const paddedMonth = month.padStart(2, "0");
    const paddedDay = day.padStart(2, "0");

    const candidates = [
      `${LiturgyService.BASE_URL}/${shortYear}/${month}/${day}/`,
      `${LiturgyService.BASE_URL}/${shortYear}/${paddedMonth}/${paddedDay}/`
    ];

    return [...new Set(candidates)];
  }

}