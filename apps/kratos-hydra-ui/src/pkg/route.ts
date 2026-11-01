// Copyright © 2022 Ory Corp
// SPDX-License-Identifier: Apache-2.0
import {
  FrontendApi,
  IdentityApi,
  OAuth2Api,
  OAuth2LogoutRequest,
} from "@ory/client"
import { Theme } from "@ory/elements-markup"
import { Request, RequestHandler, Response, Router } from "express"

export interface RouteOptions {
  frontend: FrontendApi
  oauth2: OAuth2Api
  identity: IdentityApi
  apiBaseUrl: string
  kratosBrowserUrl: string

  // When this returns true, the logout screen will not be shown.
  shouldSkipLogoutConsent: (challenge: OAuth2LogoutRequest) => boolean

  logoUrl?: string
  faviconUrl?: string
  faviconType?: string
  theme?: Theme
  extraPartials?: {
    login: () => string
    registration: () => string
  }
}

export type RouteOptionsCreator = (req: Request, res: Response) => RouteOptions

export type RouteCreator = (opts: RouteOptionsCreator) => RequestHandler

export type RouteRegistrator = (
  router: Router,
  createHelpers?: RouteOptionsCreator,
  route?: string,
) => void
