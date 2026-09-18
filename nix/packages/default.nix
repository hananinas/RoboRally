{ pkgs, gameId ? "" }:

let
  client = import ./client.nix {
    inherit pkgs gameId;
  };

  game-service = import ./game-service.nix {
    inherit pkgs;
  };
in {
  inherit client game-service;

  production = import ./production.nix {
    inherit pkgs client game-service;
  };
}
