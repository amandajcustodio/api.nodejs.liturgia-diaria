import { Missallete, MissalleteResponse } from "../../shared/models/base.model";
import { NotFoundError } from "../../errors/not-found.error";
import { PdfService } from "../pdf/pdf.service";
import { LiturgyService } from "../liturgy/liturgy.service";
import { MeditationService } from "../meditation/meditation.service";
import { addDays, DateParts, formatIsoDate, getApiTodayDateParts, getWeekday } from "../../shared/utils/api-date.util";

export class MissalleteService {
  public async getSunday(): Promise<MissalleteResponse> {
    const sundayPdfMissallete = await new PdfService().getNextSunday();

    if (sundayPdfMissallete) {
      return sundayPdfMissallete;
    }

    throw new NotFoundError("Folheto de domingo ainda nao disponivel.");
  }

  public async getTomorrowLiturgy(): Promise<MissalleteResponse> {
    const tomorrow = addDays(getApiTodayDateParts(), 1);
    const tomorrowIsoDate = formatIsoDate(tomorrow);
    const tomorrowLiturgy = await new LiturgyService().getByIsoDate(tomorrowIsoDate);

    if (tomorrowLiturgy) {
      return this.attachMeditation(tomorrowLiturgy);
    }

    throw new NotFoundError("Liturgia de domingo ainda nao disponivel.");
  }

  public async getToday(): Promise<MissalleteResponse> {
    const today = getApiTodayDateParts();
    const liturgyService = new LiturgyService();

    if (this.isSaturday(today)) {
      const saturdayChoices = await this.getSaturdayChoices(today);

      if (saturdayChoices) {
        return this.attachMeditationToResponse(saturdayChoices);
      }
    }

    if (this.isSunday(today)) {
      return this.attachMeditation(await this.getSundayToday(today));
    }

    const pdfMissallete = await new PdfService().getToday();

    if (pdfMissallete) {
      return this.attachMeditation(pdfMissallete);
    }

    const liturgyMissallete = await liturgyService.getToday();

    if (liturgyMissallete) {
      return this.attachMeditation(liturgyMissallete);
    }

    const recentLiturgy = await this.getRecentAvailableLiturgy(today, liturgyService);

    if (recentLiturgy) {
      return this.attachMeditation(recentLiturgy);
    }

    throw new NotFoundError("Nao foi possivel encontrar folheto em PDF ou liturgia do dia.");
  }

  private async attachMeditation(missallete: Missallete): Promise<Missallete> {
    const meditation = await new MeditationService().getByIsoDate(missallete.date);

    return {
      ...missallete,
      meditation
    };
  }

  private async attachMeditationToResponse(response: MissalleteResponse): Promise<MissalleteResponse> {
    if (!response.choices?.length) {
      return this.attachMeditation(response);
    }

    const choices = await Promise.all(
      response.choices.map(async (choice) => ({
        ...choice,
        missallete: await this.attachMeditation(choice.missallete)
      }))
    );

    const primaryChoice = choices.find((choice) => choice.id === "saturday") ?? choices[0];

    return {
      ...response,
      choices,
      meditation: primaryChoice?.missallete.meditation ?? null
    };
  }

  private async getRecentAvailableLiturgy(today: DateParts, liturgyService: LiturgyService): Promise<MissalleteResponse | null> {
    const fallbackOffsets = [-1, -2, -3, -4, -5, -6, -7, 1];

    for (const offset of fallbackOffsets) {
      const targetDate = addDays(today, offset);
      const targetIsoDate = formatIsoDate(targetDate);
      const missallete = await liturgyService.getByIsoDate(targetIsoDate);

      if (missallete) {
        return missallete;
      }
    }

    return null;
  }

  private async getSundayToday(today: DateParts): Promise<MissalleteResponse> {
    const todayIsoDate = formatIsoDate(today);
    const pdfService = new PdfService();
    const [pdfMissallete, htmlMissallete] = await Promise.all([
      pdfService.getToday(),
      new LiturgyService().getByIsoDate(todayIsoDate)
    ]);

    if (pdfMissallete) {
      return { ...pdfMissallete, metadata: pdfMissallete.metadata ?? htmlMissallete?.metadata };
    }

    const sundayPdfMissallete = await pdfService.getNextSunday();

    if (sundayPdfMissallete) {
      return { ...sundayPdfMissallete, metadata: sundayPdfMissallete.metadata ?? htmlMissallete?.metadata };
    }

    throw new NotFoundError("Folheto de domingo ainda nao disponivel.");
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