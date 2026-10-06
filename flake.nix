{
  description = "Robo Rally workspace";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  inputs.nixvim.url = "github:nix-community/nixvim";
  inputs.pnpm2nix.url = "github:cramt/pnpm2nix";
  inputs.pnpm2nix.inputs.nixpkgs.follows = "nixpkgs";

  outputs = { self, nixpkgs, nixvim, pnpm2nix }:
    let
      supportedSystems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
      ];

      gameId = "00000000-0000-4000-8000-000000000001";

    forAllSystems = nixpkgs.lib.genAttrs supportedSystems;
    in {
      devShells = forAllSystems (system:
        import ./nix/dev {
          pkgs = import nixpkgs { inherit system; };
          inherit nixvim system;
        });
      packages = forAllSystems (system:
        import ./nix/packages {
        pkgs = import nixpkgs { inherit system; };
        inherit gameId;
      });
      checks = forAllSystems (system:
        import ./nix/checks {
          pkgs = import nixpkgs { inherit system; };
          pnpm2nix = pnpm2nix.lib.${system};
          inherit gameId;
        });
    };
}
