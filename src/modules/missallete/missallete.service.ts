import { Missallete } from "../../shared/models/base.model";
import { NotFoundError } from "../../errors/not-found.error";
import { PdfService } from "../pdf/pdf.service";
import { LiturgyService } from "../liturgy/liturgy.service";

export class MissalleteService {
  public async getToday(): Promise<Missallete> {
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
}