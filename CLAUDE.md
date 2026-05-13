# CLAUDE.md

All project conventions are defined in [AGENTS.md](AGENTS.md).
Read AGENTS.md before making any changes.

---

## Claude Code — Additional Notes

- Response language: match the user's language (German or English as written).
- Code, comments, and Markdown files are always in **English** (see AGENTS.md).
- Prefer the `Edit` tool over `Write` for existing files.
- Run `terraform fmt` after editing any `.tf` file.
- Do not spawn sub-agents for tasks that fit in the current context window.
