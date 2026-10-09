// A small in-memory stand-in for Supabase: the auth calls and query chains
// DisCamp uses, with the same ownership rules as the real database
// (migration 0003), so screen tests can sign in, add, edit and delete spots.

import { jest } from '@jest/globals';
import type { Session, SupabaseClient } from '@supabase/supabase-js';

import { makeRow } from './fixtures';

export type QueryError = { message: string; code?: string; details?: string | null };
export type QueryResult = { data: unknown; error: QueryError | null };

/** Every `.retry(...)` setting the app asked for, newest last. */
export const retries: boolean[] = [];

export interface FakeUser {
  id: string;
  email?: string | null;
  provider?: string;
  displayName?: string;
}

export const SAM: FakeUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'sam@example.com',
  provider: 'google',
  displayName: 'Sam',
};

export const ALEX: FakeUser = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'alex@example.com',
  provider: 'github',
  displayName: 'Alex',
};

type AuthEvent = 'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'USER_UPDATED';
type Listener = (event: AuthEvent, session: Session | null) => void;
type Row = Record<string, unknown>;

function sessionFor(user: FakeUser): Session {
  return {
    access_token: `token-${user.id}`,
    refresh_token: 'refresh',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: user.id,
      email: user.email ?? undefined,
      app_metadata: { provider: user.provider ?? 'email' },
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2026-10-07T00:00:00Z',
    },
  } as Session;
}

