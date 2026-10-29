// scripts/postgres-client.sh: the database scripts only run psql and pg_dump
// with PostgreSQL's 2026 client security fixes, upgrade Homebrew's libpq
// when it's behind, and always encrypt the connection.

import { describe, expect, it } from '@jest/globals';
import { spawnSync } from 'child_process';
import { chmodSync, mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const ROOT = join(__dirname, '..');

/** A fake psql (or pg_dump) that prints `versionLine`. */
function fakeTool(dir: string, name: string, versionLine: string): string {
  const path = join(dir, name);
  writeFileSync(path, `#!/bin/bash\necho '${versionLine}'\n`);
  chmodSync(path, 0o755);
  return path;
}

/** Runs `code` in bash after sourcing the helper, with only `bin` and the basics on the PATH. */
function inBash(code: string, bin: string, env: Record<string, string> = {}) {
  const run = spawnSync('bash', ['-c', `. scripts/postgres-client.sh\n${code}`], {
    cwd: ROOT,
    env: { NODE_ENV: 'test', PATH: `${bin}:/usr/bin:/bin`, HOME: tmpdir(), ...env },
    encoding: 'utf8',
  });
  return { code: run.status, stdout: run.stdout, stderr: run.stderr };
}

describe('postgres-client.sh', () => {
  it('knows which psql and pg_dump releases have the security fixes', () => {
    const bin = mkdtempSync(join(tmpdir(), 'pgclient-'));
    const cases: [string, boolean][] = [
      ['psql (PostgreSQL) 18.6', true],
      ['psql (PostgreSQL) 18.5', false],
      ['psql (PostgreSQL) 17.11 (Homebrew)', true],
      ['psql (PostgreSQL) 17.10 (Homebrew)', false],
      ['pg_dump (PostgreSQL) 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)', true],
      ['psql (PostgreSQL) 16.9', false],
      ['psql (PostgreSQL) 15.19', true],
      ['psql (PostgreSQL) 14.24', true],
      ['psql (PostgreSQL) 14.23', false],
      ['psql (PostgreSQL) 13.22', false], // no longer fixed at all
      ['psql (PostgreSQL) 19.0', true],
      ['not a version', false],
    ];
    const results = cases.map(([line], i) => {
      const tool = fakeTool(bin, `tool${i}`, line);
      return inBash(`pg_tool_patched '${tool}' && echo yes || echo no`, bin).stdout.trim() === 'yes';
    });
    expect(results).toEqual(cases.map(([, ok]) => ok));
  });

  it('stops before connecting with an old psql, and says how to update it', () => {
    const bin = mkdtempSync(join(tmpdir(), 'pgclient-'));
    const psql = fakeTool(bin, 'psql', 'psql (PostgreSQL) 17.6 (Homebrew)');
    const run = inBash(`pg_require_patched '${psql}'\necho went-on`, bin);
    expect(run.code).toBe(1);
    expect(run.stdout).not.toContain('went-on');
    expect(run.stderr).toMatch(/known security holes/);
    expect(run.stderr).toMatch(/brew upgrade libpq/);
    // A patched one goes straight on.
    const fresh = fakeTool(bin, 'psql-new', 'psql (PostgreSQL) 17.11');
    expect(inBash(`pg_require_patched '${fresh}'\necho went-on`, bin).stdout).toContain('went-on');
  });

  it('upgrades a Homebrew libpq that is behind, then goes on', () => {
    const bin = mkdtempSync(join(tmpdir(), 'pgclient-'));
    const libpq = join(bin, 'libpq');
    mkdirSync(join(libpq, 'bin'), { recursive: true });
    const psql = fakeTool(join(libpq, 'bin'), 'psql', 'psql (PostgreSQL) 18.2');
    // A stand-in for Homebrew: knows where libpq is, and "upgrades" it.
    writeFileSync(
      join(bin, 'brew'),
      `#!/bin/bash\nif [ "$1" = "--prefix" ]; then echo '${libpq}'; exit 0; fi\n` +
        `if [ "$1" = "upgrade" ]; then printf '#!/bin/bash\\necho "psql (PostgreSQL) 18.6"\\n' > '${psql}'; exit 0; fi\nexit 1\n`,
    );
    chmodSync(join(bin, 'brew'), 0o755);
    expect(inBash('pg_tool psql', bin).stdout.trim()).toBe(psql);
    const run = inBash(`pg_require_patched "$(pg_tool psql)"\necho went-on`, bin);
    expect(run.code).toBe(0);
    expect(run.stdout).toMatch(/Updating it with 'brew upgrade libpq'/);
    expect(run.stdout).toContain('went-on');
  });

  it('warns, without stopping, when the database server is missing the fixes', () => {
    const bin = mkdtempSync(join(tmpdir(), 'pgclient-'));
    const old = inBash('pg_server_warn 170004 && echo ok || echo warned', bin);
    expect(old.stdout.trim()).toBe('warned');
    expect(old.stderr).toMatch(/PostgreSQL 17\.4, which is missing security fixes/);
    expect(old.stderr).toMatch(/Upgrade project/);
    for (const patched of ['170011', '150019', '180006', '190000']) {
      expect(inBash(`pg_server_warn ${patched} && echo ok`, bin).stdout.trim()).toBe('ok');
    }
    expect(inBash('pg_server_warn 150018 || echo warned', bin).stdout.trim()).toBe('warned');
    // Nothing to go on: say nothing.
    expect(inBash("pg_server_warn '' && echo ok", bin).stdout.trim()).toBe('ok');
  });

  it('encrypts every connection unless told otherwise', () => {
    const bin = mkdtempSync(join(tmpdir(), 'pgclient-'));
    expect(inBash('echo "$PGSSLMODE"', bin).stdout.trim()).toBe('require');
    expect(inBash('echo "$PGSSLMODE"', bin, { PGSSLMODE: 'verify-full' }).stdout.trim()).toBe('verify-full');
  });
});
