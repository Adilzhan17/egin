"""Install CI packages without allowing a slow mirror to consume the test budget.

Only network-only APT operations are retried. Package installation and tests are
never retried or ignored. Playwright supplies the package list for its locked
version, so this script does not maintain a second browser dependency manifest.
"""
import argparse
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time

MIRRORS = ("https://archive.ubuntu.com/ubuntu", "https://azure.archive.ubuntu.com/ubuntu")
NETWORK_BUDGET = 210
PACKAGE = re.compile(r"[a-z0-9][a-z0-9+.-]*(?::[a-z0-9]+)?\Z")


def missing_packages(result):
    """Parse the pinned Playwright CLI's dry-run report; never execute its text."""
    output = result.stdout.strip()
    if result.returncode == 0 and output == "All system dependencies are installed.":
        return []
    match = re.fullmatch(r"Missing system dependencies \((\d+)\):\s*\n(.+)", output, re.S)
    if result.returncode != 1 or not match:
        raise RuntimeError(f"Unexpected Playwright dependency report:\n{output}\n{result.stderr}")
    packages = match[2].split()
    if len(packages) != int(match[1]) or not all(PACKAGE.fullmatch(p) for p in packages):
        raise RuntimeError("Invalid package list in Playwright dependency report")
    return packages


def write_config(directory, mirror):
    directory = Path(directory)
    directory.chmod(0o755)  # APT's unprivileged downloader must traverse this directory.
    lists = directory / "lists"
    lists.mkdir(exist_ok=True, mode=0o755)
    sources = directory / "ubuntu.list"
    sources.write_text("".join(
        f"deb [signed-by=/usr/share/keyrings/ubuntu-archive-keyring.gpg] {mirror} {suite} main restricted universe multiverse\n"
        for suite in ("noble", "noble-updates", "noble-security", "noble-backports")
    ), encoding="utf-8")
    config = directory / "apt.conf"
    config.write_text(f'''Acquire::Retries "1";
Acquire::http::Timeout "20";
Acquire::https::Timeout "20";
APT::Update::Error-Mode "any";
Dir::Etc::sourcelist "{sources.as_posix()}";
Dir::Etc::sourceparts "-";
Dir::State::lists "{lists.as_posix()}";
''', encoding="utf-8")
    return config


def install(directory, media=False, run=subprocess.run, clock=time.monotonic, mirrors=MIRRORS):
    for mirror in mirrors:
        print(f"::group::CI dependencies: {mirror}", flush=True)
        config = write_config(directory, mirror)
        env = dict(os.environ, APT_CONFIG=str(config), DEBIAN_FRONTEND="noninteractive")
        deadline = clock() + NETWORK_BUDGET

        def fetch(args, maximum):
            remaining = min(maximum, int(deadline - clock()))
            if remaining <= 0:
                return False
            # timeout runs as root and terminates APT's download workers as a group.
            # No dpkg process is running during update or --download-only.
            command = ["sudo", "-n", "timeout", "--kill-after=10s", f"{remaining}s",
                       "apt-get", "-c", str(config), *args]
            return run(command, env=env, check=False).returncode == 0

        if not fetch(["update"], 60):
            print("::warning::APT index download failed or exceeded its budget; trying the next mirror.", flush=True)
            print("::endgroup::", flush=True)
            continue
        report = run(["node", "apps/mobile/node_modules/@playwright/test/cli.js", "install-deps",
                      "--dry-run", "chromium", "webkit"], env=env, text=True,
                     capture_output=True, check=False, timeout=30)
        packages = missing_packages(report)
        if media:
            packages = sorted(set(packages) | {"ffmpeg", "qpdf"})
        if not packages:
            print("All required system packages are already installed.\n::endgroup::", flush=True)
            return
        options = ["install", "-y", "--no-install-recommends", "--no-remove"]
        if not fetch([*options, "--download-only", *packages], 180):
            print("::warning::APT package download failed or exceeded its budget; trying the next mirror.", flush=True)
            print("::endgroup::", flush=True)
            continue
        # All archives have been fetched and authenticated. This phase must not
        # access the network, be interrupted by our download timer, or be retried.
        run(["sudo", "-n", "env", "DEBIAN_FRONTEND=noninteractive", "apt-get", "-c", str(config),
             *options, "--no-download", *packages], check=True)
        print("::endgroup::", flush=True)
        return
    raise RuntimeError("Both Ubuntu mirrors failed within the bounded download budgets; browser tests were not run.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--media", action="store_true", help="Also install ffmpeg and qpdf")
    args = parser.parse_args()
    if os.environ.get("GITHUB_ACTIONS") != "true":
        raise RuntimeError("This installer is only for disposable GitHub Actions runners")
    if 'VERSION_ID="24.04"' not in Path("/etc/os-release").read_text():
        raise RuntimeError("Use the pinned ubuntu-24.04 runner for these dependencies")
    # APT creates root/_apt-owned files here. Let the disposable runner clean its
    # temp directory; unprivileged TemporaryDirectory cleanup would fail on them.
    directory = tempfile.mkdtemp(prefix="egin-ci-apt-", dir=os.environ["RUNNER_TEMP"])
    install(directory, args.media)


if __name__ == "__main__":
    main()
