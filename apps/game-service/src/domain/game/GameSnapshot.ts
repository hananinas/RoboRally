import type { Instruction, Orientation, RobotSpriteId } from '@robo-rally/game-events'
import type { Card } from '@/domain/game/Card'
import type { CardId, PlayerId, RobotId } from '@/domain/game/ids'

export type CardSnapshot = Readonly<{
  id: CardId
  instruction: Instruction
}>

export function cardSnapshot(card: Card): CardSnapshot {
  return { id: card.id, instruction: card.instruction }
}

export type DeckSnapshot = Readonly<{
  drawPile: readonly CardSnapshot[]
  discardPile: readonly CardSnapshot[]
}>

export type PlayerSnapshot = Readonly<{
  playerId: PlayerId
  robotId: RobotId
  robotColour: string
  robotSpriteId: RobotSpriteId
  position: Readonly<{ x: number; y: number }>
  orientation: Orientation
  lastCheckpoint: number
  hand: readonly CardSnapshot[]
  deck: DeckSnapshot
}>

export type GameSnapshot = Readonly<{
  completedRounds: number
  players: readonly PlayerSnapshot[]
}>
