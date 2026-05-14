#!/usr/bin/env bash
# Respawn bun --hot on clean exit (the install wizard exits 0 to trigger restart).
# Crashes and Ctrl-C bubble up.

trap 'exit 0' INT TERM

while true; do
  bun --hot src/index.ts
  status=$?
  if [ $status -ne 0 ]; then
    echo "[dev.sh] backend exited with status $status — stopping" >&2
    exit $status
  fi
  echo "[dev.sh] backend exited cleanly — restarting in 0.5s"
  sleep 0.5
done
