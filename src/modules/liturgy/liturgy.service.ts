import { Missallete, LiturgyMetadata } from "../../shared/models/base.model";
import { addDays, DateParts, formatIsoDate, getApiTodayDateParts } from "../../shared/utils/api-date.util";
import {
  buildWordOfLordResponse,
  enrichPprLiturgyWithLirio,
  formatReadingBodyHtml,
  normalizeGospelProclamation,
  sanitizeLirioMainContent
} from "../../shared/utils/reading-html.util";

export class LiturgyService {
  private static readonly LIRIO_BASE_URL = "https://www.liriocatolico.com.br/liturgia_diaria/dia";
  private static readonly PADRE_PAULO_RICARDO_BASE_URL = "https://padrepauloricardo.org/liturgia";
  private static readonly REQUEST_TIMEOUT_MS = process.env.VERCEL ? 12000 : 12000;

  public async getToday(): Promise<Missallete | null> {
    const baseDate = getApiTodayDateParts();
    const fallbackOffsets = [0, -1, 1];
    const missalettes = await Promise.all(
      fallbackOffsets.map((offset) => this.getByDateParts(addDays(baseDate, offset)))
    );

    return missalettes.find((missallete) => missallete !== null) ?? null;
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

  private mapPadrePauloRicardoColor(color: string): string {
    const normalized = color.trim().toLowerCase();
    const colorMap: Record<string, string> = {
      green: "Verde",
      white: "Branco",
      red: "Vermelho",
      purple: "Roxo",
      rose: "Rosa"
    };

    return colorMap[normalized] ?? this.capitalizeFirst(color);
  }

  private sanitizeReadingHtml(html: string, readingType = ""): string {
    return formatReadingBodyHtml(html, readingType);
  }

  private parsePprReadingHeader(blockHtml: string): { subtitle: string; reference: string } {
    const titleHtml =
      blockHtml.match(/<div class="reading-title"[^>]*>([\s\S]*?)<\/div>/i)?.[1]
      ?? blockHtml.match(/<div class="reading-refrain"[^>]*>([\s\S]*?)<\/div>/i)?.[1]
      ?? "";

    const referenceMatch = titleHtml.match(/<span class="reading-reference"[^>]*>([\s\S]*?)<\/span>/i);
    const reference = referenceMatch ? this.stripTags(referenceMatch[1]) : "";
    const subtitle = this.stripTags(titleHtml.replace(/<span class="reading-reference"[\s\S]*$/i, ""));

    return { subtitle, reference };
  }

  private extractReadingBodyFromBlock(blockHtml: string): string {
    const openMatch = blockHtml.match(/<div class="reading-body[^"]*"[^>]*>/i);

    if (!openMatch || openMatch.index === undefined) {
      return "";
    }

    const afterOpen = blockHtml.slice(openMatch.index + openMatch[0].length);
    const closedMatch = afterOpen.match(/^([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i);

    if (closedMatch?.[1]) {
      return closedMatch[1];
    }

    return afterOpen.replace(/<\/div>[\s\S]*$/i, "").trim();
  }

  private buildReadingArticle(type: string, subtitle: string, reference: string, body: string): string {
    const isGospel = /evangelho/i.test(type);
    const isFirstReading = /primeira\s+leitura/i.test(type);
    const articleClass = isGospel ? "reading gospel-section" : "reading";

    let headerExtra = "";

    if (isGospel) {
      const proclamation = [subtitle, reference].filter(Boolean).join(" — ");

      if (proclamation) {
        headerExtra = `<cite class="reading-reference">${normalizeGospelProclamation(proclamation)}</cite>`;
      }
    } else if (subtitle) {
      headerExtra = `<p class="reading-subtitle">${subtitle}</p>`;

      if (reference) {
        headerExtra += `\n          <cite class="reading-reference">${reference}</cite>`;
      }
    } else if (reference) {
      headerExtra = `<cite class="reading-reference">${reference}</cite>`;
    }

    let readingBody = body;

    if (isFirstReading) {
      readingBody = `${body}\n${buildWordOfLordResponse("reading")}`;
    } else if (isGospel) {
      readingBody = `${body}\n${buildWordOfLordResponse("gospel")}`;
    }

    return `
      <article class="${articleClass}">
        <header>
          <h3 class="reading-title">${type}</h3>
          ${headerExtra}
        </header>
        <div class="reading-content">${readingBody}</div>
      </article>
    `;
  }

  private extractLiturgyDataFromLirio(html: string): { content: string, metadata: LiturgyMetadata } {
    const seasonMatch = html.match(/<div\b[^>]*class="liturgy-title"[^>]*>([\s\S]*?)<\/div>/i);
    const season = seasonMatch ? this.stripTags(seasonMatch[1]).trim() || null : null;

    const colorMatch = html.match(/class="header[^"]*header-color-([a-zA-Z\u00C0-\u017E]+)/i);
    const color = colorMatch ? this.capitalizeFirst(colorMatch[1].trim()) : null;

    const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
    let content = mainMatch ? mainMatch[1] : html;

    content = sanitizeLirioMainContent(content);

    return { content, metadata: { season, color } };
  }

  private extractLiturgyDataFromPadrePauloRicardo(html: string): { content: string, metadata: LiturgyMetadata } | null {
    const seasonMatch = html.match(/<div class="liturgy-title"[^>]*>([^<]+)<\/div>/i);
    const season = seasonMatch ? this.stripTags(seasonMatch[1]).trim() || null : null;

    const colorMatch = html.match(/class="liturgy-color\s+(\w+)"/i);
    const color = colorMatch ? this.mapPadrePauloRicardoColor(colorMatch[1]) : null;

    const readingBlocks: string[] = [];
    const accordionRegex = /<div class="reading-accordion"[^>]*data-reading-index="\d+"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/gi;
    let match = accordionRegex.exec(html);

    while (match) {
      const blockHtml = match[1] ?? "";
      const typeMatch = blockHtml.match(/<div class="reading-type">([^<]+)<\/div>/i);

      if (!typeMatch?.[1]) {
        match = accordionRegex.exec(html);
        continue;
      }

      const type = this.stripTags(typeMatch[1]);

      if (/medita/i.test(type)) {
        match = accordionRegex.exec(html);
        continue;
      }

      const { subtitle, reference } = this.parsePprReadingHeader(blockHtml);
      const body = this.sanitizeReadingHtml(this.extractReadingBodyFromBlock(blockHtml), type);

      if (!body.trim()) {
        match = accordionRegex.exec(html);
        continue;
      }

      readingBlocks.push(this.buildReadingArticle(type, subtitle, reference, body));

      match = accordionRegex.exec(html);
    }

    if (!readingBlocks.length) {
      const fallbackRegex = /<div class="reading-type">([^<]+)<\/div>[\s\S]*?<div class="reading-body[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
      let fallbackMatch = fallbackRegex.exec(html);

      while (fallbackMatch) {
        const type = this.stripTags(fallbackMatch[1] ?? "");

        if (/medita/i.test(type)) {
          fallbackMatch = fallbackRegex.exec(html);
          continue;
        }

        const { subtitle, reference } = this.parsePprReadingHeader(fallbackMatch[0] ?? "");
        const body = this.sanitizeReadingHtml(fallbackMatch[2] ?? "", type);
        readingBlocks.push(this.buildReadingArticle(type, subtitle, reference, body));
        fallbackMatch = fallbackRegex.exec(html);
      }
    }

    if (!readingBlocks.length) {
      return null;
    }

    return {
      content: readingBlocks.join("\n"),
      metadata: { season, color }
    };
  }

  private async fetchHtml(url: string, refererUrl: string, options: { minimalHeaders?: boolean } = {}): Promise<string | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, LiturgyService.REQUEST_TIMEOUT_MS);

    const headers: Record<string, string> = options.minimalHeaders
      ? {
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9",
          Referer: refererUrl,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
        }
      : {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
          Referer: refererUrl,
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Upgrade-Insecure-Requests": "1",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
        };

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers
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
    const challengePage = /cf-browser-verification|challenge-platform|just a moment|verify you are human|attention required/i.test(html);
    const accessDenied = /access denied|forbidden|security check/i.test(html);

    if (!challengePage && !accessDenied) {
      return false;
    }

    const hasLiturgyMarkers = /class="liturgy-title"|primeira\s+leitura|salmo\s+responsorial|evangelho|reading-type|gon\.episode/i.test(html);

    return !hasLiturgyMarkers;
  }

