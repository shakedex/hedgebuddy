# Hedge app catalog

One TOML file per Hedge app. HedgeBuddy embeds these files; a file with the
same name in `<data dir>/catalog/` replaces the embedded one, and a new file
adds an app. When Hedge changes an app, edit the data here, not the code.

| Section | Meaning |
|---|---|
| `catalog_version` | Always `1`. |
| `tested_against` | App version these facts were checked against. HedgeBuddy warns when the installed app is newer. |
| `[app]` | `id` (the file name), display `name`, URL `scheme`, `requires_pro`, `docs` link. |
| `[detect.windows]` | `registry_key` that exists when installed, `version_value` read from it. |
| `[detect.macos]` | `app_path` of the bundle, optional `bundle_id` to confirm it. |
| `[scripting.<os>]` | How scripts are attached: `registry` (`key`, `enable_value`, `value_pattern` with `{registry_name}`), `helper_workspace` (`workspace_dir`, `workspace_file`, `enable_pref`, `pref_pattern` with `{pref_name}`), or `manual` (`note`). Missing = not possible. |
| `[[events]]` | `id`, `description`, `registry_name` / `pref_name` (missing = cannot be attached on that platform), `payload` (exact keys the script receives in `sys.argv[1]`), `json_fields` (keys whose value is JSON inside a string). |
| `[[commands]]` | `id`, `description`, `form` (`url` = `scheme://id?k=v`, `action` = batched into `scheme://actions?json=[...]`), `params` (`string`, `path`, `path[]`, `int`, `bool`, `json`; `?` = optional), `platforms`, `confirm` (ask the operator first), `list_separator` for `path[]` in URLs (default: JSON array). |
| `[files.<os>]` | `callback_log` (URL-scheme responses) and `event_log`. `%VAR%` and `~` are expanded. |
| `[presets.<os>]` | Preset folder `dir`, and the registry `location_override_value` / `selected_value` under `registry_key`. |

Lines marked `# unverified` are inferred; confirm them on a real machine and remove the marker.
