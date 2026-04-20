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
    try {
      const response = await fetch(url);

      if (!response.ok) {
        return null;
      }

      return response.text();
    } catch {
      return null;
    }
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