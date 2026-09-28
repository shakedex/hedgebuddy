/**
 * The preview's Settings data: the bundled files, the pip command lines, and pip's own transcript. A port of
 * `hedgebuddy-tools`' settings module (crates/tools/src/app/settings.rs): PyPI first, the bundled wheel as
 * the offline fallback, and the same wheel-name parsing.
 */
import type { BundleInfo, Os } from "@/api/tools.gen";

const WHEEL_PREFIX = "hedgebuddy-";
const WHEEL_SUFFIX = "-py3-none-any.whl";


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

/** The PyPI command `pip_install` runs first (settings.rs `pip_argv` with no extra flags). */
export function pypiCommandLine(os: Os, version: string): string {
  return [...LAUNCHER[os], "-m", "pip", "install", "--upgrade", "--disable-pip-version-check", `hedgebuddy==${version}`].join(" ");
}

/** A realistic pip transcript for installing `version` from PyPI. */
export function pipSuccessOutput(version: string): string {
  return [
    `Collecting hedgebuddy==${version}`,
    `  Downloading hedgebuddy-${version}-py3-none-any.whl (20 kB)`,
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
