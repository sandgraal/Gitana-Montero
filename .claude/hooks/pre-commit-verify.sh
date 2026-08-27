#!/bin/bash
# PreToolUse(Bash) hook: gate `git commit` on the project verify suite in
# whichever worktree is committing. Before Phase 1 lands (no package.json),
# fall back to harness validation so the hook never blocks harness work.
# Exit 2 = block, message on stderr shown to the agent.

input=$(cat)
printf '%s' "$input" | grep -q '"command"' || exit 0
cmd=$(printf '%s' "$input" \
  | sed -E -n 's/.*"command"[[:space:]]*:[[:space:]]*"(([^"\\]|\\.)*)".*/\1/p' \
  | head -n1 \
  | sed -e 's/\\"/"/g' -e 's/\\\\/\\/g' -e 's/\\n/ /g')

# Only gate actual git commit commands.
printf '%s' "$cmd" | grep -Eq '(^|[|;&][[:space:]]*)git[[:space:]]+(-[^[:space:]]+[[:space:]]+)*commit([[:space:]]|$)' || exit 0

# Commit runs in the caller's cwd; hooks run at the main checkout. Honor an
# explicit `git -C <path>` if present, else use the hook's cwd.
dir=$(printf '%s' "$cmd" | sed -E -n 's/.*git[[:space:]]+-C[[:space:]]+("([^"]+)"|([^[:space:]]+)).*/\2\3/p' | head -n1)
[ -n "$dir" ] && cd "$dir" 2>/dev/null

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm use 24 >/dev/null 2>&1

if [ -f package.json ] && grep -q '"verify"' package.json; then
  out=$(npm run verify 2>&1)
  if [ $? -ne 0 ]; then
    echo "Blocked by pre-commit-verify.sh: npm run verify failed. Fix before committing; never --no-verify." >&2
    echo "$out" | tail -30 >&2
    exit 2
  fi
elif [ -f scripts/validate-routing.mjs ]; then
  out=$(node scripts/validate-routing.mjs 2>&1)
  if [ $? -ne 0 ]; then
    echo "Blocked by pre-commit-verify.sh: routing validation failed." >&2
    echo "$out" | tail -10 >&2
    exit 2
  fi
fi

exit 0
