{ pkgs }:

let
  client = import ./client.nix {
    inherit pkgs;
  };

  game-service = import ./game-service.nix {
    inherit pkgs;
  };

  kratos-hydra-ui = import ./kratos-hydra-ui.nix {
    inherit pkgs;
  };
in {
  inherit client game-service kratos-hydra-ui;

  production = import ./production.nix {
    inherit pkgs client game-service kratos-hydra-ui;
  };

  build-production = import ./build-production.nix {
    inherit pkgs;
  };
}
