#!/usr/bin/env bash
# Upload an extension zip to the Chrome Web Store and submit it for review
# (Chrome Web Store API v2). The store publishes it when it passes review.
#
# Usage: scripts/cws-publish.sh <zip> <version>
#        scripts/cws-publish.sh check
#
# "check" only signs in and reads the item's status, to confirm the
# credentials work; it uploads and submits nothing.
#
# Environment:
#   CWS_SERVICE_ACCOUNT_KEY  JSON key of the service account added to the
#                            publisher in the Developer Dashboard (Account)
#   CWS_PUBLISHER_ID         Developer Dashboard > Publisher > Settings
#   CWS_ITEM_ID              the extension's ID in the store
set -euo pipefail

usage="usage: cws-publish.sh <zip> <version> | cws-publish.sh check"
zip="${1:?$usage}"
if [ "$zip" != check ]; then
  version="${2:?$usage}"
fi
: "${CWS_SERVICE_ACCOUNT_KEY:?}" "${CWS_PUBLISHER_ID:?}" "${CWS_ITEM_ID:?}"

api="https://chromewebstore.googleapis.com"
item="publishers/$CWS_PUBLISHER_ID/items/$CWS_ITEM_ID"

# curl that prints the response body to stderr when the request fails.
call() {
  local body
  if ! body="$(curl -sS --fail-with-body "$@")"; then
    echo "request failed: $body" >&2
    return 1
  fi
  printf '%s\n' "$body"
}

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

# Access token: a JWT signed with the service account's key, exchanged at
# Google's token endpoint.
access_token() {
  local keyfile now header claims signature
  keyfile="$(mktemp)"
  # shellcheck disable=SC2064
  trap "rm -f '$keyfile'" RETURN
  jq -r .private_key <<<"$CWS_SERVICE_ACCOUNT_KEY" >"$keyfile"
  now="$(date +%s)"
  header="$(printf '{"alg":"RS256","typ":"JWT"}' | b64url)"
  claims="$(jq -nc \
    --arg iss "$(jq -r .client_email <<<"$CWS_SERVICE_ACCOUNT_KEY")" \
    --argjson iat "$now" \
    '{iss: $iss, scope: "https://www.googleapis.com/auth/chromewebstore",
      aud: "https://oauth2.googleapis.com/token", iat: $iat, exp: ($iat + 600)}' | b64url)"
  signature="$(printf '%s.%s' "$header" "$claims" | openssl dgst -sha256 -sign "$keyfile" | b64url)"
  call https://oauth2.googleapis.com/token \
    -d grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer \
    -d assertion="$header.$claims.$signature" | jq -r .access_token
}

token="$(access_token)" || exit 1
[ -n "${GITHUB_ACTIONS:-}" ] && echo "::add-mask::$token"
auth=(-H "Authorization: Bearer $token")

if [ "$zip" = check ]; then
  call "${auth[@]}" "$api/v2/$item:fetchStatus" | jq .
  echo "Signed in and read the status of $CWS_ITEM_ID."
  exit 0
fi

echo "Uploading $zip"
upload="$(call -X POST "${auth[@]}" -T "$zip" "$api/upload/v2/$item:upload")"
echo "$upload" | jq .
state="$(jq -r .uploadState <<<"$upload")"
uploaded="$(jq -r '.crxVersion // empty' <<<"$upload")"

# Large uploads are processed asynchronously: wait for them (up to 5 minutes).
for _ in $(seq 30); do
  case "$state" in
    SUCCEEDED) break ;;
    IN_PROGRESS | UPLOAD_IN_PROGRESS)
      sleep 10
      state="$(call "${auth[@]}" "$api/v2/$item:fetchStatus" | jq -r .lastAsyncUploadState)"
      ;;
    *) break ;;
  esac
done
if [ "$state" != SUCCEEDED ]; then
  echo "the upload did not succeed (state: $state)" >&2
  exit 1
fi
if [ -n "$uploaded" ] && [ "$uploaded" != "$version" ]; then
  echo "the store read version $uploaded from the zip, expected $version" >&2
  exit 1
fi

echo "Submitting $version for review"
call -X POST "${auth[@]}" -H "Content-Type: application/json" \
  -d '{"publishType": "DEFAULT_PUBLISH"}' "$api/v2/$item:publish" | jq .

call "${auth[@]}" "$api/v2/$item:fetchStatus" | jq .
