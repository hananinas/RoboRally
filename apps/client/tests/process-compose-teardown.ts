import { execFileSync } from 'node:child_process'

export default async function globalTeardown() {
  try {
    execFileSync('process-compose', ['down'], { stdio: 'inherit' })
  } catch (error) {
    console.warn('process-compose down failed (it may have already stopped):', error)
  }
}
