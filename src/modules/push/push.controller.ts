import { NextFunction, Request, Response } from "express";
import { PushSubscription } from "web-push";
import { PushService } from "./push.service";

export class PushController {
  public static async subscribe(req: Request, res: Response, next: NextFunction): Promise<void> {
    const subscription = req.body as PushSubscription;

    if (
      !subscription?.endpoint ||
      typeof subscription.endpoint !== "string" ||
      !subscription?.keys?.auth ||
      !subscription?.keys?.p256dh
    ) {
      res.status(400).json({ error: "Objeto de inscrição inválido." });
      return;
    }

    await new PushService().saveSubscription(subscription);
    res.status(201).json({ message: "Inscrito com sucesso." });
  }

  public static async unsubscribe(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { endpoint } = req.body as { endpoint?: unknown };

    if (!endpoint || typeof endpoint !== "string") {
      res.status(400).json({ error: "O campo endpoint é obrigatório." });
      return;
    }

    await new PushService().removeSubscription(endpoint);
    res.status(200).json({ message: "Inscrição cancelada com sucesso." });
  }
}
