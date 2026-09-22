{ pkgs, nixvim, system }:

let
  nodejs = pkgs.nodejs_24;

  editor = import ./editor.nix {
    inherit pkgs nixvim system;
  };

  asyncapiPackages = import ./asyncapi.nix {
    inherit pkgs nodejs;
  };

  pnpm = pkgs.writeShellScriptBin "pnpm" ''
    exec ${nodejs}/bin/npm exec --yes --package=pnpm@10.9.0 -- pnpm "$@"
  '';

  mkProjectShell = {
    setupCommand,
    withClient ? false,
    withGameService ? false,
    withAsyncapi ? false,
    withEditor ? false
  }:
    pkgs.mkShell ({
      packages = [ nodejs pnpm pkgs.process-compose ]
        ++ pkgs.lib.optionals withAsyncapi asyncapiPackages
        ++ pkgs.lib.optionals withEditor [ editor ];

      shellHook = ''
        ${setupCommand} || return $?
      '';
    } // pkgs.lib.optionalAttrs withClient {
      PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
      PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
    });
in {
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
    packages = [ nodejs ] ++ asyncapiPackages;
  };

  # Full project environment with the optional project editor.
  with-editor = mkProjectShell {
    setupCommand = "pnpm run install-dev";
    withClient = true;
    withGameService = true;
    withAsyncapi = true;
    withEditor = true;
  };
}
