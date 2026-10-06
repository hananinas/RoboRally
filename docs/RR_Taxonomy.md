Robo Rally - Noun and Verb Taxonomy

# Purpose

This document collects the important domain nouns and verbs in Robo Rally. Highlighted the terms that should appear in the first UML domain model for our V1 Release. The classification column helps distinguish likely classes from attributes, value types, services, and user-interface concepts.

# Core domain nouns

| **Term**         | **Classification**    | **Meaning**                           | **Possible data association(s)**               |
| ---------------- | --------------------- | ------------------------------------- | ---------------------------------------------- |
| Game             | Entity                | A complete match                      | status, current round, winner                  |
| Player           | External actor        | A person participating                | name, priority order                           |
| Robot            | Core entity           | The piece controlled by a player      | position, direction, state                     |
| Racing course    | Core entity           | Configured race environment           | difficulty, boards, checkpoints, special rules |
| Gameboard        | Spatial entity        | One factory-floor board section       | identifier, side, orientation                  |
| Start board      | Spatial entity        | Board on which robots start           | starting spaces                                |
| Space            | Spatial entity        | One square on a board                 | coordinate, occupant, board element            |
| Position         | Value object          | A robot or element location           | board and coordinates                          |
| Direction        | Enum or value type    | Orientation of a robot or element     | north, east, south, west                       |
| Round            | Process entity        | One complete game cycle               | number and current phase                       |
| Phase            | Enum or state         | A major portion of a round            | upgrade, programming, activation               |
| Robot program    | Entity                | Five ordered instructions for a round | registers 1 to 5                               |
| Register         | Ordered entity        | One program position                  | number and programmed card                     |
| Priority         | Derived concept       | Order in which players act            | calculated from robot positions                |
| Priority antenna | Board entity          | Reference used to determine priority  | position and facing                            |
| Checkpoint       | Board entity          | A required race destination           | sequence number, position                      |
| Checkpoint token | Tracking concept      | Evidence of completed checkpoint      | checkpoint number                              |
| Reboot token     | Board entity          | Return location for rebooting robots  | position, direction, queue                     |
| Energy cube      | Resource              | Currency for upgrades and effects     | owner or location                              |
| Energy bank      | Repository            | Common energy supply                  | available quantity                             |
| Timer            | Rule mechanism        | Programming time limit                | duration and running state                     |
| Winner           | Role or derived value | First player to finish the course     | associated player                              |

# Board element nouns

| **Term**               | **Classification**  | **Responsibility**                              |
| ---------------------- | ------------------- | ----------------------------------------------- |
| Board element          | Abstract superclass | Something on the game board that affects play   |
| Conveyor belt          | Subtype             | Moves a robot in its arrow direction            |
| Rotating conveyor belt | Subtype             | Moves and sometimes rotates a robot             |
| Push panel             | Subtype             | Pushes a robot in specified registers           |
| Gear                   | Subtype             | Rotates a robot 90 degrees                      |
| Board laser            | Subtype             | Shoots the first visible robot in its path      |
| Robot laser            | Robot component     | Shoots forward from a robot                     |
| Pit                    | Subtype             | Causes a robot to fall then reboot              |
| Energy space           | Subtype             | Supplies an energy cube under stated conditions |
| Checkpoint             | Subtype             | Records race progress when reached in order     |
| Wall                   | Boundary entity     | Blocks movement, pushing and laser fire         |
| Empty space            | Space state         | A space with no special effect                  |

# Card nouns

| **Term**                 | **Classification**  | **Meaning**                                   |
| ------------------------ | ------------------- | --------------------------------------------- |
| Card                     | Abstract superclass | Common card identity and effect               |
| Programming card         | Card subtype        | Instruction assigned to a register            |
| Move card                | Programming subtype | Move 1, Move 2 or Move 3                      |
| Turn card                | Programming subtype | Turn Left, Turn Right or U-Turn               |
| Back Up card             | Programming subtype | Moves one space backward                      |
| Power Up card            | Programming subtype | Gains one energy cube                         |
| Again card               | Programming subtype | Repeats the previous register                 |
| Special programming card | Card subtype        | Extra reusable programming routine            |
| Damage card              | Card subtype        | Adds an unwanted effect to a programming deck |
| SPAM                     | Damage type         | Replaced by a random drawn programming card   |
| Worm                     | Damage type         | Immediately reboots the robot                 |
| Virus                    | Damage type         | Gives Virus cards to nearby robots            |
| Trojan Horse             | Damage type         | Gives two SPAM cards                          |
| Upgrade card             | Card subtype        | Changes robot behaviour                       |
| Permanent upgrade        | Upgrade type        | Remains installed after purchase              |
| Temporary upgrade        | Upgrade type        | Used once and removed from play               |

