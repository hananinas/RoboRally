import { useState } from 'react'
import type { VoteProposal } from '@robo-rally/game-events'

export default function DisconnectVote({ proposal, username, disabled, vote }: {
  proposal: VoteProposal
  username: string
  disabled: boolean
  vote: (proposalId: string) => Promise<boolean>
}) {
  const [status, setStatus] = useState<'idle' | 'pending' | 'accepted' | 'error'>('idle')

  async function castVote() {
    setStatus('pending')
    setStatus(await vote(proposal.proposalId) ? 'accepted' : 'error')
  }

  return (
    <div className="disconnect-vote">
      <span aria-live="polite">
        {username} · {proposal.votesCast} of {proposal.votesRequired} {proposal.votesRequired === 1 ? 'vote' : 'votes'} needed
      </span>
      <button type="button" disabled={disabled || status === 'pending' || status === 'accepted'} onClick={castVote}>
        {status === 'accepted' ? 'Voted' : status === 'pending' ? 'Voting…' : `Vote to kick ${username}`}
      </button>
      {status === 'error' && <span role="alert">Could not confirm your vote. Try again.</span>}
    </div>
  )
}
