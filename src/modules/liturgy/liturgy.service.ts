import { Missallete } from "../../shared/models/base.model";

export class LiturgyService {
  private static readonly BASE_URL = "https://www.liriocatolico.com.br/liturgia_diaria/dia";

  public async getToday(): Promise<Missallete | null> {
    const today = new Date();
    const liturgyUrl = this.buildLiturgyUrl(today);
    const html = await this.fetchHtml(liturgyUrl);

    if (!html) {
      return null;
    }

    return {
      type: "html",
      date: this.formatToIsoDate(today),
      content: this.sanitizeHtml(html)
    };
  }

  private sanitizeHtml(html: string): string {
    return html
      .replace(/<img\b[^>]*>/gi, "")
      .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1");
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

  private buildLiturgyUrl(date: Date): string {
    const fullYear = String(date.getFullYear());
    const shortYear = fullYear.slice(2);
    const month = date.getMonth() + 1;
    const day = date.getDate();

    return `${LiturgyService.BASE_URL}/${shortYear}/${month}/${day}/`;
  }

  private formatToIsoDate(date: Date): string {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = String(date.getFullYear());

    return `${year}-${month}-${day}`;
  }
}