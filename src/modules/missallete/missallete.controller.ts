import { NextFunction, Request, Response } from "express";
import { MissalleteService } from "./missallete.service";

export class MissalleteController {
  public static async getSunday(req: Request, res: Response, next: NextFunction) {
    res.status(200).send(await new MissalleteService().getSunday());
  }

  public static async getTomorrowLiturgy(req: Request, res: Response, next: NextFunction) {
    res.status(200).send(await new MissalleteService().getTomorrowLiturgy());
  }

  public static async getToday(req: Request, res: Response, next: NextFunction) {
    res.status(200).send(await new MissalleteService().getToday());
  }
}