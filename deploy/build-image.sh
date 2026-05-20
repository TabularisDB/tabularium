#!/usr/bin/env bash
# Build the registry image locally and import it into the remote k3s containerd.
#
# Usage:
#   deploy/build-image.sh [TAG]            # defaults to "dev"
#
# Env:
#   K3S_HOST     SSH target for the k3s node (default: lyna)
#   K3S_USER     SSH user (default: $USER)

set -euo pipefail

TAG="${1:-dev}"
IMAGE="tabularium:${TAG}"
HOST="${K3S_HOST:-lyna}"
SSH_TARGET="${K3S_USER:+${K3S_USER}@}${HOST}"

cd "$(dirname "$0")/.."

echo ">>> Building ${IMAGE}"
docker build -t "${IMAGE}" .

echo ">>> Saving to tarball"
TMP="$(mktemp -t tabularium-XXXXXX.tar)"
trap 'rm -f "${TMP}"' EXIT
docker save -o "${TMP}" "${IMAGE}"

echo ">>> Importing into ${SSH_TARGET} (k3s containerd)"
ssh "${SSH_TARGET}" "sudo k3s ctr images import -" < "${TMP}"

echo ">>> Done. Image ${IMAGE} available on ${HOST}."
