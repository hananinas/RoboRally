import express, { type Express } from 'express'

export function createAuthApp(): Express {
  return express()
}
