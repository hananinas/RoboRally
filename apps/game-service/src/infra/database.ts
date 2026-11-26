import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export const DATABASE_FILE_NAME = 'robo-rally.db'

export function openDatabase(dataDir: string): DatabaseSync {
  return new DatabaseSync(resolve(dataDir, DATABASE_FILE_NAME), { timeout: 5000 })
}
