{ pkgs, client, game-service, kratos-hydra-ui }:

let
  kratosConfig = import ./kratos-config.nix { inherit pkgs; };
  hydraConfig = import ./hydra-config.nix { inherit pkgs; };
  caddyConfig = import ./caddy-config.nix { inherit pkgs client; };
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

        register-game-service-client = {
          command = ''
            : "''${OAUTH_CLIENT_SECRET:?Missing OAUTH_CLIENT_SECRET in /etc/robo-rally.env}"

            payload=$(${pkgs.jq}/bin/jq -n \
              --arg secret "$OAUTH_CLIENT_SECRET" \
              --arg redirect "$PUBLIC_ORIGIN/auth/callback" \
              --arg postLogout "$PUBLIC_ORIGIN/" \
              '{
                client_id: "game-service",
                client_secret: $secret,
                grant_types: ["authorization_code"],
                response_types: ["code"],
                token_endpoint_auth_method: "client_secret_post",
                scope: "openid profile",
                redirect_uris: [$redirect],
                post_logout_redirect_uris: [$postLogout],
                skip_consent: true,
                skip_logout_consent: true
              }')

            if ${pkgs.curl}/bin/curl --fail --silent http://127.0.0.1:4445/admin/clients/game-service > /dev/null; then
              echo "$payload" | ${pkgs.curl}/bin/curl --fail --silent --show-error \
                -X PUT http://127.0.0.1:4445/admin/clients/game-service \
                -H "Content-Type: application/json" -d @-
            else
              echo "$payload" | ${pkgs.curl}/bin/curl --fail --silent --show-error \
                -X POST http://127.0.0.1:4445/admin/clients \
                -H "Content-Type: application/json" -d @-
            fi
          '';

          depends_on.hydra.condition = "process_healthy";
        };

        kratos-hydra-ui = {
          command = ''
            export PORT="''${ORY_UI_PORT:-14455}"
            export BASE_PATH="/ory/ui"
            export TRUSTED_CLIENT_IDS="game-service"
            export ORY_SDK_URL="$PUBLIC_ORIGIN/ory/kratos"
            export KRATOS_PUBLIC_URL="$PUBLIC_ORIGIN/ory/kratos"
            export KRATOS_ADMIN_URL="http://127.0.0.1:4434"
            export HYDRA_ADMIN_URL="http://127.0.0.1:4445"
            export CSRF_COOKIE_NAME="''${CSRF_COOKIE_NAME:-__Host-ax-csrf-token}"
            : "''${COOKIE_SECRET:?Missing COOKIE_SECRET in /etc/robo-rally.env}"
            : "''${CSRF_COOKIE_SECRET:?Missing CSRF_COOKIE_SECRET in /etc/robo-rally.env}"
            exec ${kratos-hydra-ui}/bin/kratos-hydra-ui
          '';

          depends_on = {
            kratos.condition = "process_healthy";
            hydra.condition = "process_healthy";
          };

          availability = {
            restart = "on_failure";
            backoff_seconds = 2;
          };

          readiness_probe = {
            exec.command = ''
              ${pkgs.curl}/bin/curl --fail --silent --max-time 2 \
              "http://127.0.0.1:''${ORY_UI_PORT:-14455}/ory/ui/health/ready" > /dev/null
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

        game-service = {
          command = ''
            export PORT="$GAME_PORT"
            export HYDRA_ISSUER_URL="$PUBLIC_ORIGIN/ory/hydra/"
            export OAUTH_CLIENT_ID="game-service"
            export AUTH_CALLBACK_URL="$PUBLIC_ORIGIN/auth/callback"
            export POST_LOGOUT_REDIRECT_URL="$PUBLIC_ORIGIN/"
            export KRATOS_SETTINGS_URL="$PUBLIC_ORIGIN/ory/ui/settings"
            export NODE_EXTRA_CA_CERTS="$CADDY_DATA_DIR/pki/authorities/local/root.crt"
            : "''${OAUTH_CLIENT_SECRET:?Missing OAUTH_CLIENT_SECRET in /etc/robo-rally.env}"
            exec ${game-service}/bin/game-service
          '';

          depends_on = {
            hydra.condition = "process_healthy";
            web.condition = "process_healthy";
          };

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
