import { Session } from "@ory/client"

declare global {
  namespace Express {
    interface Request {
      session?: Session
      csrfToken?: (overwrite?: boolean) => string
    }
  }
}
