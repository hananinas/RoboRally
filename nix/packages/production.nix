{ pkgs, client, game-service }:

let
  kratosConfig = import ./kratos-config.nix { inherit pkgs; };
  hydraConfig = import ./hydra-config.nix { inherit pkgs; };

  caddyConfig = pkgs.writeText "robo-rally.Caddyfile" ''
    {
      admin off
      persist_config off
      auto_https disable_redirects
      local_certs
      skip_install_trust
      storage file_system "{$CADDY_DATA_DIR}"
    }

    {$WEB_SCHEME}://{$WEB_HOST}:{$WEB_PORT} {
      bind {$WEB_BIND}

      @backend path /auth/* /socket.io /socket.io/*
      handle @backend {
        reverse_proxy 127.0.0.1:{$GAME_PORT}
      }

      handle {
        root * ${client}
        try_files {path} /index.html
        file_server
      }
    }
  '';
  processConfig =
    (pkgs.formats.yaml { }).generate "robo-rally-process-compose.yaml" {
      version = "0.5";
      disable_env_expansion = true;
      processes = {
        migrate-kratos-db = {
          command = ''
            export DSN="sqlite://$KRATOS_DATA_DIR/kratos.db?_fk=true&mode=rwc&_journal_mode=WAL&_timeout=5000"
            exec ${pkgs.kratos}/bin/kratos -c ${kratosConfig} migrate sql -e --yes
          '';
        };

        kratos = {
          command = ''
            export DSN="sqlite://$KRATOS_DATA_DIR/kratos.db?_fk=true&mode=rwc&_journal_mode=WAL&_timeout=5000"
            export SERVE_PUBLIC_BASE_URL="$PUBLIC_ORIGIN/ory/kratos/"
            export SELFSERVICE_DEFAULT_BROWSER_RETURN_URL="$PUBLIC_ORIGIN/"
            export SELFSERVICE_ALLOWED_RETURN_URLS_0="$PUBLIC_ORIGIN"
            export SELFSERVICE_FLOWS_ERROR_UI_URL="$PUBLIC_ORIGIN/ory/ui/error"
            export SELFSERVICE_FLOWS_RECOVERY_UI_URL="$PUBLIC_ORIGIN/ory/ui/recovery"
            export SELFSERVICE_FLOWS_VERIFICATION_UI_URL="$PUBLIC_ORIGIN/ory/ui/verification"
            export SELFSERVICE_FLOWS_VERIFICATION_AFTER_DEFAULT_BROWSER_RETURN_URL="$PUBLIC_ORIGIN/"
            export SELFSERVICE_FLOWS_SETTINGS_UI_URL="$PUBLIC_ORIGIN/ory/ui/settings"
            export SELFSERVICE_FLOWS_LOGOUT_AFTER_DEFAULT_BROWSER_RETURN_URL="$PUBLIC_ORIGIN/ory/ui/login"
            export SELFSERVICE_FLOWS_LOGIN_UI_URL="$PUBLIC_ORIGIN/ory/ui/login"
            export SELFSERVICE_FLOWS_REGISTRATION_UI_URL="$PUBLIC_ORIGIN/ory/ui/registration"
            export COURIER_SMTP_CONNECTION_URI="''${COURIER_SMTP_CONNECTION_URI:-smtp://noop:noop@127.0.0.1:1025/?disable_starttls=true}"
            : "''${SECRETS_COOKIE_0:?Missing SECRETS_COOKIE_0 in /etc/robo-rally.env}"
            : "''${SECRETS_CIPHER_0:?Missing SECRETS_CIPHER_0 in /etc/robo-rally.env}"
            exec ${pkgs.kratos}/bin/kratos serve -c ${kratosConfig} --watch-courier
          '';

          depends_on.migrate-kratos-db.condition = "process_completed_successfully";

          availability = {
            restart = "on_failure";
            backoff_seconds = 2;
          };

          readiness_probe = {
            exec.command = ''
              ${pkgs.curl}/bin/curl --fail --silent --max-time 2 \
              http://127.0.0.1:4434/health/ready > /dev/null
            '';

            initial_delay_seconds = 1;
            period_seconds = 2;
            timeout_seconds = 2;
            failure_threshold = 30;
          };

          shutdown = {
            signal = 15;
            timeout_seconds = 10;
          };
        };

        migrate-hydra-db = {
          command = ''
            export DSN="sqlite://$HYDRA_DATA_DIR/hydra.db?_fk=true&mode=rwc&_journal_mode=WAL&_timeout=5000"
            exec ${pkgs.ory-hydra}/bin/hydra migrate -c ${hydraConfig} sql up -e --yes
          '';
        };

        hydra = {
          command = ''
            export DSN="sqlite://$HYDRA_DATA_DIR/hydra.db?_fk=true&mode=rwc&_journal_mode=WAL&_timeout=5000"
            export URLS_SELF_ISSUER="$PUBLIC_ORIGIN/ory/hydra/"
            export URLS_CONSENT="$PUBLIC_ORIGIN/ory/ui/consent"
            export URLS_LOGIN="$PUBLIC_ORIGIN/ory/ui/login"
            export URLS_LOGOUT="$PUBLIC_ORIGIN/ory/ui/logout"
            : "''${SECRETS_SYSTEM:?Missing SECRETS_SYSTEM in /etc/robo-rally.env}"
            exec ${pkgs.ory-hydra}/bin/hydra serve -c ${hydraConfig} all
          '';

          depends_on.migrate-hydra-db.condition = "process_completed_successfully";

          availability = {
            restart = "on_failure";
            backoff_seconds = 2;
          };

          readiness_probe = {
            exec.command = ''
              ${pkgs.curl}/bin/curl --fail --silent --max-time 2 \
              http://127.0.0.1:4445/health/ready > /dev/null
            '';

            initial_delay_seconds = 1;
            period_seconds = 2;
            timeout_seconds = 2;
            failure_threshold = 30;
          };

          shutdown = {
            signal = 15;
            timeout_seconds = 10;
          };
        };

        game-service = {
          command = ''
            export PORT="$GAME_PORT"
            exec ${game-service}/bin/game-service
          '';

          availability = {
            restart = "on_failure";
            backoff_seconds = 2;
          };

          readiness_probe = {
            exec.command = ''
              ${pkgs.curl}/bin/curl --fail --silent --max-time 2 \
              "http://127.0.0.1:$GAME_PORT/socket.io/?EIO=4&transport=polling" \
              > /dev/null
            '';

            initial_delay_seconds = 1;
            period_seconds = 10;
            timeout_seconds = 2;
            failure_threshold = 3;
          };

          shutdown = {
            signal = 15;
            timeout_seconds = 10;
          };
        };

        web = {
          command = "exec ${pkgs.caddy}/bin/caddy run --config ${caddyConfig} --adapter caddyfile";

          depends_on.game-service.condition = "process_healthy";

          availability = {
            restart = "on_failure";
            backoff_seconds = 2;
          };
          readiness_probe = {
            exec.command = ''
              if [ "$WEB_SCHEME" = https ]; then
                exec ${pkgs.curl}/bin/curl --fail --silent --show-error \
                  --max-time 3 --noproxy '*' \
                  --cacert "$CADDY_DATA_DIR/pki/authorities/local/root.crt" \
                  --resolve "$WEB_HOST:$WEB_PORT:127.0.0.1" \
                  "https://$WEB_HOST:$WEB_PORT/" > /dev/null
              else
                exec ${pkgs.curl}/bin/curl --fail --silent --show-error \
                  --max-time 3 --noproxy '*' \
                  "http://127.0.0.1:$WEB_PORT/" > /dev/null
              fi
            '';
            initial_delay_seconds = 1;
            period_seconds = 10;
            timeout_seconds = 5;
            failure_threshold = 3;
          };
          shutdown = {
            signal = 15;
            timeout_seconds = 10;
          };
        };
      };
    };
in
pkgs.writeShellApplication {
  name = "robo-rally-production";

  runtimeInputs = [ pkgs.coreutils ];

  text = ''
    export GAME_PORT="''${GAME_PORT:-3001}"
    export WEB_PORT="''${WEB_PORT:-8088}"
    export PC_PORT="''${PC_PORT:-18080}"
    export CADDY_DATA_DIR="''${CADDY_DATA_DIR:-$HOME/.local/share/caddy}"
    export WEB_BIND="''${WEB_BIND:-127.0.0.1}"
    export WEB_SCHEME="''${WEB_SCHEME:-http}"
    export WEB_HOST="''${WEB_HOST:-}"
    export PUBLIC_ORIGIN="''${PUBLIC_ORIGIN:-$WEB_SCHEME://''${WEB_HOST:-127.0.0.1}:$WEB_PORT}"

    stateDir="''${XDG_STATE_HOME:-$HOME/.local/state}/robo-rally"
    export KRATOS_DATA_DIR="''${KRATOS_DATA_DIR:-$stateDir/kratos}"
    export HYDRA_DATA_DIR="''${HYDRA_DATA_DIR:-$stateDir/hydra}"
    mkdir -p "$KRATOS_DATA_DIR" "$HYDRA_DATA_DIR"

    logDir="$stateDir/$PC_PORT"
    mkdir -p "$logDir"

    exec ${pkgs.process-compose}/bin/process-compose \
      --config ${processConfig} \
      --disable-dotenv \
      --address 127.0.0.1 \
      --port "$PC_PORT" \
      --log-file "$logDir/process-compose.log" \
      --ordered-shutdown \
      up "$@"
  '';
}
