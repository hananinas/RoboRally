{ pkgs }:

let
  client = import ./client.nix {
    inherit pkgs;
  };

  game-service = import ./game-service.nix {
    inherit pkgs;
  };
in {
  inherit client game-service;

  production = import ./production.nix {
    inherit pkgs client game-service;
  };

  build-production = import ./build-production.nix {
    inherit pkgs;
  };
}
