// Copyright © 2022 Ory Corp
// SPDX-License-Identifier: Apache-2.0
import { defaultConfig, RouteRegistrator } from "../pkg"
import sdk from "../pkg/sdk"
import {
  defaultLightTheme,
  RegisterOryElementsExpress,
} from "@ory/elements-markup"
import express from "express"

export const registerStaticRoutes: RouteRegistrator = (
  app,
  createHelpers = defaultConfig,
) => {
  RegisterOryElementsExpress(app, defaultLightTheme, createHelpers)
  const themePath = require.resolve("@robo-rally/theme/tokens.css")
  app.get("/assets/roborally-theme.css", (_req, res) => {
    res.sendFile(themePath)
  })
  const boardBackgroundPath = require.resolve(
    "@robo-rally/theme/board-background.css",
  )
  app.get("/assets/roborally-board-background.css", (_req, res) => {
    res.sendFile(boardBackgroundPath)
  })
  app.use("/", express.static(`${__dirname}/../../public`))
  app.use("/.well-known/ory/webauthn.js", (req, res) => {
    res.contentType("text/javascript")
    sdk.frontend.getWebAuthnJavaScript().then(({ data }) => {
      res.send(data)
    })
  })
  app.use(
    "/",
    express.static(`${__dirname}/../../node_modules/@ory/elements-markup/dist/`),
  )
}
