{
  description = "Robo Rally workspace";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  inputs.nixvim.url = "github:nix-community/nixvim";

  outputs = { self, nixpkgs, nixvim }:
    let
      supportedSystems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
      ];

      forAllSystems = nixpkgs.lib.genAttrs supportedSystems;
    in {
      devShells = forAllSystems (system:
        import ./nix/dev {
          pkgs = import nixpkgs { inherit system; };
          inherit nixvim system;
        });
    };
}
