#!/usr/bin/env python
"""Vendored thin copy of monorepo scripts/sonar-gate-wait.py (self-contained).

After sonar-scanner, read `.scannerwork/report-task.txt` for ceTaskId, wait for
CE SUCCESS, then poll quality gate by analysisId (not projectKey — avoids stale
gate from a previous analysis).

Smoke: python scripts/sonar-gate-wait.py --dry-run --project-key allure-report-kit
"""

from __future__ import annotations

import argparse
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

try:
    import certifi
except ImportError:
    certifi = None  # type: ignore[assignment]

CE_TERMINAL = frozenset({"SUCCESS", "FAILED", "CANCELED"})
GATE_TERMINAL = frozenset({"OK", "PASSED", "FAILED", "ERROR"})


def emit(result: dict, *, exit_code: int | None = None) -> None:
    print(json.dumps(result, ensure_ascii=False))
    if exit_code is not None:
        sys.exit(exit_code)
    sys.exit(0 if result.get("ok", False) else 1)


def usage_error(message: str) -> None:
    print(message, file=sys.stderr)
    emit({"ok": False, "error": message}, exit_code=2)


def ssl_context() -> ssl.SSLContext:
    if certifi is not None:
        return ssl.create_default_context(cafile=certifi.where())
    return ssl.create_default_context()


def parse_report_task(path: Path) -> dict[str, str]:
    if not path.is_file():
        raise FileNotFoundError(f"report-task not found: {path}")
    fields: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        fields[key.strip()] = value.strip()
    return fields


def api_get_json(base_url: str, api_path: str, params: dict[str, str], token: str) -> dict:
    query = urllib.parse.urlencode(params)
    url = f"{base_url.rstrip('/')}{api_path}?{query}"
    req = urllib.request.Request(url)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=30, context=ssl_context()) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_ce_task(base_url: str, ce_task_id: str, token: str) -> dict:
    payload = api_get_json(base_url, "/api/ce/task", {"id": ce_task_id}, token)
    return payload.get("task", {})


def fetch_gate_by_analysis(base_url: str, analysis_id: str, token: str) -> dict:
    payload = api_get_json(
        base_url,
        "/api/qualitygates/project_status",
        {"analysisId": analysis_id},
        token,
    )
    project_status = payload.get("projectStatus", {})
    status = project_status.get("status", "UNKNOWN")
    conditions = project_status.get("conditions", [])
    project_key = project_status.get("projectKey", "")
    return {
        "status": status,
        "conditions": conditions,
        "project_key": project_key,
        "analysis_id": analysis_id,
        "dashboard_url": (
            f"{base_url.rstrip('/')}/dashboard?id={urllib.parse.quote(project_key)}"
            if project_key
            else None
        ),
    }


def wait_for_ce_task(
    base_url: str,
    ce_task_id: str,
    token: str,
    *,
    timeout: int,
    poll: int,
) -> dict:
    deadline = time.monotonic() + timeout
    last: dict | None = None
    while time.monotonic() < deadline:
        try:
            last = fetch_ce_task(base_url, ce_task_id, token)
        except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as exc:
            last = {"status": "ERROR", "error": str(exc)}
        else:
            status = last.get("status", "UNKNOWN")
            if status in CE_TERMINAL:
                break
        time.sleep(poll)

    if last is None:
        return {"ok": False, "error": "no CE task response", "ce_task_id": ce_task_id}

    status = last.get("status", "UNKNOWN")
    if status != "SUCCESS":
        return {
            "ok": False,
            "error": f"CE task ended with status {status}",
            "ce_task_id": ce_task_id,
            "ce_status": status,
            "ce_task": last,
        }

    analysis_id = last.get("analysisId", "")
    if not analysis_id:
        return {
            "ok": False,
            "error": "CE task SUCCESS but analysisId missing",
            "ce_task_id": ce_task_id,
            "ce_task": last,
        }

    return {
        "ok": True,
        "ce_task_id": ce_task_id,
        "analysis_id": analysis_id,
        "project_key": last.get("componentKey", ""),
    }


