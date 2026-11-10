{ pkgs }:

pkgs.writeShellApplication {
  name = "deploy-robo-rally";

  runtimeInputs = with pkgs; [
    nix
    systemd
    util-linux
    coreutils
    process-compose
  ];

  text = ''
    release=$1
    profile=/nix/var/nix/profiles/robo-rally
    service=robo-rally.service
    envFile=/etc/robo-rally.env

    previous=""
    if [[ -e "$profile" ]]; then
      previous=$(readlink -f "$profile")
    fi

    umask 077
    cat > "$envFile"
    chmod 600 "$envFile"

    source "$envFile"
    : "''${PC_PORT:?Missing PC_PORT in $envFile}"

    healthy() {
      timeout 60s process-compose \
        --address 127.0.0.1 \
        --port "$PC_PORT" \
        project is-ready --wait
    }

    nix-env --profile "$profile" --set "$release"

    if systemctl restart "$service" && healthy; then
      echo "Deployed $release"
      exit 0
    fi

    echo "Release failed its startup checks." >&2
    journalctl -u "$service" -n 50 --no-pager || true

    if [[ -n "$previous" ]]; then
      echo "Restoring $previous" >&2
      nix-env --profile "$profile" --set "$previous"
      systemctl restart "$service"

      if ! healthy; then
        echo "Previous release also failed its startup checks." >&2
      fi
    else
      systemctl stop "$service" || true
      echo "No previous release exists to restore." >&2
    fi

    exit 1
  '';
}