const NOT_FOUND: QueryError = { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' };

class FakeQuery implements PromiseLike<QueryResult> {
  op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  payload: Row | null = null;
  returning = false;
  filters: [string, unknown][] = [];
  mode: 'many' | 'single' | 'maybeSingle' = 'many';
  signal: AbortSignal | undefined;

  constructor(
    private readonly backend: FakeBackend,
    readonly table: string,
  ) {}

  select() {
    if (this.op === 'select') this.returning = true;
    else this.returning = true;
    return this;
  }
  insert(row: Row) {
    this.op = 'insert';
    this.payload = row;
    return this;
  }
  update(row: Row) {
    this.op = 'update';
    this.payload = row;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }
  order() {
    return this;
  }
  retry(enabled: boolean) {
    retries.push(enabled);
    return this;
  }
  abortSignal(signal: AbortSignal) {
    this.signal = signal;
    return this;
  }
  single() {
    this.mode = 'single';
    return this;
  }
  maybeSingle() {
    this.mode = 'maybeSingle';
    return this;
  }

  then<A = QueryResult, B = never>(
    onFulfilled?: ((value: QueryResult) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.backend.run(this).then(onFulfilled, onRejected);
  }
}

export class FakeAuth {
  session: Session | null = null;
  private readonly listeners = new Set<Listener>();
  /** Who the next browser or Apple sign-in signs in as. */
  nextUser: FakeUser = SAM;

  constructor(private readonly backend: FakeBackend) {}

  /** Signs in (or out, with null) and tells the app, like a real sign-in would. */
  setUser(user: FakeUser | null, event: AuthEvent = user ? 'SIGNED_IN' : 'SIGNED_OUT') {
    if (user) this.backend.ensureProfile(user);
    this.session = user ? sessionFor(user) : null;
    for (const listener of [...this.listeners]) listener(event, this.session);
  }

  get userId(): string | null {
    return this.session?.user.id ?? null;
  }

  onAuthStateChange = jest.fn((listener: Listener) => {
    this.listeners.add(listener);
    // Supabase reports the saved session right after subscribing.
    queueMicrotask(() => {
      if (this.listeners.has(listener)) listener('INITIAL_SESSION', this.session);
    });
    return { data: { subscription: { unsubscribe: () => this.listeners.delete(listener) } } };
  });

  startAutoRefresh = jest.fn(async () => undefined);
  stopAutoRefresh = jest.fn(async () => undefined);

  signInWithOAuth = jest.fn(async ({ provider }: { provider: string; options?: Record<string, unknown> }) => ({
    data: { provider, url: `https://auth.example.test/authorize?provider=${provider}` },
    error: null as QueryError | null,
  }));

  exchangeCodeForSession = jest.fn(async (code: string) => {
    if (!code.startsWith('good')) {
      return {
        data: { session: null, user: null },
        error: { message: 'invalid flow state, no valid flow state found' },
      };
    }
    this.setUser(this.nextUser);
    return { data: { session: this.session, user: this.session?.user ?? null }, error: null };
  });

  signInWithIdToken = jest.fn(async (_credentials: { provider: string; token: string; nonce?: string }) => {
    this.setUser({ ...this.nextUser, provider: 'apple' });
    return { data: { session: this.session, user: this.session?.user ?? null }, error: null as QueryError | null };
  });

  updateUser = jest.fn(async (_attributes: { data?: Record<string, unknown> }) => ({
    data: { user: this.session?.user ?? null },
    error: null,
  }));

  signOut = jest.fn(async (_options?: { scope?: string }) => {
    this.setUser(null);
    return { error: null as QueryError | null };
  });
}

let nextId = 1;

export class FakeBackend {
  readonly auth: FakeAuth;
  /** Rows of the spots_api view, by id. */
  readonly spots = new Map<string, Row>();
  /** Display names, by account id. */
  readonly profiles = new Map<string, string>();
  /** Every query the app made, oldest first. */
  readonly queries: FakeQuery[] = [];
  /**
   * Answers a query before the default rules do. Return undefined to fall
   * through. Tests use it for failures and slow servers.
   */
  intercept: ((query: FakeQuery) => Promise<QueryResult> | undefined) | null = null;
  readonly rpc: jest.Mock<(name: string) => Promise<QueryResult>>;
  readonly client: SupabaseClient;

  constructor(rows: Row[] = [makeRow()]) {
    this.auth = new FakeAuth(this);
    for (const row of rows) this.spots.set(String(row.id), row);
    this.rpc = jest.fn(async (name: string): Promise<QueryResult> => {
      if (name !== 'delete_my_account') return { data: null, error: { message: 'unknown function' } };
      const uid = this.auth.userId;
      if (!uid) return { data: null, error: { message: 'not_signed_in' } };
      this.profiles.delete(uid);
      for (const row of this.spots.values()) {
        if (row.created_by === uid) Object.assign(row, { created_by: null, added_by: null });
      }
      return { data: null, error: null };
    });
    this.client = {
      from: (table: string) => {
        const query = new FakeQuery(this, table);
        this.queries.push(query);
        return query;
      },
      rpc: this.rpc,
      auth: this.auth,
    } as unknown as SupabaseClient;
  }

  ensureProfile(user: FakeUser) {
    if (!this.profiles.has(user.id)) this.profiles.set(user.id, user.displayName ?? 'Camper');
  }

  /** Writes the app sent to a table, oldest first. */
  writes(table: string, op?: FakeQuery['op']) {
    return this.queries.filter((q) => q.table === table && q.op !== 'select' && (!op || q.op === op));
  }

  run(query: FakeQuery): Promise<QueryResult> {
    const intercepted = this.intercept?.(query);
    if (intercepted) return intercepted;
    return Promise.resolve(this.answer(query));
  }

  private shape(rows: Row[], query: FakeQuery): QueryResult {
    if (query.mode === 'many') return { data: rows, error: null };
    if (rows.length === 1) return { data: rows[0], error: null };
    if (rows.length === 0 && query.mode === 'maybeSingle') return { data: null, error: null };
    return { data: null, error: NOT_FOUND };
  }

  private matches(row: Row, filters: [string, unknown][]) {
    return filters.every(([column, value]) => row[column] === value);
  }

  private answer(query: FakeQuery): QueryResult {
    const uid = this.auth.userId;
    if (query.table === 'spots_api') {
      const rows = [...this.spots.values()]
        .filter((r) => this.matches(r, query.filters))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      return this.shape(rows, query);
    }

    if (query.table === 'profiles') {
      const rows = [...this.profiles.entries()]
        .map(([id, display_name]) => ({ id, display_name }))
        .filter((r) => this.matches(r, query.filters));
      if (query.op === 'update') {
        if (!uid) return { data: null, error: { message: 'permission denied for table profiles', code: '42501' } };
        const name = String(query.payload?.display_name ?? '');
        const changed = rows.filter((r) => r.id === uid);
        for (const r of changed) this.profiles.set(r.id, name);
        return this.shape(changed, query);
      }
      return this.shape(rows, query);
    }

    if (query.table === 'spots') {
      if (!uid) return { data: null, error: { message: 'permission denied for table spots', code: '42501' } };
      if (query.op === 'insert') {
        const { id: chosen, ...written } = query.payload ?? {};
        const id = typeof chosen === 'string' ? chosen : `camper-spot-${nextId++}`;
        if (this.spots.has(id)) {
          return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } };
        }
        this.spots.set(id, this.toViewRow(id, written, uid));
        return this.shape([{ id }], query);
      }
      const targets = [...this.spots.values()].filter((r) => this.matches(r, query.filters) && r.created_by === uid);
      if (query.op === 'update') {
        for (const row of targets) {
          Object.assign(row, this.toViewRow(String(row.id), query.payload ?? {}, uid, row), { verified: false });
        }
        return this.shape(
          targets.map((r) => ({ id: r.id })),
          query,
        );
      }
      if (query.op === 'delete') {
        const deletable = targets.filter((r) => r.report_count === 0 && r.verified !== true);
        for (const row of deletable) this.spots.delete(String(row.id));
        return this.shape(
          deletable.map((r) => ({ id: r.id })),
          query,
        );
      }
    }
    return { data: null, error: { message: `The fake has no rule for ${query.op} on ${query.table}` } };
  }

  /** The spots_api row for what the app wrote to the spots table. */
  private toViewRow(id: string, written: Row, uid: string, existing?: Row): Row {
    const point = /POINT\((-?[\d.]+) (-?[\d.]+)\)/.exec(String(written.location ?? ''));
    const { location: _location, ...columns } = written;
    return {
      ...(existing ?? makeRow({ id, verified: false, report_count: 0, sources: [] })),
      ...columns,
      id,
      latitude: point ? Number(point[2]) : existing?.latitude,
      longitude: point ? Number(point[1]) : existing?.longitude,
      created_by: uid,
      added_by: this.profiles.get(uid) ?? null,
      created_at: (existing?.created_at as string | undefined) ?? '2026-10-07T12:00:00.123456+00:00',
    };
  }
}

export function fakeBackend(rows?: Row[]): FakeBackend {
  return new FakeBackend(rows);
}

/**
 * The original spots-only fake: every spot list request is answered by
 * `respond`. Signed out, so sign-in buttons work but nothing is written.
 */
export function fakeClient(respond: (signal: AbortSignal) => Promise<QueryResult>): SupabaseClient {
  const backend = new FakeBackend([]);
  backend.intercept = (query) =>
    query.table === 'spots_api' && query.filters.length === 0
      ? respond(query.signal ?? new AbortController().signal)
      : undefined;
  return backend.client;
}
