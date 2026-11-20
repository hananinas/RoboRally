import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import BoardViewport from './BoardViewport.tsx'
import { DEMO_BOARD, DEMO_ROBOTS } from '../board/demoBoard.ts'

describe('BoardViewport robot sprites', () => {
  it('renders the selected fork-clamp asset layers on the game board', () => {
    const forkClamp = { ...DEMO_ROBOTS[1]!, robotSpriteId: 'fork-clamp', angle: 0 }
    const markup = renderToStaticMarkup(<BoardViewport board={DEMO_BOARD} robots={[forkClamp]} />)

    expect(markup).toContain('data-robot-sprite-id="fork-clamp"')
    expect(markup).toContain('viewBox="0 0 84 84"')
    expect(markup).toContain('d="M-15 15 C-31 10 -32 -12 -21 -26')
  })

  it('renders tank asset layers inline for players who keep the default sprite', () => {
    const tank = { ...DEMO_ROBOTS[0]!, angle: 0 }
    const markup = renderToStaticMarkup(<BoardViewport board={DEMO_BOARD} robots={[tank]} />)

    expect(markup.match(/data-robot-sprite-id="tank"/g)).toHaveLength(8)
    expect(markup).toMatch(/<svg[^>]*data-robot-sprite-id="tank"[^>]*>[\s\S]*?<rect x="5.5901" y="27.0000" width="14.1890"/)
  })
})
