// Copyright © 2022 Ory Corp
// SPDX-License-Identifier: Apache-2.0
import { RouteRegistrator } from "../pkg"
import { RequestHandler } from "express"

const alive: RequestHandler = (_, res) => {
  res.send("ok")
}

const ready: RequestHandler = (_, res) => {
  res.send("ok")
}

export const registerHealthRoute: RouteRegistrator = (app) => {
  app.get("/health/alive", alive)
  app.get("/health/ready", ready)
}
