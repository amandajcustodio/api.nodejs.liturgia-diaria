import { Missallete } from "../../shared/models/base.model";
import {
  addDays,
  API_TIMEZONE,
  DateParts,
  formatIsoDate,
  getApiTodayDateParts,
  getDatePartsInTimeZone,
  getWeekday
} from "../../shared/utils/api-date.util";

export class PdfService {
  private static readonly FOLHETO_URL = "https://paroquiasantalucia.com.br/categorias/folheto/";
  private static readonly REQUEST_TIMEOUT_MS = 12000;

  public async getToday(): Promise<Missallete | null> {
    return this.getByDateParts(getApiTodayDateParts());
  }

  public async getNextSunday(): Promise<Missallete | null> {
    const today = getApiTodayDateParts();
    const dayOfWeek = getWeekday(today);
    const daysUntilSunday = (7 - dayOfWeek) % 7;
    return this.getByDateParts(addDays(today, daysUntilSunday));
  }

  public async getByDate(date: Date): Promise<Missallete | null> {
    return this.getByDateParts(getDatePartsInTimeZone(new Date(date), API_TIMEZONE));
  }

  public async getByDateParts(date: DateParts): Promise<Missallete | null> {
    const formattedDate = this.formatToDdMmYyyy(date, ".");

    const categoryHtml = await this.fetchHtml(PdfService.FOLHETO_URL);

    if (!categoryHtml) {
      return null;
    }

    const postUrl = this.extractPostUrlByDate(categoryHtml, formattedDate);

    if (!postUrl) {
      return null;
    }

    const postHtml = await this.fetchHtml(postUrl);

    if (!postHtml) {
      return null;
    }

    const pdfUrl = this.extractFirstPdfUrl(postHtml);

    if (!pdfUrl) {
      return null;
    }

    return {
      type: "pdf",
      date: formatIsoDate(date),
      content: pdfUrl
    };
  }

  private async fetchHtml(url: string): Promise<string | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, PdfService.REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
          Referer: PdfService.FOLHETO_URL,
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
    return /access denied|forbidden|cloudflare|captcha|security check|attention required|verify you are human/i.test(html);
  }

  private logExternalFetchIssue(reason: string, url: string, status?: number): void {
    if (process.env.DEBUG_EXTERNAL_FETCH !== "true") {
      return;
    }

    const statusLabel = status ? ` status=${status}` : "";
    console.warn(`[PdfService] ${reason}${statusLabel} url=${url}`);
  }

  private extractPostUrlByDate(html: string, formattedDate: string): string | null {
    const anchorRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

    let match = anchorRegex.exec(html);

    while (match) {
      const href = match[1] ?? "";
      const anchorText = this.stripTags(match[2] ?? "");

      if (anchorText.includes(formattedDate)) {
        return this.toAbsoluteUrl(href, PdfService.FOLHETO_URL);
      }

      match = anchorRegex.exec(html);
    }

    return null;
  }

  private extractFirstPdfUrl(html: string): string | null {
    const pdfRegex = /href=["']([^"']+\.pdf(?:\?[^"']*)?)["']/i;
    const match = pdfRegex.exec(html);

    if (!match || !match[1]) {
      return null;
    }

    return this.toAbsoluteUrl(match[1], PdfService.FOLHETO_URL);
  }

  private stripTags(value: string): string {
    return value
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private toAbsoluteUrl(url: string, baseUrl: string): string {
    return new URL(url, baseUrl).toString();
  }

  private formatToDdMmYyyy(date: DateParts, separator: "." | "/"): string {
    const day = String(date.day).padStart(2, "0");
    const month = String(date.month).padStart(2, "0");
    const year = String(date.year);

    return `${day}${separator}${month}${separator}${year}`;
  }
}