  private logExternalFetchIssue(reason: string, url: string, status?: number): void {
    if (process.env.DEBUG_EXTERNAL_FETCH !== "true") {
      return;
    }

    const statusLabel = status ? ` status=${status}` : "";
    console.warn(`[LiturgyService] ${reason}${statusLabel} url=${url}`);
  }

  private async getByDateParts(date: DateParts): Promise<Missallete | null> {
    const [lirioHtml, pprMissallete] = await Promise.all([
      this.fetchLirioHtmlRobust(date),
      this.getByDatePartsFromPadrePauloRicardo(date)
    ]);

    if (lirioHtml && this.isValidLirioLiturgyHtml(lirioHtml)) {
      const { content, metadata } = this.extractLiturgyDataFromLirio(lirioHtml);

      return {
        type: "html",
        date: formatIsoDate(date),
        content,
        metadata: metadata.season || metadata.color ? metadata : pprMissallete?.metadata ?? metadata
      };
    }

    if (pprMissallete) {
      const content = lirioHtml
        ? enrichPprLiturgyWithLirio(pprMissallete.content, lirioHtml)
        : pprMissallete.content;

      return {
        ...pprMissallete,
        content
      };
    }

    return null;
  }

  private async getByDatePartsFromPadrePauloRicardo(date: DateParts): Promise<Missallete | null> {
    const url = this.buildPadrePauloRicardoUrl(date);
    const html = await this.fetchHtml(url, "https://padrepauloricardo.org/");

    if (!html) {
      return null;
    }

    const extracted = this.extractLiturgyDataFromPadrePauloRicardo(html);

    if (!extracted) {
      return null;
    }

    return {
      type: "html",
      date: formatIsoDate(date),
      content: extracted.content,
      metadata: extracted.metadata
    };
  }

