#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIG_DIR="$ROOT/supabase/migrations"

if [[ ! -d "$MIG_DIR" ]]; then
  echo "Missing $MIG_DIR"
  exit 1
fi

count=0
while IFS= read -r f; do
  base="$(basename "$f")"
  # Accept legacy NNN_name.sql and supabase CLI timestamp_name.sql
  if [[ ! "$base" =~ ^[0-9]{3}_ ]] && [[ ! "$base" =~ ^[0-9]{14}_ ]]; then
    echo "Migration must start with 3-digit or 14-digit timestamp prefix: $base"
    exit 1
  fi
  if ! grep -qi 'create table\|alter table\|create policy' "$f"; then
    echo "Warning: $base may be empty or missing DDL"
  fi
  echo "  - $base"
  count=$((count + 1))
done < <(find "$MIG_DIR" -maxdepth 1 -name '*.sql' | sort)

if [[ "$count" -eq 0 ]]; then
  echo "No migration files found"
  exit 1
fi

echo "OK: $count migration files in order"
