{ pkgs }:

let
  nodejs = pkgs.nodejs_24;
  pnpm = pkgs.pnpm_10;
in
pkgs.stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "robo-rally-kratos-hydra-ui";
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
          "lib"
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

  pnpmWorkspaces = [ "@robo-rally/kratos-hydra-ui" ];

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
    hash = "sha256-6OI8SPluhh0s2NnVxZjan+jhj9ssx8YJProeXPQde3E=";
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

    pnpm --filter @robo-rally/kratos-hydra-ui deploy \
      --offline --prod "$out/lib/kratos-hydra-ui"

    # package.json's "files" list omits public/ (favicon, CSS), so
    # `pnpm deploy` drops it - copy it in explicitly.
    cp -r apps/kratos-hydra-ui/public "$out/lib/kratos-hydra-ui/public"

    makeWrapper ${nodejs}/bin/node "$out/bin/kratos-hydra-ui" \
      --add-flags "$out/lib/kratos-hydra-ui/lib/index.js" \
      --set NODE_ENV production

    runHook postInstall
  '';

  meta.mainProgram = "kratos-hydra-ui";
})
