#!/bin/bash
# PreToolUse(Bash) hook: hard stops the permission allowlist cannot express
# precisely. Subagents run with broad git/gh permissions; this keeps the few
# forbidden forms forbidden regardless.
# Exit 2 = block with the message on stderr shown to the agent.

input=$(cat)

# Only Bash tool calls carry a tool_input.command field; anything else passes.
printf '%s' "$input" | grep -q '"command"' || exit 0

# Extract the command string. Take everything after `"command":"` up to the
# first unescaped quote, then unescape \" and \\. (\n becomes a space — the
# patterns below treat it like whitespace anyway.)
cmd=$(printf '%s' "$input" \
  | sed -E -n 's/.*"command"[[:space:]]*:[[:space:]]*"(([^"\\]|\\.)*)".*/\1/p' \
  | head -n1 \
  | sed -e 's/\\"/"/g' -e 's/\\\\/\\/g' -e 's/\\n/ /g')
[ -z "$cmd" ] && exit 0

block() {
  echo "Blocked by .claude/hooks/guard-dangerous-git.sh: $1" >&2
  echo "Command: $cmd" >&2
  exit 2
}

# The checks below look at the command's *own* tokens. A commit message or
# heredoc that mentions a forbidden flag still trips the simple substring
# checks (--no-verify, --admin); write such prose with the Write tool.
case "$cmd" in
  *"--no-verify"*)
    block "--no-verify bypasses the pre-commit verify hook (AGENTS.md)." ;;
esac

# Bare --force / -f on push (allow --force-with-lease only).
if printf '%s' "$cmd" | grep -Eq 'git[[:space:]]+push[^|;&]*([[:space:]]--force([[:space:]]|$)|[[:space:]]-f([[:space:]]|$))'; then
  block "bare force-push; use --force-with-lease."
fi

# Pushing directly to main (branch protection would refuse anyway; fail early).
if printf '%s' "$cmd" | grep -Eq 'git[[:space:]]+push[^|;&]*[[:space:]](origin[[:space:]]+)?(HEAD:)?main([[:space:]]|$)'; then
  block "direct push to main; open a PR."
fi

case "$cmd" in
  *"gh pr merge"*"--admin"*)
    block "--admin bypasses branch protection; satisfy the required checks + thread resolution instead." ;;
  *"git branch -D main"*|*"git push origin --delete main"*|*"git push origin :main"*)
    block "refusing to delete main." ;;
  *"gh repo delete"*)
    block "refusing to delete a repository." ;;
esac

# Recursive+force rm on anything outside an obvious build/scratch path.
# Token-based so `rm -rf`, `rm -fr`, `rm -r -f`, `rm --recursive --force`
# are all caught. Split the command on |;& into simple commands first.
printf '%s\n' "$cmd" | tr '|;&' '\n\n\n' | while IFS= read -r seg || [ -n "$seg" ]; do
  r=0; f=0; seen=0; prev=""
  for tok in $seg; do
    # Only flags after `rm` in command position count: first token of the
    # segment, or right after a wrapper (`sudo rm`, `xargs rm`, `do rm`).
    # `grep rm -rf` is an argument to grep, not an rm.
    if [ "$seen" = 0 ]; then
      case "$tok" in
        rm|*/rm)
          case "$prev" in ""|sudo|xargs|exec|do|then|else|time|nice|env) seen=1 ;; esac ;;
      esac
      prev=$tok
      continue
    fi
    case "$tok" in
      --recursive) r=1 ;;
      --force) f=1 ;;
      --*) ;;
      -*[rR]*) r=1; case "$tok" in *f*) f=1 ;; esac ;;
      -*f*) f=1 ;;
    esac
  done
  if [ "$r" = 1 ] && [ "$f" = 1 ]; then
    case "$seg" in
      *node_modules*|*/scratchpad*|*/.astro*|*dist*|*coverage*|*playwright-report*|*test-results*) ;;
      *) exit 3 ;;
    esac
  fi
done
[ "${PIPESTATUS[2]}" = 3 ] && block "recursive+force rm outside build/scratch dirs; use git worktree remove / git clean, or ask."

exit 0
