#!/usr/bin/env python3
"""Redacted, offline publication preflight; no third-party packages required.

Run: python3 scripts/check-publication.py
With Git: inspect tracked/untracked publication candidates and the current index;
reject excluded/private paths already tracked, even if force-added.
Without Git: inspect working files. --root supports checks in a temporary fixture.

This is a heuristic, not a guarantee: it does not inspect remote repositories,
commit history, binary metadata, or asset rights. Review the actual public diff
and history separately before publishing. Never include detected values in output.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys


EXCLUDED_DIRS = {
    ".git", "node_modules", "dist", ".local", ".private", ".operator",
    "operator-logs", "__pycache__",
}
ENV_EXAMPLES = {".env.example", ".env.sample"}
SENSITIVE_NAMES = {
    "id_rsa", "id_ed25519", ".netrc", "credentials.json", "service-account.json",
}
SENSITIVE_SUFFIXES = {".pem", ".key", ".p12", ".pfx"}
PATTERNS = {
    "private_key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----"),
    "credential_token": re.compile(
        r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b|"
        r"\bgh[pousr]_[A-Za-z0-9_]{20,}\b|"
        r"\bgithub_pat_[A-Za-z0-9_]{20,}\b|"
        r"\bsk-[A-Za-z0-9_-]{20,}\b|"
        r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b|"
        r"\bAIza[0-9A-Za-z_-]{30,}\b|"
        r"\b[rs]k_live_[A-Za-z0-9]{16,}\b"
    ),
    "personal_path": re.compile(r"/(?:Users|home)/[^/\s]+|[A-Za-z]:\\Users\\[^\\\s]+"),
    "personal_email": re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
    "private_service_url": re.compile(
        r"https?://(?:app\.todoist\.com|(?:[\w-]+\.)?slack\.com|"
        r"(?:[\w-]+\.)?backlog\.(?:com|jp)|(?:www\.)?notion\.so|"
        r"(?:drive|docs)\.google\.com|app\.kiro\.dev)(?:[/\s?#]|$)", re.I
    ),
    "url_credentials": re.compile(r"https?://[^\s/:]+:[^\s/@]+@"),
    "credential_query": re.compile(
        r"[?&](?:token|api_key|secret|signature|access_token)=[A-Za-z0-9_%+-]{8,}", re.I
    ),
}
CREDENTIAL_NAME = r"(?:api[_-]?key|access[_-]?token|client[_-]?secret|password|passwd|secret[_-]?(?:access[_-]?)?key|_authToken|authorization)"
QUOTED_ASSIGNMENT = re.compile(
    CREDENTIAL_NAME + r"[\"']?\s*[:=]\s*[\"']([^\"'\r\n]{6,})[\"']", re.I
)
ENV_ASSIGNMENT = re.compile(
    r"^\s*(?:export\s+)?[A-Z0-9_]*(?:API_KEY|ACCESS_KEY|ACCESS_KEY_ID|PRIVATE_KEY|TOKEN|SECRET|PASSWORD|PASSWD|AUTH_TOKEN)\s*=\s*([^\s#]+)", re.I
)
PLACEHOLDER = re.compile(
    r"^(?:example|placeholder|redacted|replace[_-]?me|changeme|your[_-].*|<[^>]+>|\$\{[^}]+\})$", re.I
)


def git(root: Path, *args: str) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(["git", "-C", str(root), *args], capture_output=True, check=False)


def excluded(relative: Path) -> bool:
    return any(part in EXCLUDED_DIRS for part in relative.parts) or relative.name == ".DS_Store"


def candidates(root: Path) -> tuple[list[Path], list[Path], str]:
    try:
        top = git(root, "rev-parse", "--show-toplevel")
    except FileNotFoundError:
        top = None
    if top is not None and top.returncode == 0 and Path(os.fsdecode(top.stdout).strip()).resolve() == root:
        files = git(root, "ls-files", "-z", "--cached", "--others", "--exclude-standard")
        index = git(root, "ls-files", "-z", "--cached")
        if files.returncode or index.returncode:
            raise RuntimeError("git_inventory_failed")
        decode = lambda output: sorted({Path(os.fsdecode(p)) for p in output.split(b"\0") if p})
        return decode(files.stdout), decode(index.stdout), "working_files_and_git_index"

    files = []
    for directory, directories, names in os.walk(root, followlinks=False):
        base = Path(directory)
        for name in list(directories):
            p = base / name
            if name in EXCLUDED_DIRS:
                directories.remove(name)
            elif p.is_symlink():
                files.append(p.relative_to(root))
                directories.remove(name)
        files.extend((base / name).relative_to(root) for name in names)
    return sorted(files), [], "working_files_only_no_git"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent)
    args = parser.parse_args()
    root = args.root.resolve()
    if not root.is_dir():
        print(json.dumps({"type": "scan_root_missing"}))
        return 2

    findings: set[tuple[str, int, str]] = set()
    inspected = 0
    binary_skipped = 0

    def add(path: Path, line: int, kind: str, source: str = "") -> None:
        findings.add((path.as_posix(), line, source + kind))

    def inspect(path: Path, raw: bytes, source: str = "") -> None:
        nonlocal inspected, binary_skipped
        inspected += 1
        name = path.name.lower()
        if (name == ".env" or name.startswith(".env.")) and name not in ENV_EXAMPLES:
            add(path, 1, "environment_file", source)
        if name in SENSITIVE_NAMES or path.suffix.lower() in SENSITIVE_SUFFIXES:
            add(path, 1, "credential_file", source)
        if b"\x00" in raw[:8192]:
            binary_skipped += 1
            return
        try:
            content = raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            binary_skipped += 1
            return
        for number, line in enumerate(content.splitlines(), 1):
            for kind, pattern in PATTERNS.items():
                if pattern.search(line):
                    add(path, number, kind, source)
            for pattern in (QUOTED_ASSIGNMENT, ENV_ASSIGNMENT):
                for match in pattern.finditer(line):
                    value = match.group(1).strip("\"'")
                    if not PLACEHOLDER.fullmatch(value):
                        add(path, number, "credential_assignment", source)

    try:
        working, indexed, mode = candidates(root)
    except (OSError, RuntimeError):
        print(json.dumps({"type": "file_inventory_failed"}))
        return 2

    for path in working:
        if excluded(path):
            continue
        full = root / path
        try:
            if full.is_symlink():
                target = os.readlink(full)
                if not full.resolve().is_relative_to(root):
                    add(path, 1, "external_symlink")
                inspect(path, os.fsencode(target))
            elif full.is_file():
                inspect(path, full.read_bytes())
        except OSError:
            add(path, 1, "unreadable_file")

    # Check index blobs as well: a clean local edit must not hide an older,
    # staged secret. Ignore rules do not protect files already in the index:
    # fail on excluded/private paths without loading potentially huge blobs.
    # This still does not replace a commit-history scan.
    for path in indexed:
        if excluded(path) or any(part in {".aws", ".ssh"} for part in path.parts):
            add(path, 1, "index:tracked_excluded_path")
            continue
        blob = git(root, "show", ":" + path.as_posix())
        if blob.returncode:
            add(path, 1, "index_unreadable")
        else:
            inspect(path, blob.stdout, "index:")

    for path, line, kind in sorted(findings):
        print(json.dumps({"file": path, "line": line, "type": kind}, ensure_ascii=False))
    print(json.dumps({
        "result": "FAIL" if findings else "PASS",
        "mode": mode,
        "inspected": inspected,
        "binary_files_not_scanned": binary_skipped,
        "findings": len(findings),
        "limit": "Heuristic only; excluded working content is skipped, but tracked excluded paths fail; no history, remote, binary metadata or asset-rights audit.",
    }))
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