def wait_for_gate(
    base_url: str,
    analysis_id: str,
    token: str,
    *,
    timeout: int,
    poll: int,
) -> dict:
    deadline = time.monotonic() + timeout
    last: dict | None = None
    while time.monotonic() < deadline:
        try:
            last = fetch_gate_by_analysis(base_url, analysis_id, token)
        except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as exc:
            last = {"status": "ERROR", "error": str(exc)}
        else:
            if last.get("status") in GATE_TERMINAL:
                break
        time.sleep(poll)

    if last is None:
        return {"ok": False, "error": "no quality gate response", "analysis_id": analysis_id}

    status = last.get("status", "UNKNOWN")
    passed = status in ("OK", "PASSED")
    return {
        "ok": passed,
        "status": status,
        "analysis_id": analysis_id,
        "project_key": last.get("project_key"),
        "conditions": last.get("conditions", []),
        "dashboard_url": last.get("dashboard_url"),
        "timed_out": status not in GATE_TERMINAL,
    }


def run(
    url: str,
    report_task_path: Path | None,
    project_key: str | None,
    timeout: int,
    poll: int,
    dry_run: bool,
) -> dict:
    if dry_run:
        key = project_key or "test"
        return {
            "ok": True,
            "dry_run": True,
            "status": "PASSED",
            "project_key": key,
            "url": url,
            "conditions": [],
            "dashboard_url": f"{url.rstrip('/')}/dashboard?id={key}",
        }

    if report_task_path is None:
        return {
            "ok": False,
            "error": "--report-task is required (or use --dry-run for local smoke)",
        }

    token = os.environ.get("SONAR_TOKEN", "")
    if not token:
        return {
            "ok": False,
            "error": "SONAR_TOKEN not set (use --dry-run for local smoke)",
        }

    try:
        report = parse_report_task(report_task_path)
    except OSError as exc:
        return {"ok": False, "error": str(exc)}

    ce_task_id = report.get("ceTaskId", "")
    if not ce_task_id:
        return {
            "ok": False,
            "error": "ceTaskId missing in report-task.txt",
            "report_task": str(report_task_path),
        }

    base_url = report.get("serverUrl") or url
    report_project_key = report.get("projectKey", "")
    if project_key and report_project_key and project_key != report_project_key:
        return {
            "ok": False,
            "error": (
                f"project-key mismatch: argv={project_key!r} report-task={report_project_key!r}"
            ),
        }
    effective_project_key = project_key or report_project_key

    ce_result = wait_for_ce_task(
        base_url,
        ce_task_id,
        token,
        timeout=timeout,
        poll=poll,
    )
    if not ce_result.get("ok"):
        return ce_result

    analysis_id = ce_result["analysis_id"]
    gate_result = wait_for_gate(
        base_url,
        analysis_id,
        token,
        timeout=timeout,
        poll=poll,
    )
    gate_result["ce_task_id"] = ce_task_id
    gate_result["report_task"] = str(report_task_path)
    if effective_project_key:
        gate_result.setdefault("project_key", effective_project_key)
    return gate_result


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description="Wait for Sonar CE task from report-task.txt, then poll quality gate by analysisId.",
    )
    parser.add_argument("--url", default="https://sonar.qa.guru")
    parser.add_argument(
        "--report-task",
        type=Path,
        help="Path to .scannerwork/report-task.txt from the current scan",
    )
    parser.add_argument(
        "--project-key",
        help="Optional validation against projectKey in report-task.txt",
    )
    parser.add_argument("--timeout", type=int, default=600)
    parser.add_argument("--poll", type=int, default=15)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    if not args.dry_run and args.report_task is None:
        usage_error("--report-task is required unless --dry-run")

    result = run(
        args.url,
        args.report_task,
        args.project_key,
        args.timeout,
        args.poll,
        args.dry_run,
    )
    emit(result)


if __name__ == "__main__":
    main()
