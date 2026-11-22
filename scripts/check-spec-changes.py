#!/usr/bin/env python3
"""Bind a PR's behavior diff to Spec Kit requirements and runnable acceptance tests."""
import argparse
import ast
import json
import os
import re
import subprocess
import sys
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]


def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args], text=True).strip()


def behavior(path):
    p = PurePosixPath(path)
    return not (path.startswith(('docs/', 'specs/', 'backend/tests/', 'tests/', 'scripts/tests/', 'deployment/tests/'))
                or '__tests__' in p.parts or p.suffix.lower() in {'.md', '.rst'}
                or re.search(r'\.(test|spec)\.[cm]?[jt]sx?$', path))


def safe_path(path):
    return isinstance(path, str) and bool(path) and not path.startswith(('/', '-')) and '..' not in PurePosixPath(path).parts and '\\' not in path and '\n' not in path


def acceptance(root, selector, changed):
    if not isinstance(selector, str) or '::' not in selector:
        raise ValueError('Acceptance test must use path::named_test')
    path, name = selector.split('::', 1)
    if not safe_path(path) or not name or len(name) > 300 or '\n' in name or path not in changed:
        raise ValueError('Acceptance test must be a changed, named test in this PR')
    content = (root / path).read_text()
    if path.endswith('.py') and path.startswith(('scripts/tests/test_', 'deployment/tests/test_', 'backend/tests/')):
        parts = name.split('.')
        if not all(re.fullmatch(r'[A-Za-z_]\w*', part) for part in parts) or not parts[-1].startswith('test_'):
            raise ValueError('Invalid Python acceptance selector')
        if not path.startswith('backend/tests/') and len(parts) != 2:
            raise ValueError('Unittest acceptance must name Class.test_method')
        scope = ast.parse(content)
        for part in parts:
            scope = next((n for n in scope.body if isinstance(n, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == part), None)
            if scope is None:
                raise ValueError('Named acceptance test does not exist')
        if not isinstance(scope, (ast.FunctionDef, ast.AsyncFunctionDef)) or not any(isinstance(n, ast.Assert) or isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr.startswith('assert') for n in ast.walk(scope)):
            raise ValueError('Acceptance test must contain an assertion')
        return {'runner': 'pytest' if path.startswith('backend/tests/') else 'unittest', 'path': path, 'name': name}
    if path.startswith('frontend/') and re.search(r'\.(test|spec)\.[jt]sx?$', path):
        matches = list(re.finditer(r'\b(?:it|test)\s*\(\s*([\'\"])(.*?)\1\s*,', content))
        for index, match in enumerate(matches):
            end = matches[index+1].start() if index+1 < len(matches) else len(content)
            if match.group(2) == name and re.search(r'\bexpect\s*\(', content[match.end():end]):
                return {'runner': 'vitest', 'path': path, 'name': name}
        raise ValueError('Named Vitest acceptance test/assertion does not exist')
    raise ValueError('Unsupported acceptance test runner/path')


def validate(root, base, head):
    for ref in (base, head):
        if not re.fullmatch('[0-9a-f]{40}', ref):
            raise ValueError('Base/head must be full commit SHAs')
    changed = set(filter(None, git(root, 'diff', '--name-only', '--diff-filter=ACDMRT', f'{base}...{head}').splitlines()))
    required = {path for path in changed if behavior(path)}
    if not required:
        return {'behavior_files': [], 'tests': []}
    records = sorted(path for path in changed if path.startswith('specs/changes/') and path.endswith('.json') and (root/path).is_file())
    covered, tests = set(), []
    for record in records:
        data = json.loads((root/record).read_text())
        if data.get('version') != 1 or not isinstance(data.get('changes'), list):
            raise ValueError(f'{record}: invalid change contract')
        for entry in data['changes']:
            paths = entry.get('files', [])
            requirements = entry.get('requirements', [])
            selectors = entry.get('acceptance_tests', [])
            if not paths or not requirements or not selectors or not entry.get('reason', '').strip():
                raise ValueError(f'{record}: files, requirements, acceptance_tests and reason are required')
            if any(not safe_path(p) or p not in changed for p in paths):
                raise ValueError(f'{record}: every covered file must be in this PR diff')
            for requirement in requirements:
                match = re.fullmatch(r'(specs/\d{3}-[^/]+/spec\.md)#(FR-\d{3})', requirement)
                if not match or not (root/match[1]).is_file() or not re.search(r'\*\*'+match[2]+r'\*\*\s*:', (root/match[1]).read_text()):
                    raise ValueError(f'{record}: unknown Spec Kit requirement {requirement}')
            tests.extend(acceptance(root, selector, changed) for selector in selectors)
            covered.update(paths)
    missing = sorted(required-covered)
    if missing:
        raise ValueError('Behavior changes lack Spec Kit requirement + changed acceptance test: '+', '.join(missing))
    unique = {json.dumps(test, sort_keys=True):test for test in tests}
    return {'behavior_files':sorted(required), 'tests':list(unique.values())}


def run_tests(root, plan):
    env = dict(os.environ, JWT_SECRET='ci-spec-acceptance', ENV='test', LLM_PROVIDER='mock', CHAT_PROVIDER='mock')
    for test in plan['tests']:
        runner, path, name = test['runner'], test['path'], test['name']
        cwd = root
        if runner == 'unittest':
            command = [sys.executable, '-m', 'unittest', path[:-3].replace('/', '.')+'.'+name, '-v']
        elif runner == 'pytest':
            command = [sys.executable, '-m', 'pytest', path+'::'+name.replace('.', '::'), '-q']
        else:
            cwd = root/'frontend'
            command = [str(cwd/'node_modules/.bin/vitest'), 'run', path.removeprefix('frontend/'), '-t', re.escape(name)]
        subprocess.run(command, cwd=cwd, env=env, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', required=True); parser.add_argument('--head', required=True)
    parser.add_argument('--plan-output'); parser.add_argument('--run', action='store_true')
    args = parser.parse_args()
    try:
        plan = validate(ROOT, args.base, args.head)
        if args.plan_output:
            Path(args.plan_output).write_text(json.dumps(plan))
        if os.environ.get('GITHUB_OUTPUT'):
            with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
                for runner in ['pytest', 'vitest']:
                    output.write(f"{runner}={str(any(t['runner']==runner for t in plan['tests'])).lower()}\n")
        print(f"Spec acceptance: {len(plan['behavior_files'])} behavior files linked; {len(plan['tests'])} named tests", flush=True)
        if args.run:
            run_tests(ROOT, plan)
    except (ValueError, OSError, SyntaxError, subprocess.CalledProcessError) as error:
        raise SystemExit(f'Spec acceptance failed: {error}')


if __name__ == '__main__':
    main()
