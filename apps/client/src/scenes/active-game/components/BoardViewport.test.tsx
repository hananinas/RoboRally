import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import BoardViewport from './BoardViewport.tsx'
import { DEMO_BOARD, DEMO_ROBOTS } from '../board/demoBoard.ts'

describe('BoardViewport robot sprites', () => {
  it('renders the server-selected robot model on the game board', () => {
    const scout = { ...DEMO_ROBOTS[1]!, angle: 0 }
    const markup = renderToStaticMarkup(<BoardViewport board={DEMO_BOARD} robots={[scout]} />)

    expect(markup).toContain('data-robot-sprite-id="scout"')
    expect(markup).toContain('viewBox="0 0 100 100"')
    expect(markup).toContain('d="M50 8 88 30v40L50 92 12 70V30z"')
  })

  it('retains the layered tank model for players who keep the default sprite', () => {
    const tank = { ...DEMO_ROBOTS[0]!, angle: 0 }
    const markup = renderToStaticMarkup(<BoardViewport board={DEMO_BOARD} robots={[tank]} />)

    expect(markup.match(/data-robot-sprite-id="tank"/g)).toHaveLength(8)
    expect(markup).toContain('<use href="#testTank1"')
  })
})
