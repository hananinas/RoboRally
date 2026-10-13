{ pkgs }:

let
  nodejs = pkgs.nodejs_24;
  pnpm = pkgs.pnpm_10;
in
pkgs.stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "robo-rally-game-service";
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
  
  # Keep the pnpm version supplied by Nix.
  postPatch = ''
    echo 'manage-package-manager-versions=false' >> .npmrc
    '';

  pnpmWorkspaces = [ "@robo-rally/game-service..." ];

  pnpmDeps = pkgs.fetchPnpmDeps {
    inherit (finalAttrs)
      pname
      src
      postPatch
      pnpmWorkspaces
      ;
    version = builtins.hashFile "sha256" ../../pnpm-lock.yaml;
    inherit pnpm;

    fetcherVersion = 4;
    hash = "sha256-bJ8QmUuuOZyMcieqgj2BpEYNYDhMsb8ChlayD6stuzk=";
  };

  nativeBuildInputs = [
    nodejs
    pnpm
    pkgs.pnpmConfigHook
    pkgs.pnpmBuildHook
    pkgs.makeWrapper
  ];

  pnpmBuildScript = "build";
  
  installPhase = ''
    runHook preInstall

    mkdir -p "$out/lib" "$out/bin"

    pnpm --filter @robo-rally/game-service deploy \
      --offline --prod "$out/lib/game-service"

    makeWrapper ${nodejs}/bin/node "$out/bin/game-service" \
      --add-flags "$out/lib/game-service/dist/main.js" \
      --set NODE_ENV production

    runHook postInstall
  '';

  meta.mainProgram = "game-service";
})
