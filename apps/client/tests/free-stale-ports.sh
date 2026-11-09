#!/usr/bin/env bash
# `process-compose down` only reaches a live admin API, so it can't clean up processes
# orphaned by a previous run that got killed outright (e.g. a webServer timeout). This
# frees the fixed ports the default process-compose.yaml namespace binds, regardless of
# which process ended up holding them.

ports="4434 14433 4445 14444 3001 5173 14455 1025 8025 8080"

for port in $ports; do
  pid=$(ss -tlnp 2>/dev/null | awk -v p=":$port" '$4 ~ p"$" {print $NF}' | grep -oP 'pid=\K[0-9]+')
  if [ -n "$pid" ]; then
    kill "$pid" 2>/dev/null
  fi
done
