import { Hono } from "hono";
import { getBanks } from "../monnify/verification";

export const banksRoute = new Hono();

/** Bank picker / code lookup for the run-creation UI. */
banksRoute.get("/", async (c) => {
  const banks = await getBanks();
  return c.json(banks);
});
