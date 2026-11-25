{ pkgs, nixvim, system }:

let
  nodejs = pkgs.nodejs_26;

  editor = import ./editor.nix {
    inherit pkgs nixvim system;
  };

  asyncapiPackages = import ./asyncapi.nix {
    inherit pkgs nodejs;
  };

  pnpm = pkgs.writeShellScriptBin "pnpm" ''
    exec ${nodejs}/bin/npm exec --yes --package=pnpm@10.9.0 -- pnpm "$@"
  '';

  chromiumOnlyBrowsers = pkgs.playwright-driver.browsers.override {
    withFirefox = false;
    withWebkit = false;
  };

  mkProjectShell = {
    setupCommand,
    withClient ? false,
    withGameService ? false,
    withAsyncapi ? false,
    withDiagrams ? false,
    withEditor ? false,
    withBackend ? false,
    withBrowser ? false
  }:
    pkgs.mkShell ({
      packages = [ nodejs pnpm pkgs.dbmate ]
        ++ pkgs.lib.optionals withBackend [ pkgs.process-compose pkgs.kratos pkgs.ory-hydra pkgs.mailpit pkgs.mkcert pkgs.nss.tools pkgs.caddy pkgs.xdg-utils ]
        ++ pkgs.lib.optionals withAsyncapi asyncapiPackages
        ++ pkgs.lib.optionals withDiagrams [ pkgs.plantuml-c4 ]
        ++ pkgs.lib.optionals withEditor [ editor ]
        ++ pkgs.lib.optionals withBrowser [ pkgs.firefox ];

      shellHook = ''
        ${setupCommand} || return $?
      '';
    } // pkgs.lib.optionalAttrs withClient {
      PLAYWRIGHT_BROWSERS_PATH = "${chromiumOnlyBrowsers}";
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
      PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
    } // pkgs.lib.optionalAttrs withBrowser {
      BROWSER = "firefox";
    });
in {
  default = mkProjectShell {
    setupCommand = "pnpm run install-dev";
    withClient = true;
    withGameService = true;
    withAsyncapi = true;
    withDiagrams = true;
    withBackend = true;
  };

  client = mkProjectShell {
    setupCommand = "pnpm --filter @robo-rally/client run install-dev";
    withClient = true;
  };

  # Full workspace install with a lean (no backend) toolchain, for CI typecheck/lint/build/test.
  ci = mkProjectShell {
    setupCommand = "pnpm run install-dev";
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
    withDiagrams = true;
    withEditor = true;
    withBackend = true;
  };

  # Full project environment with a bundled browser (e.g. for WSL, where no
  # browser is auto-trusted/registered for xdg-open to find).
  browser = mkProjectShell {
    setupCommand = "pnpm run install-dev";
    withClient = true;
    withGameService = true;
    withAsyncapi = true;
    withBackend = true;
    withBrowser = true;
  };
}
