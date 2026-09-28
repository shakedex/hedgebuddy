/**
 * The preview's Settings data: the bundled files, the pip command line, and pip's own transcript. A port of
 * `hedgebuddy-tools`' settings module (crates/tools/src/app/settings.rs): the same command line (offline,
 * quoted per platform) and the same wheel-name parsing.
 */
import type { BundleInfo, Os } from "@/api/tools.gen";
import { shellQuote } from "./claudeDesktop";

const WHEEL_PREFIX = "hedgebuddy-";
const WHEEL_SUFFIX = "-py3-none-any.whl";

/** Why a build with no bundled wheel can't install it (settings.rs `NO_WHEEL`). */
export const NO_WHEEL = "this build has no bundled package";

/** `?prefserror=1`: `preferences.json` can't be read, in the shape `preferences.rs`'s own read failures take
 *  (a JSON syntax error), so Settings' Editor command panel can be checked with `preferences_error` set. */
export const PREFS_ERROR = "cannot read preferences.json: invalid JSON at line 1";

/** `launcher(os)` (python_env.rs): fixed per platform, independent of the interpreter actually found. */
const LAUNCHER: Record<Os, string[]> = { windows: ["py", "-3"], macos: ["python3"] };

/** The version in a wheel's file name (`hedgebuddy-<version>-py3-none-any.whl`), or null when it isn't
 *  shaped like one (settings.rs `parse_wheel_version`). */
export function parseWheelVersion(path: string): string | null {
  const name = path.split(/[\\/]/).pop() ?? path;
  if (!name.startsWith(WHEEL_PREFIX) || !name.endsWith(WHEEL_SUFFIX)) return null;
  const version = name.slice(WHEEL_PREFIX.length, -WHEEL_SUFFIX.length);
  return version === "" ? null : version;
}

/** `bundle_info`: the paths a scenario ships with, plus the wheel's parsed version. */
export function bundleInfo(binary: string | null, wheel: string | null): BundleInfo {
  return { binary, wheel, wheel_version: wheel === null ? null : parseWheelVersion(wheel) };
}

/** The argv `pip_install` runs: the platform's launcher, pip's own arguments (offline, without pip's version
 *  nag), then the wheel path (settings.rs `pip_argv`). */
export function pipArgv(os: Os, wheel: string): string[] {
  return [...LAUNCHER[os], "-m", "pip", "install", "--upgrade", "--no-index", "--disable-pip-version-check", wheel];
}

/** `pipArgv`, as the operator would type it: the wheel path quoted for a shell on `os` (settings.rs
 *  `pip_command_line`) — only ever shown or copied, never run this way. */
export function pipCommandLine(os: Os, wheel: string): string {
  const argv = pipArgv(os, wheel);
  argv[argv.length - 1] = shellQuote(os, wheel);
  return argv.join(" ");
}

/** A realistic pip transcript for installing `wheel` as `version`. */
export function pipSuccessOutput(wheel: string, version: string): string {
  return [
    `Processing ${wheel}`,
    "Installing collected packages: hedgebuddy",
    `Successfully installed hedgebuddy-${version}`,
  ].join("\n");
}

/** A PEP 668 ("externally managed environment") failure, as a Debian-patched pip reports it: forced with
 *  `?pipfail=1` regardless of scenario. */
export const PIP_FAIL_OUTPUT = [
  "error: externally-managed-environment",
  "",
  "× This environment is externally managed",
  "╰─> To install Python packages system-wide, try 'pacman -S",
  "    python-xyz', where xyz is the package you are trying to",
  "    install.",
  "",
  "    If you wish to install a non-Debian-packaged Python package,",
  "    create a virtual environment using 'python3 -m venv path/to/venv'.",
  "    Make sure you have python3-full installed.",
  "",
  "    If you wish to install a non-Debian packaged Python application,",
  "    it may be easiest to use 'pipx install xyz', which will manage a",
  "    virtual environment for you. Make sure you have pipx installed.",
  "",
  "note: If you believe this is a mistake, please contact your Python installation or OS distribution provider. " +
    "You can override this, at the risk of breaking your Python installation or OS, by passing --break-system-packages.",
  "hint: See PEP 668 for the detailed specification.",
].join("\n");
