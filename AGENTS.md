# Agent Build Instructions

## Build Looks Stuck At `>`
- In this repository, a lone `>` after startup logs usually means the TSWoW command loop is waiting for a command.
- Run `build full` to start full compilation, or `build trinitycore` for core-only compilation.
- Use `Ctrl+C` to exit the loop.

## First-Time Clone Safety Check
- Ensure submodules are initialized before troubleshooting build issues:
- `git submodule update --init --recursive`
- Verify with `git submodule status`.

## Linux Stability Defaults
- Keep parallel jobs conservative (default set to 8 in `build.conf`).
- If machine kills linker/compiler processes, reduce jobs further.
- Enable cache when available (`ccache`) for faster retries after interruption.
