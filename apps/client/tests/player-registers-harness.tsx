import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import OtherPlayersPanel from '../src/scenes/active-game/components/OtherPlayersPanel.tsx'
import { executionAction, executionPlayers, programmingPlayers, REGISTER_ROBOT_IDS } from './player-registers-fixtures.ts'

const executing = new URLSearchParams(location.search).get('phase') === 'execution'
const colours = ['#f07b72', '#69bce9', '#d9bc78']
const players = (executing ? executionPlayers : programmingPlayers).map((player, index) => ({
  ...player, robotId: REGISTER_ROBOT_IDS[index], colour: colours[index],
}))

function RegisterHarness() {
  useEffect(() => {
    if (new URLSearchParams(location.search).has('inspect')) {
      document.querySelector<HTMLButtonElement>('.other-player')?.focus()
    }
  }, [])
  return (
    <OtherPlayersPanel
      players={players}
      checkpointCount={2}
      phase={executing ? 'EXECUTING' : 'PROGRAMMING'}
      activeAction={executing ? executionAction : null}
      queuedActions={[]}
      paused={false}
    />
  )
}

createRoot(document.getElementById('root')!).render(<RegisterHarness />)
