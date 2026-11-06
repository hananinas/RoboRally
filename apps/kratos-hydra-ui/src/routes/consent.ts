// Copyright © 2023 Ory Corp
// SPDX-License-Identifier: Apache-2.0
import {
  defaultConfig,
  logger,
  RouteCreator,
  RouteRegistrator,
  setSession,
} from "../pkg"
import { AcceptOAuth2ConsentRequestSession } from "@ory/client"
import { Request } from "express"

const extractSession = (
  req: Request,
  grantScope: string[],
): AcceptOAuth2ConsentRequestSession => {
  const session: AcceptOAuth2ConsentRequestSession = {
    access_token: {},
    id_token: {},
  }

  const identity = req.session?.identity
  if (!identity) {
    return session
  }

  if (grantScope.includes("email")) {
    const addresses = identity.verifiable_addresses || []
    if (addresses.length > 0) {
      const address = addresses[0]
      if (address.via === "email") {
        session.id_token.email = address.value
        session.id_token.email_verified = address.verified
      }
    }
  }

  if (grantScope.includes("profile")) {
    if (identity.traits.username) {
      session.id_token.preferred_username = identity.traits.username
    }

    if (identity.traits.website) {
      session.id_token.website = identity.traits.website
    }

    if (typeof identity.traits.name === "object") {
      if (identity.traits.name.first) {
        session.id_token.given_name = identity.traits.name.first
      }
      if (identity.traits.name.last) {
        session.id_token.family_name = identity.traits.name.last
      }
    } else if (typeof identity.traits.name === "string") {
      session.id_token.name = identity.traits.name
    }

    if (identity.updated_at) {
      session.id_token.updated_at = parseInt(
        (Date.parse(identity.updated_at) / 1000).toFixed(0),
      )
    }
  }
  return session
}

// Every OAuth2 client registered with Hydra in this project is first-party
// and trusted (skip_consent: true in its Hydra client config), so there is
// no interactive approve/deny screen - consent is always auto-accepted.
// If a request ever arrives that Hydra hasn't marked skippable, we reject it
// rather than silently granting scopes nobody approved.
export const createConsentRoute: RouteCreator =
  (createHelpers) => async (req, res, next) => {
    res.locals.projectName = "Consent"

    const { oauth2, isOAuthConsentRouteEnabled, shouldSkipConsent } =
      createHelpers(req, res)

    if (!isOAuthConsentRouteEnabled()) {
      res.redirect("404")
      return
    }

    const { consent_challenge } = req.query
    const challenge = String(consent_challenge)
    if (!challenge) {
      next(
        new Error("Expected a consent challenge to be set but received none."),
      )
      return
    }

    await oauth2
      .getOAuth2ConsentRequest({ consentChallenge: challenge })
      .then(async ({ data: body }) => {
        if (!shouldSkipConsent(body)) {
          logger.warn(
            "Received a non-skippable consent request; this app has no interactive consent UI, rejecting it.",
          )
          return oauth2
            .rejectOAuth2ConsentRequest({
              consentChallenge: challenge,
              rejectOAuth2Request: {
                error: "consent_required",
                error_description:
                  "This application does not support interactive consent.",
              },
            })
            .then(({ data: body }) => res.redirect(String(body.redirect_to)))
        }

        const grantScope = body.requested_scope || []
        const session = extractSession(req, grantScope)

        return oauth2
          .acceptOAuth2ConsentRequest({
            consentChallenge: challenge,
            acceptOAuth2ConsentRequest: {
              // We can grant all scopes that have been requested - hydra already checked for us that no additional scopes
              // are requested accidentally.
              grant_scope: grantScope,

              // ORY Hydra checks if requested audiences are allowed by the client, so we can simply echo this.
              grant_access_token_audience: body.requested_access_token_audience,

              // The session allows us to set session data for id and access tokens
              session,
            },
          })
          .then(({ data: body }) => {
            logger.debug("Consent request successfully accepted")
            res.redirect(String(body.redirect_to))
          })
      })
      .catch(next)
  }

export const registerConsentRoute: RouteRegistrator = (
  app,
  createHelpers = defaultConfig,
) => {
  app.get(
    "/consent",
    setSession(createHelpers),
    createConsentRoute(createHelpers),
  )
}
