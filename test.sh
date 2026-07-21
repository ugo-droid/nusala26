#!/bin/bash
# NUSALA 26 API smoke test. Usage: ./test.sh [ADMIN_KEY]
# ponytail: curl + grep asserts, no framework
set -e
BASE="https://nusala26.pages.dev"
KEY="${1:-NUSALA2026}"
fail() { echo "FAIL: $1"; exit 1; }

curl -sf "$BASE/api/data" | python3 -c "
import json,sys
d=json.load(sys.stdin)
assert isinstance(d['days'], list) and len(d['days'])==4, 'need 4 days'
assert isinstance(d['announcements'], list)
assert isinstance(d['speakers'], list)
assert d['venue']['name']
print('GET /api/data schema ok')" || fail "data schema"

[ "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/data" -d '{}')" = "401" ] || fail "unauth POST should 401"
echo "unauth POST rejected ok"

[ "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/data" -H "x-admin-key: $KEY" -d 'not json')" = "400" ] || fail "bad JSON should 400"
echo "bad JSON rejected ok"

D=$(curl -sf "$BASE/api/data")
R=$(curl -sf -X POST "$BASE/api/data" -H "x-admin-key: $KEY" -H "content-type: application/json" -d "$D")
echo "$R" | grep -q '"ok":true' || fail "authed roundtrip write"
echo "authed write ok"

for f in / /admin /manifest.json /sw.js /assets/icon-192.png; do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE$f")" = "200" ] || fail "$f not 200"
done
echo "static files ok"
echo "ALL GREEN"
