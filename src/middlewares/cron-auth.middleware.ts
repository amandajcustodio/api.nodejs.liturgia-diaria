import { NextFunction, Request, Response } from "express";

export function cronAuth(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    if (process.env.VERCEL) {
      res.status(503).json({ error: "CRON_SECRET não configurado." });
      return;
    }

    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${secret}`) {
    res.status(401).json({ error: "Não autorizado." });
    return;
  }

  next();
}
