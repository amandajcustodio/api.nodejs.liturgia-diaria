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

type PdfSource = {
  categoryUrl: string,
  datePattern: "dd.mm.yyyy" | "ddmmyy"
}

export class PdfService {
  private static readonly PDF_SOURCES: PdfSource[] = [
    {
      categoryUrl: "https://paroquiasantalucia.com.br/categorias/folheto/",
      datePattern: "dd.mm.yyyy"
    },
    {
      categoryUrl: "https://paroquiasaojosebp.com/categorias/folheto-liturgico/",
      datePattern: "ddmmyy"
    }
  ];
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
    for (const source of PdfService.PDF_SOURCES) {
      const missallete = await this.getByDatePartsFromSource(date, source);

      if (missallete) {
        return missallete;
      }
    }

    return null;
  }

  private async getByDatePartsFromSource(date: DateParts, source: PdfSource): Promise<Missallete | null> {
    const formattedDate = this.formatDateForSource(date, source.datePattern);

    const categoryHtml = await this.fetchHtml(source.categoryUrl, source.categoryUrl);

    if (!categoryHtml) {
      return null;
    }

    const postUrl = this.extractPostUrlByDate(categoryHtml, formattedDate, source.categoryUrl);

    if (!postUrl) {
      return null;
    }

    const postHtml = await this.fetchHtml(postUrl, source.categoryUrl);

    if (!postHtml) {
      return null;
    }

    const pdfUrl = this.extractFirstPdfUrl(postHtml, source.categoryUrl);

    if (!pdfUrl) {
      return null;
    }

    return {
      type: "pdf",
      date: formatIsoDate(date),
      content: pdfUrl
    };
  }

  private async fetchHtml(url: string, refererUrl: string): Promise<string | null> {
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
          Referer: refererUrl,
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
    const blockedSignals = /access denied|forbidden|cloudflare|security check|attention required|verify you are human|captcha/i;

    if (!blockedSignals.test(html)) {
      return false;
    }

    // Some valid WordPress pages include "captcha" in scripts/settings.
    // Treat as blocked only when known content markers are missing.
    const hasExpectedContent = /wp-content|<article|class="entry|folheto|\.pdf|\d{2}[\.\/-]\d{2}[\.\/-]\d{4}/i.test(html);

    return !hasExpectedContent;
  }

  private logExternalFetchIssue(reason: string, url: string, status?: number): void {
    if (process.env.DEBUG_EXTERNAL_FETCH !== "true") {
      return;
    }

    const statusLabel = status ? ` status=${status}` : "";
    console.warn(`[PdfService] ${reason}${statusLabel} url=${url}`);
  }

  private extractPostUrlByDate(html: string, formattedDate: string, baseUrl: string): string | null {
    const dataHrefMatch = new RegExp(`data-href=["']([^"']*${formattedDate}[^"']*)["']`, "i").exec(html);

    if (dataHrefMatch?.[1]) {
      return this.toAbsoluteUrl(dataHrefMatch[1], baseUrl);
    }

    const anchorRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

    let match = anchorRegex.exec(html);

    while (match) {
      const href = match[1] ?? "";
      const anchorText = this.stripTags(match[2] ?? "");

      if (href.includes(formattedDate) || anchorText.includes(formattedDate)) {
        return this.toAbsoluteUrl(href, baseUrl);
      }

      match = anchorRegex.exec(html);
    }

    const postUrlMatch = new RegExp(`https?:\\/\\/[^"'\\s>]*${formattedDate}[^"'\\s>]*\\/?`, "i").exec(html);

    if (postUrlMatch?.[0]) {
      return this.toAbsoluteUrl(postUrlMatch[0], baseUrl);
    }

    return null;
  }

  private extractFirstPdfUrl(html: string, baseUrl: string): string | null {
    const normalizedHtml = html.replace(/\\\//g, "/");
    const pdfAttributeMatchers = [
      /href=["']([^"']+\.pdf(?:\?[^"']*)?)["']/i,
      /["']source["']\s*:\s*["']([^"']+\.pdf(?:\?[^"']*)?)["']/i
    ];

    for (const matcher of pdfAttributeMatchers) {
      const match = matcher.exec(normalizedHtml);

      if (match?.[1]) {
        return this.toAbsoluteUrl(match[1], baseUrl);
      }
    }

    return null;
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

  private formatDateForSource(date: DateParts, datePattern: PdfSource["datePattern"]): string {
    const day = String(date.day).padStart(2, "0");
    const month = String(date.month).padStart(2, "0");
    const year = String(date.year);

    if (datePattern === "dd.mm.yyyy") {
      return `${day}.${month}.${year}`;
    }

    const shortYear = String(date.year % 100).padStart(2, "0");

    return `${day}${month}${shortYear}`;
  }
}