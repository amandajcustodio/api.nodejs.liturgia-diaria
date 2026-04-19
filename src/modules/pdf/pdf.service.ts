import { Missallete } from "../../shared/models/base.model";

export class PdfService {
  private static readonly FOLHETO_URL = "https://paroquiasantalucia.com.br/categorias/folheto/";

  public async getToday(): Promise<Missallete | null> {
    const today = new Date();
    const formattedDate = this.formatToDdMmYyyy(today, ".");

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
      date: this.formatToIsoDate(today),
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

  private formatToDdMmYyyy(date: Date, separator: "." | "/"): string {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = String(date.getFullYear());

    return `${day}${separator}${month}${separator}${year}`;
  }

  private formatToIsoDate(date: Date): string {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = String(date.getFullYear());

    return `${year}-${month}-${day}`;
  }
}