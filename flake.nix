{
  description = "AsyncAPI documentation development environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };

      cliVersion = "6.0.2";

      asyncapi = pkgs.writeShellScriptBin "asyncapi" ''
        exec ${pkgs.nodejs_24}/bin/npm exec \
          --yes \
          --package=@asyncapi/cli@${cliVersion} \
          -- asyncapi "$@"
      '';

      studio = pkgs.writeShellScriptBin "asyncapi-studio" ''
        exec ${asyncapi}/bin/asyncapi start studio "$@"
      '';

      preview = pkgs.writeShellScriptBin "asyncapi-preview" ''
        exec ${asyncapi}/bin/asyncapi start preview "$@"
      '';

      docs = pkgs.writeShellScriptBin "asyncapi-docs" ''
        if [ "$#" -lt 1 ]; then
          echo "Usage: asyncapi-docs <asyncapi.yaml> [output-dir]" >&2
          exit 1
        fi

        spec="$1"
        output="''${2:-./docs}"

        exec ${asyncapi}/bin/asyncapi generate fromTemplate \
          "$spec" \
          @asyncapi/html-template@3.5.0 \
          --output "$output" \
          --force-write
      '';
    in {
      devShells.${system}.default = pkgs.mkShell {
        packages = [
          pkgs.nodejs_24
          asyncapi
          studio
          preview
          docs
        ];

        shellHook = ''
          echo "AsyncAPI development environment"
          echo ""
          echo "  asyncapi-studio asyncapi.yaml   Edit in browser"
          echo "  asyncapi-preview asyncapi.yaml  Read-only preview"
          echo "  asyncapi validate asyncapi.yaml Validate"
          echo "  asyncapi-docs asyncapi.yaml     Generate static HTML"
          echo ""
        '';
      };
    };
}
