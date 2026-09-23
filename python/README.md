# hedgebuddy

The Python side of [HedgeBuddy](https://github.com/shakedex/hedgebuddy). Hedge apps (OffShoot, FoolCat, EditReady, Canister) run a Python script when something happens, such as a copy finishing. This package gives that script:
- its typed variables from the active HedgeBuddy profile;
- the event payload;
- a run record, so HedgeBuddy can show what happened.

Pure Python, no dependencies, Python 3.9+.

## Install

Install it for the Python the Hedge apps use:

```bash
py -3 -m pip install hedgebuddy        # Windows
python3 -m pip install hedgebuddy      # macOS
```

HedgeBuddy's `check_script` tool tells you when it is missing.

## A script

```python
"""
{"hedgebuddy": 1,
 "app": "offshoot",
 "event": "FileCopyCompleted",
 "requires": {
   "SLACK_WEBHOOK": {"type": "secret", "description": "Incoming webhook URL"},
   "PROJECT_NAME":  {"type": "string", "default": "Untitled"}
 }}
---
Posts a summary to Slack after each card finishes.
"""
import json
import urllib.request

import hedgebuddy as hb


@hb.script
def main(event, vars):
    if event.state != "Success":
        hb.log(f"copy failed: {event.state}")
        return 1
    text = f"{vars.PROJECT_NAME}: {event.destinationPath} is done"
    body = json.dumps({"text": text}).encode()
    request = urllib.request.Request(vars.SLACK_WEBHOOK, body, {"Content-Type": "application/json"})
    urllib.request.urlopen(request, timeout=10)
    hb.log("posted to slack")
```

### The manifest

The JSON at the top of the docstring, ended by a `---` line, tells HedgeBuddy three things:
- which app and event the script handles;
- which variables it needs;
- the type of each variable.

A variable with a `default` is optional. HedgeBuddy uses the manifest to attach the script to the right event and to check the profile before it runs. The types are `string`, `secret`, `int`, `float`, `bool`, `path`, `url`, `string[]` and `path[]`.

### `@hb.script`

When Hedge runs the file, the decorator does the following, in order:
1. Finds the active profile.
2. Starts a run record.
3. Checks every required variable. If one is missing or has the wrong type, it stops and names it.
4. Parses the event.
5. Calls `main(event, vars)`.
6. Records the result and exits with `main`'s return value.

`None` means success. A non-zero number means the run failed. An uncaught exception is recorded with its traceback. When the file is imported rather than run, for example by a test, the decorator returns `main` unchanged.

Put imports and helper functions above the decorated `main`, and keep `main` last in the file: the decorator runs it as soon as it is defined, so code below it has not run yet.

### `vars`

`vars.NAME` or `vars["NAME"]` returns the value in its Python type:

| Type | Python value |
|---|---|
| `path` | `pathlib.Path` |
| `path[]` | list of `Path` |
| `int` | `int` |
| `float` | `float` |
| `bool` | `bool` |
| `string[]` | list of `str` |
| `string`, `secret`, `url` | `str` |

Secrets come from the profile's secrets file. `vars.get("NAME", default)` and `"NAME" in vars` work too.

### `event`

The payload's keys, without the `<EventName>_` prefix: `event.state`, `event.destinationPath`. A value that holds a JSON object or array is decoded for you. Other attributes:
- `event.raw` is the original payload.
- `event.app` and `event.name` identify the event.

A field that shares a name with one of these attributes is read with `event["name"]`.

## Other helpers

| Call | What it does |
|---|---|
| `hb.var("NAME", default=...)` | One variable of the active profile. The default applies only when the variable is missing. |
| `hb.exists("NAME")` | Whether the variable has a value. |
| `hb.all_vars()` | Every variable with a value, typed. |
| `hb.inject_env(overwrite=False)` | Copies every variable into `os.environ` as text. Bools become `1` or `0`, and lists are joined with `os.pathsep`. Useful when you bring a script that already reads environment variables. |
| `hb.log(message)` | Adds a line to the run record, or prints it outside a run. |
| `hb.event()` | Parses the payload in scripts that do not use `@hb.script`. |

Errors: `VariableNotFoundError`, `VariableTypeError`, `StorageNotFoundError`, `StorageCorruptedError` and `ManifestError`. They all derive from `HedgeBuddyError`.

## Trying a script by hand

Pass the payload as the first argument. Point `HEDGEBUDDY_DATA_DIR` at a test data folder if you do not want the run recorded in your real one:

```bash
py -3 on_copy_complete.py "{\"FileCopyCompleted_state\": \"Success\", \"FileCopyCompleted_destinationPath\": \"D:/Offload/A003\"}"
```
