-- migrate:up
CREATE TABLE games (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  map_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('in_progress', 'finished', 'aborted')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  finished_at INTEGER,
  winner_player_id TEXT,
  round_count INTEGER NOT NULL,
  schema_version INTEGER NOT NULL,
  state TEXT NOT NULL
) STRICT;

CREATE TABLE game_players (
  game_id TEXT NOT NULL REFERENCES games (id),
  player_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  left_at INTEGER,
  PRIMARY KEY (game_id, player_id)
) STRICT;

CREATE INDEX game_players_by_user ON game_players (user_id);

-- migrate:down
DROP INDEX game_players_by_user;
DROP TABLE game_players;
DROP TABLE games;