  private async fetchLirioHtmlRobust(date: DateParts): Promise<string | null> {
    const urls = this.buildLirioUrls(date);
    const headerProfiles: Array<{ minimalHeaders?: boolean; referer?: string }> = [
      { minimalHeaders: true },
      { minimalHeaders: false },
      { minimalHeaders: true, referer: "https://www.liriocatolico.com.br/liturgia_diaria/" }
    ];

    for (const url of urls) {
      for (const profile of headerProfiles) {
        const html = await this.fetchHtml(
          url,
          profile.referer ?? "https://www.liriocatolico.com.br/",
          { minimalHeaders: profile.minimalHeaders }
        );

        if (html && (this.hasLirioReadingStructure(html) || this.isValidLirioLiturgyHtml(html))) {
          return html;
        }
      }
    }

    return null;
  }

  private hasLirioReadingStructure(html: string): boolean {
    if (/Página Não Encontrada|404/i.test(html) && !/<main\b/i.test(html)) {
      return false;
    }

    return /reading-subtitle|alleluia-section|gospel-section|primeira\s+leitura/i.test(html)
      && /<main\b[^>]*>[\s\S]*<\/main>/i.test(html);
  }

  private isValidLirioLiturgyHtml(html: string): boolean {
    if (/class="liturgy-title"/i.test(html)) {
      return true;
    }

    const hasMainContent = /<main\b[^>]*>[\s\S]*<\/main>/i.test(html);
    const hasReadings = /primeira\s+leitura|salmo\s+responsorial|evangelho/i.test(html);

    return hasMainContent && hasReadings;
  }

  private buildLirioUrls(date: DateParts): string[] {
    const fullYear = String(date.year);
    const shortYear = fullYear.slice(2);
    const month = String(date.month);
    const day = String(date.day);
    const paddedMonth = month.padStart(2, "0");
    const paddedDay = day.padStart(2, "0");

    const candidates = [
      `${LiturgyService.LIRIO_BASE_URL}/${shortYear}/${month}/${day}/`,
      `${LiturgyService.LIRIO_BASE_URL}/${shortYear}/${paddedMonth}/${paddedDay}/`,
      `${LiturgyService.LIRIO_BASE_URL}/${shortYear}/${paddedMonth}/${day}/`,
      `${LiturgyService.LIRIO_BASE_URL}/${shortYear}/${month}/${paddedDay}/`
    ];

    return [...new Set(candidates)];
  }

  private buildPadrePauloRicardoUrl(date: DateParts): string {
    const day = String(date.day).padStart(2, "0");
    const month = String(date.month).padStart(2, "0");

    return `${LiturgyService.PADRE_PAULO_RICARDO_BASE_URL}/${day}-${month}-${date.year}`;
  }
}
