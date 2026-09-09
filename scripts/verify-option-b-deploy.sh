#!/usr/bin/env bash
# Empirical Option B check: with git linked + auto-deploy disabled,
# one Deploy API call must create exactly one production deployment
# (no second build from a main-branch promote).
#
# Requires a VERCEL_TOKEN that can create projects on the Warix team.
# Creation failures return Vercel forbidden/action=create/resource=project —
# that is a permission issue, not a missing teamId (teamId is always sent).
set -euo pipefail
: "${VERCEL_TOKEN:?}"
: "${VERCEL_TEAM_ID:?}"
TEAM="$VERCEL_TEAM_ID"
AUTH="Authorization: Bearer $VERCEL_TOKEN"
API="https://api.vercel.com"

# Fail fast if token cannot create projects.
PROBE=$(curl -sS -X POST -H "$AUTH" -H 'Content-Type: application/json' \
  "$API/v11/projects?teamId=$TEAM" \
  -d "{\"name\":\"cander-token-probe-$(date +%s)\",\"framework\":\"nextjs\"}")
PROBE_ID=$(echo "$PROBE" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("id") or "")')
PROBE_ERR=$(echo "$PROBE" | python3 -c 'import sys,json; e=json.load(sys.stdin).get("error") or {}; print(e.get("code") or "", e.get("action") or "", e.get("resource") or "", e.get("message") or "")')
if [[ -z "$PROBE_ID" ]]; then
  echo "FAIL: VERCEL_TOKEN cannot create projects on team $TEAM" >&2
  echo "  vercel_error: $PROBE_ERR" >&2
  echo "  Fix token scopes / team role so action=create on resource=project is allowed." >&2
  exit 2
fi
curl -sS -X DELETE -H "$AUTH" "$API/v9/projects/$PROBE_ID?teamId=$TEAM" >/dev/null || true
echo "token_ok: can create projects"

REPO_ID="${1:-1363267134}"
REPO="${3:-Warix-AI/cander-049586e3a926452180eb399d}"
SHA="${2:-158082a0390e564dd845428d2497f957851a0066}"
NAME="cander-verify-ob-$(date +%s)"

count_prod() {
  local pid="$1"
  curl -sS -H "$AUTH" \
    "$API/v6/deployments?projectId=$pid&teamId=$TEAM&target=production&limit=50" \
    | python3 -c 'import sys,json; d=json.load(sys.stdin); print(len(d.get("deployments") or []))'
}

echo "== create project WITH git link =="
CREATE=$(curl -sS -X POST -H "$AUTH" -H 'Content-Type: application/json' \
  "$API/v11/projects?teamId=$TEAM" \
  -d "{\"name\":\"$NAME\",\"framework\":\"nextjs\",\"gitRepository\":{\"type\":\"github\",\"repo\":\"$REPO\"}}")
PID=$(echo "$CREATE" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("id") or "")')
if [[ -z "$PID" ]]; then
  echo "CREATE_FAIL $CREATE" >&2
  exit 1
fi
echo "project=$PID name=$NAME"

# Linking git can enqueue an initial deploy — wait, then disable, then baseline.
sleep 5
echo "== disable git auto-deploy =="
curl -sS -X PATCH -H "$AUTH" -H 'Content-Type: application/json' \
  "$API/v9/projects/$PID?teamId=$TEAM" \
  -d '{"gitProviderOptions":{"createDeployments":"disabled"},"commandForIgnoringBuildStep":"exit 0"}' \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print("createDeployments=", (d.get("gitProviderOptions") or {}).get("createDeployments")); print("ignore=", d.get("commandForIgnoringBuildStep"))'
sleep 2

BEFORE=$(count_prod "$PID")
echo "before_prod=$BEFORE"

echo "== force-update main (would auto-deploy if enabled) =="
gh api -X PATCH "repos/$REPO/git/refs/heads/main" \
  -f sha="$SHA" -F force=true >/dev/null
sleep 10
AFTER_PROMOTE=$(count_prod "$PID")
echo "after_main_promote=$AFTER_PROMOTE (delta=$((AFTER_PROMOTE-BEFORE)); expect 0 with auto-deploy disabled)"

echo "== single Deploy API production create =="
DEPLOY=$(curl -sS -X POST -H "$AUTH" -H 'Content-Type: application/json' \
  "$API/v13/deployments?teamId=$TEAM" \
  -d "{\"name\":\"$NAME\",\"project\":\"$PID\",\"target\":\"production\",\"gitSource\":{\"type\":\"github\",\"repoId\":$REPO_ID,\"ref\":\"cander/draft\",\"sha\":\"$SHA\"},\"meta\":{\"canderVerify\":\"option-b\"}}")
DID=$(echo "$DEPLOY" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("id") or "")')
ERR=$(echo "$DEPLOY" | python3 -c 'import sys,json; d=json.load(sys.stdin); e=d.get("error") or {}; print(e.get("message") or d.get("message") or "")')
echo "deployment_id=$DID err=$ERR"
sleep 3
AFTER_API=$(count_prod "$PID")
echo "after_api=$AFTER_API (delta_from_before=$((AFTER_API-BEFORE)); expect 1)"

DELTA_PROMOTE=$((AFTER_PROMOTE-BEFORE))
DELTA_TOTAL=$((AFTER_API-BEFORE))
if [[ "$DELTA_PROMOTE" -eq 0 && "$DELTA_TOTAL" -eq 1 && -n "$DID" ]]; then
  echo "PASS: main promote created 0; Deploy API created exactly 1"
  curl -sS -X DELETE -H "$AUTH" "$API/v9/projects/$PID?teamId=$TEAM" >/dev/null || true
  exit 0
fi
echo "FAIL: promote_delta=$DELTA_PROMOTE total_delta=$DELTA_TOTAL did=$DID"
echo "$DEPLOY" | head -c 800
exit 1
