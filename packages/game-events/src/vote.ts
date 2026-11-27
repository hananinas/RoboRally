import { z } from 'zod'
import type { GameId, PlayerId } from './payloads.js'

export const voteSchema = z.strictObject({ proposalId: z.uuid() }).readonly()
export type Vote = z.infer<typeof voteSchema>

export type VoteProposal = Readonly<{
  proposalId: string
  action: Readonly<{ kind: 'KICK_DISCONNECTED_PLAYER'; targetPlayerId: PlayerId }>
  votesCast: number
  votesRequired: number
}>

export type VotesChanged = Readonly<{
  gameId: GameId
  proposals: readonly VoteProposal[]
}>

export type VoteResult = Readonly<{
  outcome: 'ACCEPTED' | 'PROPOSAL_CLOSED' | 'NOT_A_MEMBER' | 'INVALID_REQUEST' | 'INTERNAL_ERROR'
}>
