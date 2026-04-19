import { Router } from "express";
import asyncHandler from "express-async-handler";
import { MissalleteController } from "../modules/missallete/missallete.controller";

export const missalleteRoute = Router();

missalleteRoute.get("/missallete/today", asyncHandler(MissalleteController.getToday));