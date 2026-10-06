{ pkgs, pnpm2nix, gameId }:

let
  packages = [ "apps/client" "apps/game-service" "apps/user-service" "packages/game-events" ];
  mkCheck = { name, extraBuildEnv ? {}, preBuildPackages ? [] }:
    let
      workspace = pnpm2nix.mkPnpmWorkspace {
        workspace = ../..;
        nodejs = pkgs.nodejs_24;
        apps = [ { inherit name preBuildPackages; path = "."; script = name; } ];
        inherit packages;
        buildEnv = { VITE_GAME_ID = gameId; } // extraBuildEnv;
      };
    in workspace.apps.${name}.overrideAttrs (old: {
      buildPhase = builtins.replaceStrings
        [ "pnpm --filter ./. run ${name}" ]
        [ "pnpm --reporter=append-only --recursive --if-present run ${name}" ]
        old.buildPhase;

      installPhase = "mkdir -p $out && touch $out/success";
    });

in {
  typecheck = mkCheck { name = "typecheck"; };
  lint = mkCheck { name = "lint"; };
  build = mkCheck { name = "build"; };

  test = mkCheck {
    name = "test";
    preBuildPackages = [ "packages/game-events" "apps/game-service" ];
    extraBuildEnv = {
      PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
      PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
      FONTCONFIG_FILE = "${pkgs.makeFontsConf { fontDirectories = [ pkgs.dejavu_fonts pkgs.liberation_ttf ]; }}";
    };
  };
}
