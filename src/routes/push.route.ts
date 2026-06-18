import { Router } from "express";
import asyncHandler from "express-async-handler";
import { cronAuth } from "../middlewares/cron-auth.middleware";
import { PushController } from "../modules/push/push.controller";

export const pushRoute = Router();

pushRoute.post("/push/subscribe", asyncHandler(PushController.subscribe));
pushRoute.post("/push/unsubscribe", asyncHandler(PushController.unsubscribe));
pushRoute.post("/push/mark-seen", asyncHandler(PushController.markSeen));
pushRoute.get("/cron/push-booklet-check", cronAuth, asyncHandler(PushController.cronBookletCheck));
pushRoute.get("/cron/push-booklet-reminder", cronAuth, asyncHandler(PushController.cronBookletReminder));
