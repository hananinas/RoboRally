import type { RobotDefinition } from '@robo-rally/game-events'

function icon(markup: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">${markup}</svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`
}

export const robotCatalog = [
  {
    id: 'tank',
    name: 'Tank',
    icon: icon('<g fill="#53616c" stroke="#202a32" stroke-width="4" stroke-linejoin="round"><path d="M17 25h15v50H17zM68 25h15v50H68z"/><path d="M27 29h46v42H27z"/><path d="M42 17h16v16H42zM49 10h8v20h-8z"/></g><path d="M37 39h26v22H37z" fill="#9bb0bd"/>'),
    defaultForLobbyCreation: true,
  },
  {
    id: 'scout',
    name: 'Scout',
    icon: icon('<path d="m50 7 39 75H11z" fill="#526d80" stroke="#202a32" stroke-width="5" stroke-linejoin="round"/><path d="m50 28 17 34H33z" fill="#b9c9d2"/>'),
    defaultForLobbyCreation: false,
  },
  {
    id: 'guardian',
    name: 'Guardian',
    icon: icon('<path d="M50 7 85 21v27c0 23-15 37-35 45C30 85 15 71 15 48V21z" fill="#526d80" stroke="#202a32" stroke-width="5" stroke-linejoin="round"/><path d="M50 27v45M29 49h42" stroke="#b9c9d2" stroke-width="9"/>'),
    defaultForLobbyCreation: false,
  },
  {
    id: 'rover',
    name: 'Rover',
    icon: icon('<rect x="17" y="24" width="66" height="52" rx="18" fill="#526d80" stroke="#202a32" stroke-width="5"/><circle cx="27" cy="78" r="9" fill="#202a32"/><circle cx="73" cy="78" r="9" fill="#202a32"/><path d="M50 31 66 50 50 68 34 50z" fill="#b9c9d2"/>'),
    defaultForLobbyCreation: false,
  },
  {
    id: 'striker',
    name: 'Striker',
    icon: icon('<path d="m50 5 42 45-42 45L8 50z" fill="#526d80" stroke="#202a32" stroke-width="5" stroke-linejoin="round"/><path d="m50 25 23 25-23 25-23-25z" fill="#b9c9d2"/><circle cx="50" cy="50" r="8" fill="#526d80"/>'),
    defaultForLobbyCreation: false,
  },
  {
    id: 'sentinel',
    name: 'Sentinel',
    icon: icon('<circle cx="50" cy="50" r="41" fill="#526d80" stroke="#202a32" stroke-width="5"/><circle cx="50" cy="50" r="20" fill="#b9c9d2"/><circle cx="50" cy="50" r="8" fill="#526d80"/>'),
    defaultForLobbyCreation: false,
  },
  {
    id: 'hauler',
    name: 'Hauler',
    icon: icon('<path d="M18 20h48v54H18z" fill="#526d80" stroke="#202a32" stroke-width="5"/><path d="M66 38h14l10 15v21H66z" fill="#879ba7" stroke="#202a32" stroke-width="5" stroke-linejoin="round"/><circle cx="32" cy="78" r="9" fill="#202a32"/><circle cx="75" cy="78" r="9" fill="#202a32"/><path d="M30 33h24v13H30z" fill="#b9c9d2"/>'),
    defaultForLobbyCreation: false,
  },
] as const satisfies readonly RobotDefinition[]

const robotsById = new Map<string, RobotDefinition>(
  robotCatalog.map((robot): [string, RobotDefinition] => [robot.id, robot]),
)
const defaultRobot = robotCatalog.find((robot) => robot.defaultForLobbyCreation)

if (!defaultRobot) throw new Error('No default robot is configured for lobby creation')

export const DEFAULT_ROBOT_ID = defaultRobot.id

export function findRobotDefinition(id: string): RobotDefinition | undefined {
  return robotsById.get(id)
}
