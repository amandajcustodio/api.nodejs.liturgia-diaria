import { Router } from "express";
import asyncHandler from "express-async-handler";
import { PushController } from "../modules/push/push.controller";

export const pushRoute = Router();

pushRoute.post("/push/subscribe", asyncHandler(PushController.subscribe));
pushRoute.post("/push/unsubscribe", asyncHandler(PushController.unsubscribe));
