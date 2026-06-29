import { MeditationContent } from "../../shared/models/base.model";
import { DateParts, formatIsoDate } from "../../shared/utils/api-date.util";

export class MeditationService {
  private static readonly BASE_URL = "https://padrepauloricardo.org/liturgia";
  private static readonly REQUEST_TIMEOUT_MS = process.env.VERCEL ? 8000 : 12000;

  public async getByIsoDate(isoDate: string): Promise<MeditationContent | null> {
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

  public async getByDateParts(date: DateParts): Promise<MeditationContent | null> {
    const sourceUrl = this.buildMeditationUrl(date);
    const html = await this.fetchHtml(sourceUrl);

    if (!html) {
      return null;
    }

    const extracted = this.extractMeditationFromHtml(html);

    if (!extracted) {
      return null;
    }

    return {
      title: extracted.title,
      content: extracted.content,
      sourceUrl,
      date: formatIsoDate(date)
    };
  }

  private buildMeditationUrl(date: DateParts): string {
    const day = String(date.day).padStart(2, "0");
    const month = String(date.month).padStart(2, "0");

    return `${MeditationService.BASE_URL}/${day}-${month}-${date.year}`;
  }

  private async fetchHtml(url: string): Promise<string | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, MeditationService.REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
          Referer: "https://padrepauloricardo.org/",
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
    const challengePage = /cf-browser-verification|challenge-platform|just a moment|verify you are human|attention required/i.test(html);
    const accessDenied = /access denied|forbidden|security check/i.test(html);

    if (!challengePage && !accessDenied) {
      return false;
    }

    const hasMeditationMarkers = /gon\.episode|"text":|<div class="reading-body meditation"/i.test(html);

    return !hasMeditationMarkers;
  }

  private logExternalFetchIssue(reason: string, url: string, status?: number): void {
    if (process.env.DEBUG_EXTERNAL_FETCH !== "true") {
      return;
    }

    const statusLabel = status ? ` status=${status}` : "";
    console.warn(`[MeditationService] ${reason}${statusLabel} url=${url}`);
  }

  private extractMeditationFromHtml(html: string): { title: string | null, content: string } | null {
    const episode = this.parseGonEpisode(html);

    if (episode?.text) {
      return {
        title: typeof episode.name === "string" ? episode.name.trim() || null : null,
        content: this.sanitizeMeditationHtml(episode.text)
      };
    }

    const meditationMatch = html.match(/<div class="reading-body meditation"[^>]*>([\s\S]*?)<\/div>/i);

    if (!meditationMatch?.[1]) {
      return null;
    }

    const titleMatch = html.match(/<div class="reading-type">Meditação<\/div>\s*<div class="reading-title">([^<]+)<\/div>/i);

    return {
      title: titleMatch?.[1]?.trim() || null,
      content: this.sanitizeMeditationHtml(meditationMatch[1])
    };
  }

  private parseGonEpisode(html: string): { name?: string, text?: string } | null {
    const marker = "gon.episode=";
    const start = html.indexOf(marker);

    if (start === -1) {
      return null;
    }

    let index = start + marker.length;

    while (html[index] === " " || html[index] === "\n" || html[index] === "\r" || html[index] === "\t") {
      index += 1;
    }

    if (html[index] !== "{") {
      return null;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let cursor = index; cursor < html.length; cursor += 1) {
      const char = html[cursor];

      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }

        if (char === "\\") {
          escaped = true;
          continue;
        }

        if (char === "\"") {
          inString = false;
        }

        continue;
      }

      if (char === "\"") {
        inString = true;
        continue;
      }

      if (char === "{") {
        depth += 1;
        continue;
      }

      if (char === "}") {
        depth -= 1;

        if (depth === 0) {
          try {
            return JSON.parse(html.slice(index, cursor + 1)) as { name?: string, text?: string };
          } catch {
            return null;
          }
        }
      }
    }

    return null;
  }

  private stripRepeatedGospelFromMeditation(html: string): string {
    return html
      .replace(/<blockquote\b[^>]*>[\s\S]*?<\/blockquote>/i, "")
      .replace(
        /^<p\b[^>]*>[\s\S]*?Evangelho\s+de\s+(?:Nosso\s+Senhor\s+)?Jesus\s+Cristo[\s\S]*?<\/p>/i,
        ""
      )
      .replace(/^(?:\s*<p>\s*<\/p>\s*)+/i, "")
      .trim();
  }

  private sanitizeMeditationHtml(html: string): string {
    const cleaned = html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<a\b[^>]*>/gi, "")
      .replace(/<\/a>/gi, "")
      .replace(/\sstyle="[^"]*"/gi, "")
      .trim();

    return this.stripRepeatedGospelFromMeditation(cleaned);
  }
}
