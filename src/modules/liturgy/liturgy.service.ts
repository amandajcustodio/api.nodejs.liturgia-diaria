import { Missallete, LiturgyMetadata } from "../../shared/models/base.model";
import { addDays, DateParts, formatIsoDate, getApiTodayDateParts } from "../../shared/utils/api-date.util";

export class LiturgyService {
  private static readonly BASE_URL = "https://www.liriocatolico.com.br/liturgia_diaria/dia";

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
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "text/html,application/xhtml+xml"
        }
      });

      if (!response.ok) {
        return null;
      }

      return response.text();
    } catch {
      return null;
    }
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
    return /liturgia\s+di[aá]ria/i.test(html);
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