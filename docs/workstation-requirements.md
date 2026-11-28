# Workstation target list

`orca vm env doctor` checks the machine against a JSON target list. The file is read from
`--requirements <file>`, else `$ORCA_WORKSTATION_REQUIREMENTS`, else
`~/.orca/workstation-requirements.json`. Without a file the group is skipped. Contents for a
specific organization belong in that organization's own file, not in this repo.

```json
{
  "requirements": [
    { "id": "node", "kind": "command", "command": "node", "minVersion": "20" },
    { "id": "uv", "kind": "command", "command": "uv" },
    {
      "id": "marketplace",
      "kind": "claude-marketplace",
      "name": "my-marketplace",
      "fix": ["claude", "plugin", "marketplace", "add", "my-org/my-marketplace"]
    },
    {
      "id": "plugin-core",
      "kind": "claude-plugin",
      "name": "my-plugin",
      "fix": ["claude", "plugin", "install", "my-plugin@my-marketplace"]
    },
    { "id": "dotnet-tools", "kind": "path-entry", "entry": "~/.dotnet/tools" }
  ]
}
```

Kinds: `command` (on PATH, optional `minVersion` via `--version`), `claude-marketplace` and
`claude-plugin` (name appears in `claude plugin marketplace list` / `claude plugin list`),
`path-entry` (PATH contains the folder; `~` expands).

Each entry becomes a check `workstation.<id>`: `pass`, `fail` (missing), or `skip` (not
verifiable here, for example no `claude` CLI to ask). Foreign hooks in `~/.claude/settings.json`
are reported as `info` (`workstation.claude-foreign-hooks`) and never fail the run.

## Safe fixes

`orca vm env doctor --fix <check-id>` runs that entry's `fix` argv, nothing else, and only if it
matches the allowlist in `src/shared/workspace-setup/environment-doctor/workstation-requirements.ts`:

- `claude plugin install <name[@marketplace]>`
- `claude plugin marketplace add <owner/repo | https://host/path>`
- `npm install -g <registry package[@version]>`
- `dotnet tool install [-g] <package> [--version <v>]`

Anything else (URLs to tarballs, local paths, credentials in URLs, shells, interactive
installers, `irm | iex`) is shown as text and never run. Sign-in and OAuth flows are out of scope.

The VM build sheet offers the same repair as a Fix button on a failed check that has one. It calls
the RPC method `environment.doctor.fix` with only the path and the check id; the host rebuilds the
command from its own list, so no argv ever comes from the client.
