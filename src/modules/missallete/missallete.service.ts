import { MissalleteResponse } from "../../shared/models/base.model";
import { NotFoundError } from "../../errors/not-found.error";
import { PdfService } from "../pdf/pdf.service";
import { LiturgyService } from "../liturgy/liturgy.service";
import { addDays, DateParts, formatIsoDate, getApiTodayDateParts, getWeekday } from "../../shared/utils/api-date.util";

export class MissalleteService {
  public async getSunday(): Promise<MissalleteResponse> {
    const sundayPdfMissallete = await new PdfService().getNextSunday();

    if (sundayPdfMissallete) {
      return sundayPdfMissallete;
    }

    throw new NotFoundError("Folheto de domingo ainda nao disponivel.");
  }

  public async getToday(): Promise<MissalleteResponse> {
    const today = getApiTodayDateParts();

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
    const todayIsoDate = formatIsoDate(today);
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
    const saturdayIsoDate = formatIsoDate(saturday);
    const sundayDateParts = addDays(saturday, 1);
    const sundayIsoDate = formatIsoDate(sundayDateParts);

    const [saturdayMissallete, sundayPdfMissallete, sundayHtmlMissallete] = await Promise.all([
      liturgyService.getByIsoDate(saturdayIsoDate),
      pdfService.getByDateParts(sundayDateParts),
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
    return getWeekday(date) === 6;
  }

  private isSunday(date: DateParts): boolean {
    return getWeekday(date) === 0;
  }
}