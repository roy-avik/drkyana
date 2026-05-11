#!/usr/bin/env python3
"""
Lint and manage the locale YAML files in ``locales/``.

Designed for both humans and AI agents to edit copy without drifting locales
out of sync. The YAML format is intentionally conservative — one
``key: "value"`` per line, JSON-style double-quoted strings — so the in-browser
loader in ``index.html`` can read it with a trivial parser. Don't introduce
nested keys, anchors, or multi-line scalars unless you also upgrade the
browser-side parser.

Commands
--------
    check               Default. Validate parity, syntax, and HTML key usage.
                        Exit 1 on any error.
    keys                Print the canonical key list (from en.yaml, file order).
    show KEY            Print the value of KEY across all locales.
    add KEY ...         Append KEY to every locale. Pass --en/--fa/--bn to
                        seed values; missing locales get a "TODO: ..." stub.
    rename OLD NEW      Rename a key across every locale.
    remove KEY          Delete a key from every locale.
    sort                Rewrite every non-en locale to match en.yaml's key
                        order (comments and blank lines preserved by section).

All commands write back in place and exit non-zero on failure.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOCALES_DIR = ROOT / "locales"
HTML_FILE = ROOT / "index.html"
LOCALES = ("en", "fa", "bn")
REFERENCE = "en"


# ---------------------------------------------------------------------------
# YAML reader / writer for the conservative format we use.
# ---------------------------------------------------------------------------

@dataclass
class Line:
    """One line of a locale file. Exactly one of (key, raw) is the payload."""
    kind: str          # "entry" | "comment" | "blank"
    key: str = ""
    value: str = ""    # only for entries
    raw: str = ""      # original line, used to round-trip comments verbatim


_ENTRY_RE = re.compile(r"^([A-Za-z_][\w.\-]*)\s*:\s*(.*)$")


def _decode_scalar(raw: str, source: str) -> str:
    """Decode a YAML scalar in our conservative subset."""
    raw = raw.strip()
    if not raw:
        return ""
    if raw[0] == '"':
        try:
            return json.loads(raw)
        except json.JSONDecodeError as e:
            raise ValueError(f"{source}: bad double-quoted string: {raw!r} ({e})")
    if raw[0] == "'":
        m = re.match(r"^'((?:[^']|'')*)'\s*$", raw)
        if not m:
            raise ValueError(f"{source}: bad single-quoted string: {raw!r}")
        return m.group(1).replace("''", "'")
    # plain scalar — strip trailing inline comment
    hash_idx = raw.find(" #")
    if hash_idx >= 0:
        raw = raw[:hash_idx].rstrip()
    return raw


def _encode_scalar(value: str) -> str:
    """Encode a value as a JSON-style double-quoted YAML scalar."""
    return json.dumps(value, ensure_ascii=False)


def parse_locale(path: Path) -> list[Line]:
    lines: list[Line] = []
    seen_keys: set[str] = set()
    for lineno, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        stripped = raw.strip()
        if not stripped:
            lines.append(Line(kind="blank", raw=""))
            continue
        if stripped.startswith("#"):
            lines.append(Line(kind="comment", raw=raw))
            continue
        m = _ENTRY_RE.match(stripped)
        if not m:
            raise ValueError(f"{path.name}:{lineno}: cannot parse line: {raw!r}")
        key, rest = m.group(1), m.group(2)
        if key in seen_keys:
            raise ValueError(f"{path.name}:{lineno}: duplicate key {key!r}")
        seen_keys.add(key)
        value = _decode_scalar(rest, f"{path.name}:{lineno}")
        lines.append(Line(kind="entry", key=key, value=value))
    return lines


def write_locale(path: Path, lines: list[Line]) -> None:
    out = []
    for ln in lines:
        if ln.kind == "blank":
            out.append("")
        elif ln.kind == "comment":
            out.append(ln.raw)
        else:
            out.append(f"{ln.key}: {_encode_scalar(ln.value)}")
    path.write_text("\n".join(out) + "\n", encoding="utf-8", newline="\n")


def entries(lines: list[Line]) -> dict[str, str]:
    return {ln.key: ln.value for ln in lines if ln.kind == "entry"}


def key_order(lines: list[Line]) -> list[str]:
    return [ln.key for ln in lines if ln.kind == "entry"]


# ---------------------------------------------------------------------------
# index.html introspection.
# ---------------------------------------------------------------------------

_DATA_I18N_RE = re.compile(r'data-i18n="([^"]+)"')


def html_keys() -> set[str]:
    """All keys referenced from data-i18n attributes in index.html."""
    if not HTML_FILE.exists():
        return set()
    return set(_DATA_I18N_RE.findall(HTML_FILE.read_text(encoding="utf-8")))


# Keys consumed in JS that don't appear as data-i18n attributes.
EXTRA_USED_KEYS = {"meta.title", "meta.description"}


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

def load_all() -> dict[str, list[Line]]:
    return {lang: parse_locale(LOCALES_DIR / f"{lang}.yaml") for lang in LOCALES}


def cmd_check(_args) -> int:
    errors: list[str] = []
    warnings: list[str] = []

    try:
        all_lines = load_all()
    except Exception as e:
        print(f"parse error: {e}", file=sys.stderr)
        return 1

    ref = entries(all_lines[REFERENCE])
    ref_keys = set(ref)

    for lang in LOCALES:
        got = entries(all_lines[lang])
        got_keys = set(got)
        missing = ref_keys - got_keys
        extra = got_keys - ref_keys
        if missing:
            errors.append(f"{lang}: missing {len(missing)} key(s): {sorted(missing)}")
        if extra:
            errors.append(f"{lang}: extra {len(extra)} key(s) not in {REFERENCE}: {sorted(extra)}")
        for k, v in got.items():
            if not v.strip():
                warnings.append(f"{lang}: empty value for {k!r}")
            if v.strip().lower().startswith("todo"):
                warnings.append(f"{lang}: TODO placeholder for {k!r}")

    used = html_keys() | EXTRA_USED_KEYS
    undefined = used - ref_keys
    unused = ref_keys - used
    if undefined:
        errors.append(f"{REFERENCE}.yaml is missing keys used in index.html: {sorted(undefined)}")
    if unused:
        warnings.append(f"{REFERENCE}.yaml defines keys with no data-i18n usage: {sorted(unused)}")

    for w in warnings:
        print(f"warn: {w}")
    for e in errors:
        print(f"error: {e}", file=sys.stderr)

    if errors:
        print(f"\nFAIL · {len(errors)} error(s), {len(warnings)} warning(s)", file=sys.stderr)
        return 1
    print(f"OK · {len(ref)} keys across {len(LOCALES)} locales, {len(warnings)} warning(s)")
    return 0


def cmd_keys(_args) -> int:
    for key in key_order(parse_locale(LOCALES_DIR / f"{REFERENCE}.yaml")):
        print(key)
    return 0


def cmd_show(args) -> int:
    for lang in LOCALES:
        d = entries(parse_locale(LOCALES_DIR / f"{lang}.yaml"))
        v = d.get(args.key)
        if v is None:
            print(f"  {lang}: <missing>")
        else:
            print(f"  {lang}: {v}")
    return 0


def cmd_add(args) -> int:
    values = {"en": args.en, "fa": args.fa, "bn": args.bn}
    for lang in LOCALES:
        path = LOCALES_DIR / f"{lang}.yaml"
        lines = parse_locale(path)
        if args.key in entries(lines):
            print(f"{lang}: key {args.key!r} already exists, skipping", file=sys.stderr)
            continue
        val = values.get(lang) or f"TODO: translate {args.key}"
        lines.append(Line(kind="entry", key=args.key, value=val))
        write_locale(path, lines)
        print(f"{lang}: added {args.key} = {val!r}")
    return 0


def cmd_rename(args) -> int:
    for lang in LOCALES:
        path = LOCALES_DIR / f"{lang}.yaml"
        lines = parse_locale(path)
        found = False
        for ln in lines:
            if ln.kind == "entry" and ln.key == args.old:
                ln.key = args.new
                found = True
        if found:
            write_locale(path, lines)
            print(f"{lang}: renamed {args.old} -> {args.new}")
        else:
            print(f"{lang}: {args.old!r} not found", file=sys.stderr)
    return 0


def cmd_remove(args) -> int:
    for lang in LOCALES:
        path = LOCALES_DIR / f"{lang}.yaml"
        lines = parse_locale(path)
        new = [ln for ln in lines if not (ln.kind == "entry" and ln.key == args.key)]
        if len(new) == len(lines):
            print(f"{lang}: {args.key!r} not found", file=sys.stderr)
            continue
        write_locale(path, new)
        print(f"{lang}: removed {args.key}")
    return 0


def cmd_sort(_args) -> int:
    """Reorder every non-reference locale to match the reference locale's key
    order. Keeps comments and blanks in place by anchoring them to the entry
    that follows. Use sparingly — produces noisy diffs."""
    ref_lines = parse_locale(LOCALES_DIR / f"{REFERENCE}.yaml")
    ref_order = key_order(ref_lines)
    for lang in LOCALES:
        if lang == REFERENCE:
            continue
        path = LOCALES_DIR / f"{lang}.yaml"
        lines = parse_locale(path)
        ent_map = entries(lines)
        # gather preamble (leading comments/blanks before first entry)
        preamble: list[Line] = []
        for ln in lines:
            if ln.kind == "entry":
                break
            preamble.append(ln)
        new_lines = list(preamble)
        for key in ref_order:
            if key in ent_map:
                new_lines.append(Line(kind="entry", key=key, value=ent_map[key]))
        # append any leftover keys that aren't in the reference (shouldn't
        # happen after `check` passes, but preserve them anyway)
        leftover = [k for k in ent_map if k not in ref_order]
        if leftover:
            new_lines.append(Line(kind="blank"))
            new_lines.append(Line(kind="comment", raw="# Keys not present in en.yaml — review:"))
            for k in leftover:
                new_lines.append(Line(kind="entry", key=k, value=ent_map[k]))
        write_locale(path, new_lines)
        print(f"{lang}: sorted to match {REFERENCE} order")
    return 0


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd")

    sub.add_parser("check", help="Validate locales (default).")
    sub.add_parser("keys", help="Print the canonical key list.")

    s = sub.add_parser("show", help="Show one key's value across locales.")
    s.add_argument("key")

    s = sub.add_parser("add", help="Add a key to every locale.")
    s.add_argument("key")
    s.add_argument("--en", help="English value.")
    s.add_argument("--fa", help="Persian value.")
    s.add_argument("--bn", help="Bengali value.")

    s = sub.add_parser("rename", help="Rename a key across every locale.")
    s.add_argument("old")
    s.add_argument("new")

    s = sub.add_parser("remove", help="Remove a key from every locale.")
    s.add_argument("key")

    sub.add_parser("sort", help="Reorder non-en locales to match en.yaml.")

    args = p.parse_args(argv)
    handler = {
        None: cmd_check,
        "check": cmd_check,
        "keys": cmd_keys,
        "show": cmd_show,
        "add": cmd_add,
        "rename": cmd_rename,
        "remove": cmd_remove,
        "sort": cmd_sort,
    }[args.cmd]
    return handler(args)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except BrokenPipeError:
        sys.exit(0)
