{
  description = "Robo Rally workspace and AsyncAPI development environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  inputs.nixvim.url = "github:nix-community/nixvim";

  outputs = { self, nixpkgs, nixvim }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
      nodejs = pkgs.nodejs_24;

      editorConfig = nixvim.lib.evalNixvim {
        inherit system;
        modules = [
          ({ config, ... }: {
            plugins.treesitter = {
              enable = true;
              highlight.enable = true;
              grammarPackages = with config.plugins.treesitter.package.builtGrammars; [
                typescript
                tsx
                javascript
                json
                html
                css
                nix
                yaml
              ];
            };
          })
        ];
      };

      # Keep project editor data separate from the global nixCats installation.
      editor = pkgs.writeShellScriptBin "nvim" ''
        export NVIM_APPNAME=robo-rally-nvim
        exec ${editorConfig.config.build.package}/bin/nvim "$@"
      '';

      pnpm = pkgs.writeShellScriptBin "pnpm" ''
        exec ${nodejs}/bin/npm exec --yes --package=pnpm@10.9.0 -- pnpm "$@"
      '';

      cliVersion = "6.0.2";

      asyncapi = pkgs.writeShellScriptBin "asyncapi" ''
        exec ${nodejs}/bin/npm exec \
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
        output="''${2:-./build/asyncapi-docs}"

        exec ${asyncapi}/bin/asyncapi generate fromTemplate \
          "$spec" \
          @asyncapi/html-template@3.5.0 \
          --param singleFile=true outFilename=asyncapi.html \
          --output "$output" \
          --force-write
      '';

      asyncapiPackages = [ asyncapi studio preview docs ];

      asyncapiHelp = ''
        echo "  asyncapi-studio asyncapi.yaml   Edit in browser"
        echo "  asyncapi-preview asyncapi.yaml  Read-only preview"
        echo "  asyncapi validate asyncapi.yaml Validate"
        echo "  asyncapi-docs asyncapi.yaml     Generate static HTML"
      '';

      mkProjectShell = {
        setupCommand,
        withClient ? false,
        withGameService ? false,
        withAsyncapi ? false
      }:
        pkgs.mkShell ({
          packages = [ nodejs pnpm editor ]
            ++ pkgs.lib.optionals withAsyncapi asyncapiPackages;

          shellHook = ''
            ${setupCommand} || return $?
          '';
        } // pkgs.lib.optionalAttrs withClient {
          PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
          PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
          PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
        });
    in {
      devShells.${system} = {
        default = mkProjectShell {
          setupCommand = "pnpm run install-dev";
          withClient = true;
          withGameService = true;
          withAsyncapi = true;
        };

        client = mkProjectShell {
          setupCommand = "pnpm --filter @robo-rally/client run install-dev";
          withClient = true;
        };

        game-service = mkProjectShell {
          setupCommand = "pnpm --filter @robo-rally/game-service run install-dev";
          withGameService = true;
        };

        asyncapi = pkgs.mkShell {
          packages = [ nodejs editor ] ++ asyncapiPackages;
        };
      };
    };
}
