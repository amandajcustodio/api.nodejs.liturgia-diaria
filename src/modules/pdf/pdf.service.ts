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
import {
  buildDdMmYyVariants,
  extractDateDigitTokens,
  matchesDateFuzzy
} from "../../shared/utils/pdf-date-match.util";

type PdfSource = {
  categoryUrl: string,
  datePattern: "dd.mm.yyyy" | "ddmmyy"
}

type FolhetoListingEntry = {
  url: string,
  title: string
}

export class PdfService {
  private static readonly PDF_SOURCE: PdfSource = {
    categoryUrl: "https://paroquiasaojosebp.com/categorias/folheto-liturgico/",
    datePattern: "ddmmyy"
  };
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
    const source = PdfService.PDF_SOURCE;
    const missallete = await this.getByDatePartsFromSource(date, source);

    if (missallete) {
      return missallete;
    }

    if (this.isSunday(date) && this.isDateWithinDaysFromToday(date, 2)) {
      return this.getSundayFallbackByCategory(date, source);
    }

    return null;
  }

  private async getByDatePartsFromSource(date: DateParts, source: PdfSource): Promise<Missallete | null> {
    const formattedDate = this.formatDateForSource(date, source.datePattern);

    const categoryHtml = await this.fetchHtml(source.categoryUrl, source.categoryUrl);

    if (!categoryHtml) {
      return null;
    }

    const postUrl = this.extractPostUrlByDate(categoryHtml, formattedDate, source.categoryUrl, date);

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

  private async getSundayFallbackByCategory(date: DateParts, source: PdfSource): Promise<Missallete | null> {
    const categoryHtml = await this.fetchHtml(source.categoryUrl, source.categoryUrl);

    if (!categoryHtml) {
      return null;
    }

    const postUrl = this.extractSundayPostUrlFallback(categoryHtml, date, source);

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

  private extractPostUrlByDate(
    html: string,
    formattedDate: string,
    baseUrl: string,
    date: DateParts
  ): string | null {
    const listingMatch = this.findPostUrlInListing(html, formattedDate, baseUrl, date);

    if (listingMatch) {
      return listingMatch;
    }

    const dateVariants = buildDdMmYyVariants(date);

    for (const variant of dateVariants) {
      const dataHrefMatch = new RegExp(`data-href=["']([^"']*${variant}[^"']*)["']`, "i").exec(html);

      if (dataHrefMatch?.[1]) {
        return this.toAbsoluteUrl(dataHrefMatch[1], baseUrl);
      }
    }

    const anchorRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

    let match = anchorRegex.exec(html);

    while (match) {
      const href = match[1] ?? "";
      const anchorText = this.stripTags(match[2] ?? "");
      const combinedText = `${href} ${anchorText}`;

      if (
        dateVariants.some((variant) => combinedText.includes(variant))
        || extractDateDigitTokens(combinedText).some((token) => matchesDateFuzzy(date, token))
      ) {
        return this.toAbsoluteUrl(href, baseUrl);
      }

      match = anchorRegex.exec(html);
    }

    for (const variant of dateVariants) {
      const postUrlMatch = new RegExp(`https?:\\/\\/[^"'\\s>]*${variant}[^"'\\s>]*\\/?`, "i").exec(html);

      if (postUrlMatch?.[0]) {
        return this.toAbsoluteUrl(postUrlMatch[0], baseUrl);
      }
    }

    return null;
  }

  private parseFolhetoListingEntries(html: string, baseUrl: string): FolhetoListingEntry[] {
    const entries: FolhetoListingEntry[] = [];
    const seenUrls = new Set<string>();

    const addEntry = (url: string, title = "") => {
      if (!url || !/folheto/i.test(url)) {
        return;
      }

      const absoluteUrl = this.toAbsoluteUrl(url, baseUrl);

      if (seenUrls.has(absoluteUrl) || absoluteUrl.includes("/categorias/folheto-liturgico")) {
        return;
      }

      seenUrls.add(absoluteUrl);
      entries.push({ url: absoluteUrl, title });
    };

    const jsonLdRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let jsonLdMatch = jsonLdRegex.exec(html);

    while (jsonLdMatch) {
      try {
        const parsed = JSON.parse(jsonLdMatch[1] ?? "") as Record<string, unknown>;
        const graphs = Array.isArray(parsed["@graph"]) ? parsed["@graph"] : [parsed];

        for (const graph of graphs) {
          if (!graph || typeof graph !== "object") {
            continue;
          }

          const mainEntity = (graph as { mainEntity?: { itemListElement?: Array<{ url?: string }> } }).mainEntity;
          const items = mainEntity?.itemListElement;

          if (!Array.isArray(items)) {
            continue;
          }

          for (const item of items) {
            if (typeof item?.url === "string") {
              addEntry(item.url);
            }
          }
        }
      } catch {
        // Ignore invalid JSON-LD blocks.
      }

      jsonLdMatch = jsonLdRegex.exec(html);
    }

    const dataHrefRegex = /data-href=["']([^"']+)["']/gi;
    let dataHrefMatch = dataHrefRegex.exec(html);

    while (dataHrefMatch) {
      addEntry(dataHrefMatch[1] ?? "");
      dataHrefMatch = dataHrefRegex.exec(html);
    }

    const headingRegex = /<h2[^>]*class=["'][^"']*elementor-heading-title[^"']*["'][^>]*>([^<]+)<\/h2>/gi;
    let headingMatch = headingRegex.exec(html);

    while (headingMatch) {
      const title = this.stripTags(headingMatch[1] ?? "");
      const dateMatch = /(\d{5,6})\b/.exec(title);

      if (dateMatch?.[1]) {
        for (const entry of entries) {
          if (entry.url.includes(dateMatch[1]) || entry.title.includes(dateMatch[1])) {
            entry.title = title;
          }
        }
      }

      headingMatch = headingRegex.exec(html);
    }

    return entries;
  }

  private findPostUrlInListing(
    html: string,
    formattedDate: string,
    baseUrl: string,
    date: DateParts
  ): string | null {
    const normalizedDate = formattedDate.toLowerCase();
    const dateVariants = buildDdMmYyVariants(date).map((variant) => variant.toLowerCase());

    for (const entry of this.parseFolhetoListingEntries(html, baseUrl)) {
      const combinedText = `${entry.title} ${entry.url}`;
      const normalized = this.normalizeText(combinedText);

      const hasExactMatch = entry.url.includes(formattedDate)
        || normalized.includes(normalizedDate)
        || dateVariants.some((variant) => entry.url.includes(variant) || normalized.includes(variant));

      if (hasExactMatch) {
        return entry.url;
      }

      const dateTokens = extractDateDigitTokens(combinedText);

      if (dateTokens.some((token) => matchesDateFuzzy(date, token))) {
        return entry.url;
      }
    }

    return null;
  }

  private extractSundayPostUrlFallback(html: string, date: DateParts, source: PdfSource): string | null {
    const dateVariants = buildDdMmYyVariants(date).map((variant) => variant.toLowerCase());
    const sundayCandidates: string[] = [];

    for (const entry of this.parseFolhetoListingEntries(html, source.categoryUrl)) {
      const combinedText = `${entry.title} ${entry.url}`;
      const normalized = this.normalizeText(combinedText);

      if (!normalized.includes("folheto") || !normalized.includes("domingo")) {
        continue;
      }

      const hasExactDateMatch = dateVariants.some((variant) => normalized.includes(variant));

      if (hasExactDateMatch) {
        return entry.url;
      }

      const hasFuzzyDateMatch = extractDateDigitTokens(combinedText).some((token) => matchesDateFuzzy(date, token));

      if (hasFuzzyDateMatch) {
        return entry.url;
      }

      sundayCandidates.push(entry.url);
    }

    return sundayCandidates[0] ?? null;
  }

  private extractFirstPdfUrl(html: string, baseUrl: string): string | null {
    const normalizedHtml = html.replace(/\\\//g, "/");
    const pdfAttributeMatchers = [
      /["']source["']\s*:\s*["']([^"']+\.pdf(?:\?[^"']*)?)["']/i,
      /href=["']([^"']+\.pdf(?:\?[^"']*)?)["']/i
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

  private decodeJsStringEscapes(value: string): string {
    return value
      .replace(/\\\//g, "/")
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\\\/g, "\\");
  }

  private toAbsoluteUrl(url: string, baseUrl: string): string {
    return new URL(this.decodeJsStringEscapes(url), baseUrl).toString();
  }

  private normalizeText(value: string): string {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  private isSunday(date: DateParts): boolean {
    return getWeekday(date) === 0;
  }

  private isDateWithinDaysFromToday(date: DateParts, maxDaysDistance: number): boolean {
    const today = getApiTodayDateParts();
    const currentDate = Date.UTC(today.year, today.month - 1, today.day);
    const targetDate = Date.UTC(date.year, date.month - 1, date.day);
    const dayDifference = Math.floor((targetDate - currentDate) / (24 * 60 * 60 * 1000));

    return dayDifference >= 0 && dayDifference <= maxDaysDistance;
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