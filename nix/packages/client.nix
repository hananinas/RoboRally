{ pkgs, gameId ? "" }:

let
  nodejs = pkgs.nodejs_24;
  pnpm = pkgs.pnpm_10;
in
pkgs.stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "robo-rally-client";
  version = "0.0.0";

  src = pkgs.lib.cleanSourceWith {
    src = pkgs.lib.cleanSource ../..;

    filter = path: type:
      let
        name = builtins.baseNameOf path;
      in
        !(builtins.elem name [
          "node_modules"
          "dist"
          "coverage"
          "test-results"
          "playwright-report"
          ".direnv"
          "result"
        ])
        && !(pkgs.lib.hasPrefix ".env" name);
  };

  postPatch = ''
    echo 'manage-package-manager-versions=false' >> .npmrc
  '';

  pnpmWorkspaces = [ "@robo-rally/client..." ];

  pnpmDeps = pkgs.fetchPnpmDeps {
    inherit (finalAttrs) pname src postPatch pnpmWorkspaces;
    inherit pnpm;

    version = builtins.hashFile "sha256" ../../pnpm-lock.yaml;
    fetcherVersion = 4;
    hash = "sha256-w2PEHUAB8aGxt1oyW6S/CRd3+apTj7zUxiZMFigAUFg=";
  };

  nativeBuildInputs = [
    nodejs
    pnpm
    pkgs.pnpmConfigHook
    pkgs.pnpmBuildHook
  ];

  pnpmBuildScript = "build";

  # Vite embeds this value in the generated JavaScript.
  VITE_GAME_ID = gameId;

  installPhase = ''
    runHook preInstall

    mkdir -p "$out"
    cp -r apps/client/dist/. "$out/"

    runHook postInstall
  '';
})
