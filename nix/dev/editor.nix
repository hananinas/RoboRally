{ pkgs, nixvim, system }:

let
  editorConfig = nixvim.lib.evalNixvim {
    inherit system;

    modules = [
      ({ config, ... }: {
        clipboard = {
          register = "unnamedplus";

          # macOS uses Neovim's native pbcopy/pbpaste provider.
          providers.wl-copy.enable = pkgs.stdenv.isLinux;
        };

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

        plugins.lsp = {
          enable = true;
          servers.ts_ls.enable = true;
        };

        plugins.blink-cmp.enable = true;
      })
    ];
  };
in
  # Keep project editor data separate from the global Nixvim installation.
  pkgs.writeShellScriptBin "nvim" ''
    export NVIM_APPNAME=robo-rally-nvim
    exec ${editorConfig.config.build.package}/bin/nvim "$@"
  ''
