import express from "express";
import cors from "cors";
import { routes } from "./routes/index"
import { pageNotFoundHandler } from "./middlewares/page-not-found.middleware";
import { errorHandler } from "./middlewares/error-handler.middleware";
import { initializeApp } from "firebase-admin/app";

initializeApp();
const app = express();

app.use(cors());

routes(app);
pageNotFoundHandler(app);
errorHandler(app);

app.listen(3000);