# Collections and supporting nouns

| **Term**          | **Classification**       | **Meaning**                                       |
| ----------------- | ------------------------ | ------------------------------------------------- |
| Player mat        | Interface or aggregate   | Displays registers, upgrades, cards and energy    |
| Programming deck  | Collection               | Cards available to be drawn                       |
| Draw pile         | Collection               | Ordered cards waiting to be drawn                 |
| Discard pile      | Collection               | Used cards waiting to be reshuffled               |
| Hand              | Collection               | Cards currently available to a player             |
| Damage card pile  | Collection               | Supply for one damage type                        |
| Upgrade deck      | Collection               | Cards available to the shop                       |
| Upgrade shop      | Entity or collection     | Face-up upgrades available for purchase           |
| Upgrade slot      | Constraint or UI concept | Location for an installed permanent upgrade       |
| Energy reserve    | Resource collection      | Energy cubes owned by a player                    |
| Line of sight     | Calculated value         | Unblocked path between a laser and target         |
| Activation order  | Ordered value            | Fixed sequence for resolving elements             |
| Priority order    | Ordered value            | Current ordered list of players                   |
| Course difficulty | Enum                     | Starter, beginner, intermediate or advanced level |
| Special rule      | Rule or strategy         | Course-specific modification to core rules        |

# Game lifecycle verbs

- create game
- choose racing course
- add player
- choose robot
- set up course
- place board elements
- shuffle decks
- place robots
- start game
- start round
- advance phase
- end round
- check win condition
- declare winner
- end game

# Priority verbs

- determine priority
- calculate distance from antenna
- compare robot positions
- resolve a priority tie
- order players
- give priority
- override priority
- take a turn

# Upgrade phase verbs

- refresh upgrade shop
- remove unsold upgrades
- draw upgrade
- inspect upgrade
- purchase upgrade
- pay energy
- install permanent upgrade
- store temporary upgrade
- discard owned upgrade
- activate upgrade
- apply upgrade effect
- remove temporary upgrade

# Programming phase verbs

- draw programming cards
- replenish deck
- shuffle discard pile
- inspect hand
- select card
- program robot
- assign card to register
- arrange program
- lock program
- discard unused cards
- start timer
- run out of time
- randomly fill unfinished registers
- reveal programming

# Activation phase verbs

- reveal register
- determine activation order
- activate register
- execute programming card
- carry out action
- activate board elements
- fire board lasers
- fire robot lasers
- collect energy
- complete checkpoint
- proceed to next register
- discard executed cards
- cancel remaining programming

# Movement and interaction verbs

- move forward/backward
- enter/leave space
- rotate left/ right
- make a U-turn
- face a direction
- stop movement
- block movement
- pass over a space
- land on a space
- occupy a space
- move off the board
- fall into a pit
- collide
- push robot
- push a chain of robots
- bump into robot
- shoot robot
- hit robot
- attack robot
- pull robot
- swap positions
- teleport
- receive damage

# Board element verbs

| **Element**       | **Important verbs**                                                      |
| ----------------- | ------------------------------------------------------------------------ |
| Conveyor belt     | activate, move, rotate, stop at blocked space                            |
| Push panel        | check register number, activate, push                                    |
| Gear              | activate, rotate                                                         |
| Laser             | establish line of sight, trace path, block, fire, hit, deal damage       |
| Energy space      | check for cube, collect cube, become empty, supply fifth-register energy |
| Checkpoint        | verify order, complete, record progress, check final checkpoint          |
| Pit or board edge | fall, leave board, trigger reboot                                        |

# Damage and reboot verbs

- deal damage
- receive damage
- draw damage card
- add damage card to discard pile
- program damage card
- execute damage effect
- replace damage card with a random card
- return damage card to its supply
- infect nearby robot
- permanently remove damage card
- trigger reboot
- take two SPAM cards
- cancel programming
- discard remaining registers
- discard hand
- locate reboot token
- queue rebooting robots
- place robot on reboot token
- choose a new direction
- resume in the next round

**Source:** Robo Rally Game Guide (<http://media.wizards.com/2017/rules/roborally_rules.pdf>)