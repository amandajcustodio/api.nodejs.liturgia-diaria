import express from "express";
import { missalleteRoute } from "./missallete.route";

export const routes = (app: express.Express) => {
  app.use(express.json()); // Diz que a API e o front utilizarão arquivos .json
  app.use(
    missalleteRoute
  );
}