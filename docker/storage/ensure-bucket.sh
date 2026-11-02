#!/bin/sh
# Healthcheck for RustFS (docker-compose.yml → rustfs).
# Healthy = API up AND the application bucket exists. Creates the bucket on
# first run (idempotent), the same pattern as docker/mongo/init-replica-set.js.
#
# No one-shot job on purpose: `docker compose up --wait` races with containers
# that exit quickly and may report "container ... exited (0)" as a failure.
# Requests are signed with SigV4 by curl itself (no aws-cli image needed).
set -eu

endpoint="http://localhost:9000"
bucket_url="$endpoint/$S3_BUCKET"

s3() {
  curl -fsS -o /dev/null \
    --aws-sigv4 "aws:amz:${RUSTFS_REGION}:s3" \
    --user "${RUSTFS_ACCESS_KEY}:${RUSTFS_SECRET_KEY}" \
    "$@"
}

curl -fsS -o /dev/null "$endpoint/health"

if ! s3 --head "$bucket_url" 2> /dev/null; then
  s3 -X PUT "$bucket_url"
fi
