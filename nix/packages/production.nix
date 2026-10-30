{ pkgs, client, game-service }:

let
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
    logDir="''${XDG_STATE_HOME:-$HOME/.local/state}/robo-rally/$PC_PORT"
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
