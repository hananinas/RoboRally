{ pkgs, client }:

pkgs.writeText "robo-rally.Caddyfile" ''
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

    handle_path /ory/kratos/* {
      reverse_proxy 127.0.0.1:14433
    }

    handle_path /ory/hydra/* {
      reverse_proxy 127.0.0.1:14444
    }

    handle /ory/ui/* {
      reverse_proxy 127.0.0.1:14455
    }

    handle {
      root * ${client}
      try_files {path} /index.html
      file_server
    }
  }
''
