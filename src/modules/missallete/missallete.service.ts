import { MissalleteResponse } from "../../shared/models/base.model";
import { NotFoundError } from "../../errors/not-found.error";
import { PdfService } from "../pdf/pdf.service";
import { LiturgyService } from "../liturgy/liturgy.service";
import { getApiNow } from "../../shared/utils/api-date.util";

type DateParts = {
  year: number,
  month: number,
  day: number
}

export class MissalleteService {
  private static readonly SOURCE_TIMEZONE = "America/Sao_Paulo";

  public async getSunday(): Promise<MissalleteResponse> {
    const sundayPdfMissallete = await new PdfService().getNextSunday();

    if (sundayPdfMissallete) {
      return sundayPdfMissallete;
    }

    throw new NotFoundError("Folheto de domingo ainda nao disponivel.");
  }

  public async getToday(): Promise<MissalleteResponse> {
    const today = this.getCurrentDateInTimeZone(MissalleteService.SOURCE_TIMEZONE);

    if (this.isSaturday(today)) {
      const saturdayChoices = await this.getSaturdayChoices(today);

      if (saturdayChoices) {
        return saturdayChoices;
      }
    }

    if (this.isSunday(today)) {
      return this.getSundayToday(today);
    }

    const pdfMissallete = await new PdfService().getToday();

    if (pdfMissallete) {
      return pdfMissallete;
    }

    const liturgyMissallete = await new LiturgyService().getToday();

    if (liturgyMissallete) {
      return liturgyMissallete;
    }

    throw new NotFoundError("Nao foi possivel encontrar folheto em PDF ou liturgia do dia.");
  }

  private async getSundayToday(today: DateParts): Promise<MissalleteResponse> {
    const todayIsoDate = this.formatToIsoDate(today);
    const [pdfMissallete, htmlMissallete] = await Promise.all([
      new PdfService().getToday(),
      new LiturgyService().getByIsoDate(todayIsoDate)
    ]);

    if (pdfMissallete) {
      return { ...pdfMissallete, metadata: pdfMissallete.metadata ?? htmlMissallete?.metadata };
    }

    if (htmlMissallete) {
      return htmlMissallete;
    }

    throw new NotFoundError("Nao foi possivel encontrar folheto em PDF ou liturgia do dia.");
  }

  private async getSaturdayChoices(saturday: DateParts): Promise<MissalleteResponse | null> {
    const liturgyService = new LiturgyService();
    const pdfService = new PdfService();
    const saturdayIsoDate = this.formatToIsoDate(saturday);
    const sundayDateParts = this.addDays(saturday, 1);
    const sundayIsoDate = this.formatToIsoDate(sundayDateParts);
    const sundayNativeDate = new Date(sundayDateParts.year, sundayDateParts.month - 1, sundayDateParts.day);

    const [saturdayMissallete, sundayPdfMissallete, sundayHtmlMissallete] = await Promise.all([
      liturgyService.getByIsoDate(saturdayIsoDate),
      pdfService.getByDate(sundayNativeDate),
      liturgyService.getByIsoDate(sundayIsoDate)
    ]);

    const sundayMissallete = sundayPdfMissallete
      ? { ...sundayPdfMissallete, metadata: sundayPdfMissallete.metadata ?? sundayHtmlMissallete?.metadata }
      : sundayHtmlMissallete;

    if (saturdayMissallete && sundayMissallete) {
      return {
        ...saturdayMissallete,
        choices: [
          {
            id: "saturday",
            missallete: saturdayMissallete
          },
          {
            id: "sunday",
            missallete: sundayMissallete
          }
        ]
      };
    }

    return saturdayMissallete ?? sundayMissallete;
  }

  private isSaturday(date: DateParts): boolean {
    const utcDate = new Date(Date.UTC(date.year, date.month - 1, date.day));
    return utcDate.getUTCDay() === 6;
  }

  private isSunday(date: DateParts): boolean {
    const utcDate = new Date(Date.UTC(date.year, date.month - 1, date.day));
    return utcDate.getUTCDay() === 0;
  }

  private getCurrentDateInTimeZone(timeZone: string): DateParts {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });

    const parts = formatter.formatToParts(getApiNow());
    const year = Number(parts.find((part) => part.type === "year")?.value);
    const month = Number(parts.find((part) => part.type === "month")?.value);
    const day = Number(parts.find((part) => part.type === "day")?.value);

    return { year, month, day };
  }

  private addDays(date: DateParts, amount: number): DateParts {
    const utcDate = new Date(Date.UTC(date.year, date.month - 1, date.day));
    utcDate.setUTCDate(utcDate.getUTCDate() + amount);

    return {
      year: utcDate.getUTCFullYear(),
      month: utcDate.getUTCMonth() + 1,
      day: utcDate.getUTCDate()
    };
  }

  private formatToIsoDate(date: DateParts): string {
    const day = String(date.day).padStart(2, "0");
    const month = String(date.month).padStart(2, "0");
    const year = String(date.year);

    return `${year}-${month}-${day}`;
  }
}