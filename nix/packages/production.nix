{ pkgs, client, game-service }:

let
  caddyConfig = pkgs.writeText "robo-rally.Caddyfile" ''
    {
      admin off
        auto_https off
        persist_config off
    }
    
    http://:{$WEB_PORT} {
      bind {$IP}

      @socketio path /socket.io /socket.io/*
      handle @socketio {
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
              ${pkgs.curl}/bin/curl --fail --silent --max-time 2 \
              "http://127.0.0.1:$WEB_PORT/" > /dev/null             
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
    export IP="''${IP:-127.0.0.1}"

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
