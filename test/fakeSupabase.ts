// A small in-memory stand-in for Supabase: the auth calls, query chains and
// Storage calls DisCamp uses, with the same ownership and moderation rules as
// the real database (migrations 0003, 0004 and 0006), so screen tests can
// sign in, add, edit, delete, report, block, add photos and check in.

import { jest } from '@jest/globals';
import type { Session, SupabaseClient } from '@supabase/supabase-js';

import { TERMS_VERSION } from '@/config';
import { hasBlockedWords } from '@/lib/wordFilter';

import { makeRow } from './fixtures';

export type QueryError = { message: string; code?: string; details?: string | null };
export type QueryResult = { data: unknown; error: QueryError | null };
export type StorageResult = { data: unknown; error: { message: string; statusCode?: string } | null };

/** Every `.retry(...)` setting the app asked for, newest last. */
export const retries: boolean[] = [];

export interface FakeUser {
  id: string;
  email?: string | null;
  provider?: string;
  displayName?: string;
  /** The terms version they agreed to. Defaults to the current one; null = never. */
  termsVersion?: number | null;
  /** Every provider linked to the account. Defaults to just `provider`. */
  providers?: string[];
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

/** Signed up after v1.4: hasn't agreed to the terms yet. */
export const NEWBIE: FakeUser = {
  id: '33333333-3333-4333-8333-333333333333',
  email: 'new@example.com',
  provider: 'google',
  displayName: 'Robin',
  termsVersion: null,
};

type AuthEvent = 'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'USER_UPDATED';
type Listener = (event: AuthEvent, session: Session | null) => void;
type Row = Record<string, unknown>;

/** Storage's rule for photo file names: "<camper id>/<photo id>.jpg". */
const PHOTO_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/;

function sessionFor(user: FakeUser): Session {
  return {
    access_token: `token-${user.id}`,
    refresh_token: 'refresh',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: user.id,
      email: user.email ?? undefined,
      app_metadata: { provider: user.provider ?? 'email', providers: user.providers ?? [user.provider ?? 'email'] },
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2026-10-07T00:00:00Z',
    },
  } as Session;
}

const NOT_FOUND: QueryError = { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' };

class FakeQuery implements PromiseLike<QueryResult> {
  op: 'select' | 'insert' | 'update' | 'delete' | 'rpc' = 'select';
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
  limit() {
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

  getSession = jest.fn(async () => ({
    data: { session: this.session as Session | null },
    error: null as QueryError | null,
  }));

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

export interface FakeFlag {
  reporter: string;
  spotId?: string;
  camperId?: string;
  photoId?: string;
  checkinId?: number;
  reason: string;
  details?: string;
  status: 'open' | 'actioned' | 'dismissed';
}

export class FakeBackend {
  readonly auth: FakeAuth;
  /** Rows of the spots_api view, by id. `hidden: true` = hidden for review. */
  readonly spots = new Map<string, Row>();
  /** Display names, by account id. */
  readonly profiles = new Map<string, string>();
  /** Terms version each camper agreed to (missing = never). */
  readonly terms = new Map<string, number>();
  /** Banned campers. */
  readonly banned = new Set<string>();
  /** Reports, oldest first. */
  readonly flags: FakeFlag[] = [];
  /** Who each camper has blocked. */
  readonly blocks = new Map<string, Set<string>>();
  /** Files in the spot-photos bucket, by path, with who uploaded them. */
  readonly files = new Map<string, { owner: string; bytes: number }>();
  /** Rows of spot_photos, by id, oldest first. */
  readonly photos = new Map<string, Row>();
  /** Rows of checkins, oldest first. */
  readonly checkins: Row[] = [];
  /**
   * Answers a Storage call before the default rules do (return undefined to
   * fall through), like `intercept` for queries.
   */
  storageIntercept:
    ((call: { op: 'upload' | 'remove'; paths: string[] }) => Promise<StorageResult> | undefined) | null = null;
  /** Every Storage call the app made, oldest first. */
  readonly storageCalls: { op: 'upload' | 'remove'; paths: string[] }[] = [];
  /** Every query the app made, oldest first. */
  readonly queries: FakeQuery[] = [];
  /**
   * Answers a query before the default rules do. Return undefined to fall
   * through. Tests use it for failures and slow servers.
   */
  intercept: ((query: FakeQuery) => Promise<QueryResult> | undefined) | null = null;
  readonly rpc: jest.Mock<(name: string, args?: Row) => PromiseLike<QueryResult>>;
  readonly client: SupabaseClient;

  constructor(rows: Row[] = [makeRow()]) {
    this.auth = new FakeAuth(this);
    // Copies, so changes (like a deleted account clearing names) never leak into other tests.
    for (const row of rows) this.spots.set(String(row.id), { ...row });
    this.rpc = jest.fn((name: string, args?: Row) => {
      const query = new FakeQuery(this, `rpc:${name}`);
      query.op = 'rpc';
      query.payload = args ?? null;
      this.queries.push(query);
      return query;
    });
    this.client = {
      from: (table: string) => {
        const query = new FakeQuery(this, table);
        this.queries.push(query);
        return query;
      },
      rpc: this.rpc,
      auth: this.auth,
      storage: { from: (bucket: string) => this.bucket(bucket) },
    } as unknown as SupabaseClient;
  }

  ensureProfile(user: FakeUser) {
    if (this.profiles.has(user.id)) return;
    this.profiles.set(user.id, user.displayName ?? 'Camper');
    const terms = user.termsVersion === undefined ? TERMS_VERSION : user.termsVersion;
    if (terms != null) this.terms.set(user.id, terms);
  }

  /** What the database's write checks say about this camper: null when they may post. */
  private postingBlock(uid: string): QueryError | null {
    if (this.banned.has(uid)) return { message: 'banned', code: 'P0001' };
    if ((this.terms.get(uid) ?? 0) < TERMS_VERSION) return { message: 'terms_required', code: 'P0001' };
    return null;
  }

  private blockedBy(uid: string | null): Set<string> {
    return (uid && this.blocks.get(uid)) || new Set();
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
    if (query.op === 'rpc') return this.answerRpc(query.table.slice('rpc:'.length), query.payload ?? {});

    if (query.table === 'spots_api') {
      const blocked = this.blockedBy(uid);
      const rows = [...this.spots.values()]
        .filter((r) => !r.hidden || (uid != null && r.created_by === uid))
        .filter((r) => !blocked.has(String(r.created_by)))
        .filter((r) => this.matches(r, query.filters))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      return this.shape(rows, query);
    }

    if (query.table === 'profiles') {
      const rows = [...this.profiles.entries()]
        .map(([id, display_name]) => ({ id, display_name, terms_version: this.terms.get(id) ?? null }))
        .filter((r) => this.matches(r, query.filters));
      if (query.op === 'update') {
        if (!uid) return { data: null, error: { message: 'permission denied for table profiles', code: '42501' } };
        if (this.banned.has(uid)) return { data: null, error: { message: 'banned', code: 'P0001' } };
        if (this.reporters({ camperId: uid }) >= 3) {
          return { data: null, error: { message: 'name_under_review', code: 'P0001' } };
        }
        const name = String(query.payload?.display_name ?? '');
        const changed = rows.filter((r) => r.id === uid);
        for (const r of changed) this.profiles.set(r.id, name);
        return this.shape(changed, query);
      }
      return this.shape(rows, query);
    }

    if (query.table === 'flags') return this.answerFlag(query, uid);
    if (query.table === 'spot_photos' || query.table === 'spot_photos_api') return this.answerPhoto(query, uid);
    if (query.table === 'checkins' || query.table === 'checkins_api') return this.answerCheckin(query, uid);
    if (query.table === 'blocks') return this.answerBlock(query, uid);

    if (query.table === 'spots') {
      if (!uid) return { data: null, error: { message: 'permission denied for table spots', code: '42501' } };
      const refused = query.op === 'delete' ? null : this.postingBlock(uid);
      if (refused) return { data: null, error: refused };
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
        // Not while it's hidden or has open reports (migration 0004).
        const deletable = targets.filter(
          (r) =>
            r.report_count === 0 &&
            r.verified !== true &&
            r.hidden !== true &&
            !this.flags.some((f) => f.spotId === r.id && f.status === 'open'),
        );
        for (const row of deletable) this.spots.delete(String(row.id));
        return this.shape(
          deletable.map((r) => ({ id: r.id })),
          query,
        );
      }
    }
    return { data: null, error: { message: `The fake has no rule for ${query.op} on ${query.table}` } };
  }

  private answerRpc(name: string, args: Row): QueryResult {
    const uid = this.auth.userId;
    if (!uid) return { data: null, error: { message: 'not_signed_in', code: 'P0001' } };
    switch (name) {
      case 'delete_my_account':
        this.profiles.delete(uid);
        this.terms.delete(uid);
        this.blocks.delete(uid);
        for (const set of this.blocks.values()) set.delete(uid);
        for (const row of this.spots.values()) {
          if (row.created_by === uid) Object.assign(row, { created_by: null, added_by: null });
        }
        return { data: null, error: null };
      case 'accept_terms':
        if (args.version !== TERMS_VERSION) return { data: null, error: { message: 'terms_outdated', code: 'P0001' } };
        this.terms.set(uid, TERMS_VERSION);
        return { data: null, error: null };
      case 'my_blocks':
        return {
          data: [...this.blockedBy(uid)].map((id) => ({
            camper_id: id,
            display_name: this.profiles.get(id) ?? null,
            blocked_at: '2026-10-08T12:00:00+00:00',
          })),
          error: null,
        };
      default:
        return { data: null, error: { message: `unknown function ${name}` } };
    }
  }

  private answerFlag(query: FakeQuery, uid: string | null): QueryResult {
    if (query.op !== 'insert' || !uid) {
      return { data: null, error: { message: 'permission denied for table flags', code: '42501' } };
    }
    if (this.banned.has(uid)) return { data: null, error: { message: 'banned', code: 'P0001' } };
    const { spot_id: spotId, camper_id: camperId, photo_id: photoId, checkin_id: checkinId } = query.payload ?? {};
    const { reason, details } = query.payload ?? {};
    if (typeof photoId === 'string') return this.flagPhoto(uid, photoId, String(reason), details);
    if (typeof checkinId === 'number') return this.flagCheckin(uid, checkinId, String(reason), details);
    const spot = typeof spotId === 'string' ? this.spots.get(spotId) : undefined;
    if (typeof spotId === 'string' && !spot) {
      return {
        data: null,
        error: { message: 'insert or update on table "flags" violates foreign key', code: '23503' },
      };
    }
    if (camperId === uid || spot?.created_by === uid) {
      return { data: null, error: { message: 'own_content', code: 'P0001' } };
    }
    const same = (f: FakeFlag) =>
      f.reporter === uid && f.status === 'open' && (spotId ? f.spotId === spotId : f.camperId === camperId);
    if (this.flags.some(same)) {
      return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } };
    }
    this.flags.push({
      reporter: uid,
      ...(typeof spotId === 'string' ? { spotId } : { camperId: String(camperId) }),
      reason: String(reason),
      ...(typeof details === 'string' ? { details } : {}),
      status: 'open',
    });
    // 3 different campers: hidden until reviewed, or the name reset.
    if (spot && this.reporters({ spotId: String(spotId) }) >= 3) spot.hidden = true;
    if (typeof camperId === 'string' && this.reporters({ camperId }) >= 3) this.profiles.set(camperId, 'Camper');
    return { data: null, error: null };
  }

  private flagPhoto(uid: string, photoId: string, reason: string, details: unknown): QueryResult {
    const photo = this.photos.get(photoId);
    if (!photo) {
      return {
        data: null,
        error: { message: 'insert or update on table "flags" violates foreign key', code: '23503' },
      };
    }
    if (photo.created_by === uid) return { data: null, error: { message: 'own_content', code: 'P0001' } };
    if (this.flags.some((f) => f.reporter === uid && f.status === 'open' && f.photoId === photoId)) {
      return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } };
    }
    this.flags.push({
      reporter: uid,
      photoId,
      reason,
      ...(typeof details === 'string' ? { details } : {}),
      status: 'open',
    });
    const reporters = new Set(
      this.flags.filter((f) => f.photoId === photoId && f.status === 'open').map((f) => f.reporter),
    );
    if (reporters.size >= 3) photo.hidden = true;
    return { data: null, error: null };
  }

  private flagCheckin(uid: string, checkinId: number, reason: string, details: unknown): QueryResult {
    const checkin = this.checkins.find((r) => r.id === checkinId);
    if (!checkin) {
      return {
        data: null,
        error: { message: 'insert or update on table "flags" violates foreign key', code: '23503' },
      };
    }
    if (checkin.camper_id === uid) return { data: null, error: { message: 'own_content', code: 'P0001' } };
    if (this.flags.some((f) => f.reporter === uid && f.status === 'open' && f.checkinId === checkinId)) {
      return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } };
    }
    this.flags.push({
      reporter: uid,
      checkinId,
      reason,
      ...(typeof details === 'string' ? { details } : {}),
      status: 'open',
    });
    const reporters = new Set(
      this.flags.filter((f) => f.checkinId === checkinId && f.status === 'open').map((f) => f.reporter),
    );
    if (reporters.size >= 3) checkin.hidden = true;
    return { data: null, error: null };
  }

  /** The spot-photos bucket, as supabase-js's storage.from(bucket) shows it. */
  private bucket(bucket: string) {
    const publicUrl = (path: string) => `https://fake.supabase.test/storage/v1/object/public/${bucket}/${path}`;
    return {
      getPublicUrl: (path: string) => ({ data: { publicUrl: publicUrl(path) } }),
      upload: (path: string, body: ArrayBuffer) => {
        const call = { op: 'upload' as const, paths: [path] };
        this.storageCalls.push(call);
        const intercepted = this.storageIntercept?.(call);
        if (intercepted) return intercepted;
        return Promise.resolve(this.answerUpload(path, body));
      },
      remove: (paths: string[]) => {
        const call = { op: 'remove' as const, paths };
        this.storageCalls.push(call);
        const intercepted = this.storageIntercept?.(call);
        if (intercepted) return intercepted;
        const uid = this.auth.userId;
        // Your own files, and not while a photo on a spot uses one.
        const listed = new Set([...this.photos.values()].map((r) => r.path));
        const removed = paths.filter((path) => this.files.get(path)?.owner === uid && uid != null && !listed.has(path));
        for (const path of removed) this.files.delete(path);
        return Promise.resolve({ data: removed.map((name) => ({ name })), error: null });
      },
    };
  }

  /** Storage's upload rules (migration 0006's policies on storage.objects). */
  private answerUpload(path: string, body: ArrayBuffer): StorageResult {
    const uid = this.auth.userId;
    const denied = { data: null, error: { message: 'new row violates row-level security policy', statusCode: '403' } };
    if (!uid || !path.startsWith(`${uid}/`) || !PHOTO_PATH.test(path) || this.postingBlock(uid)) return denied;
    if (this.files.has(path))
      return { data: null, error: { message: 'The resource already exists', statusCode: '409' } };
    this.files.set(path, { owner: uid, bytes: body.byteLength });
    return { data: { path }, error: null };
  }

  private visibleSpot(id: unknown, uid: string | null): Row | undefined {
    const spot = typeof id === 'string' ? this.spots.get(id) : undefined;
    if (!spot) return undefined;
    if (spot.hidden && spot.created_by !== uid) return undefined;
    if (this.blockedBy(uid).has(String(spot.created_by))) return undefined;
    return spot;
  }

  private answerPhoto(query: FakeQuery, uid: string | null): QueryResult {
    if (query.table === 'spot_photos_api') {
      const blocked = this.blockedBy(uid);
      const rows = [...this.photos.values()]
        .filter((r) => !r.hidden || (uid != null && r.created_by === uid))
        .filter((r) => !blocked.has(String(r.created_by)) && this.visibleSpot(r.spot_id, uid))
        .map((r) => ({ ...r, added_by: this.profiles.get(String(r.created_by)) ?? null, hidden: r.hidden === true }))
        .filter((r) => this.matches(r, query.filters));
      return this.shape(rows, query);
    }
    if (!uid) return { data: null, error: { message: 'permission denied for table spot_photos', code: '42501' } };
    if (query.op === 'delete') {
      const reported = (r: Row) => this.flags.some((f) => f.photoId === r.id && f.status === 'open');
      const gone = [...this.photos.values()].filter(
        (r) => this.matches(r, query.filters) && r.created_by === uid && r.hidden !== true && !reported(r),
      );
      for (const r of gone) this.photos.delete(String(r.id));
      return this.shape(
        gone.map((r) => ({ id: r.id })),
        query,
      );
    }
    if (query.op !== 'insert') {
      return { data: null, error: { message: 'permission denied for table spot_photos', code: '42501' } };
    }
    const refused = this.postingBlock(uid);
    if (refused) return { data: null, error: refused };
    const { id, spot_id: spotId, path, width, height } = query.payload ?? {};
    const fail = (message: string) => ({ data: null, error: { message, code: 'P0001' } });
    if (path !== `${uid}/${String(id)}.jpg`) return fail('photo_path');
    if (this.files.get(String(path))?.owner !== uid) return fail('photo_missing');
    if (!this.visibleSpot(spotId, uid)) return fail('spot_gone');
    if (this.photos.has(String(id))) return { data: null, error: { message: 'duplicate key value', code: '23505' } };
    const mine = [...this.photos.values()].filter((r) => r.created_by === uid && r.spot_id === spotId);
    if (mine.length >= 3) return fail('photo_limit_spot');
    this.photos.set(String(id), {
      id,
      spot_id: spotId,
      path,
      width,
      height,
      created_by: uid,
      created_at: new Date().toISOString(),
      hidden: false,
    });
    return this.shape([{ id }], query);
  }

  private answerCheckin(query: FakeQuery, uid: string | null): QueryResult {
    if (query.table === 'checkins_api') {
      const blocked = this.blockedBy(uid);
      const rows = this.checkins
        .filter((r) => !r.hidden && !blocked.has(String(r.camper_id)) && this.visibleSpot(r.spot_id, uid))
        .map(({ hidden: _hidden, ...r }) => ({ ...r, camper_name: this.profiles.get(String(r.camper_id)) ?? null }))
        .filter((r) => this.matches(r, query.filters))
        .reverse();
      return this.shape(rows, query);
    }
    if (!uid || query.op !== 'insert') {
      return { data: null, error: { message: 'permission denied for table checkins', code: '42501' } };
    }
    const refused = this.postingBlock(uid);
    if (refused) return { data: null, error: refused };
    const { spot_id: spotId, kind, note } = query.payload ?? {};
    const fail = (message: string) => ({ data: null, error: { message, code: 'P0001' } });
    if (typeof note === 'string' && hasBlockedWords(note)) return fail('blocked_words');
    const spot = this.visibleSpot(spotId, uid);
    if (!spot) return fail('spot_gone');
    if (kind === 'still_good' && spot.created_by === uid) return fail('own_spot');
    if (this.checkins.some((r) => r.camper_id === uid && r.spot_id === spotId && r.kind === kind)) {
      return fail('checkin_recent');
    }
    const at = new Date().toISOString();
    this.checkins.push({
      id: this.checkins.length + 1,
      spot_id: spotId,
      camper_id: uid,
      kind,
      note: typeof note === 'string' ? note : null,
      created_at: at,
      hidden: false,
    });
    // As moderation.after_checkin and the spots_api view do.
    spot.report_count = Number(spot.report_count ?? 0) + 1;
    if (kind === 'still_good') {
      spot.last_confirmed_at = at;
      spot.alerts = [];
      const others = new Set(
        this.checkins
          .filter((r) => r.spot_id === spotId && r.kind === 'still_good' && r.camper_id !== spot.created_by)
          .map((r) => r.camper_id),
      );
      if (others.size >= 2) spot.verified = true;
    } else {
      spot.alerts = [{ kind, at }, ...((spot.alerts as Row[] | undefined) ?? [])].slice(0, 3);
    }
    return { data: null, error: null };
  }

  /** Campers with an open report on a spot or name (moderation.open_reporters, minus dismissals). */
  reporters(target: { spotId?: string; camperId?: string }): number {
    const about = (f: FakeFlag) =>
      target.spotId ? f.spotId === target.spotId : target.camperId != null && f.camperId === target.camperId;
    const dismissed = new Set(this.flags.filter((f) => about(f) && f.status === 'dismissed').map((f) => f.reporter));
    return new Set(
      this.flags.filter((f) => about(f) && f.status === 'open' && !dismissed.has(f.reporter)).map((f) => f.reporter),
    ).size;
  }

  private answerBlock(query: FakeQuery, uid: string | null): QueryResult {
    if (!uid || (query.op !== 'insert' && query.op !== 'delete')) {
      return { data: null, error: { message: 'permission denied for table blocks', code: '42501' } };
    }
    const mine = this.blocks.get(uid) ?? new Set<string>();
    this.blocks.set(uid, mine);
    if (query.op === 'delete') {
      for (const [column, value] of query.filters) if (column === 'blocked_id') mine.delete(String(value));
      return { data: null, error: null };
    }
    const blocked = String(query.payload?.blocked_id ?? '');
    if (blocked === uid)
      return { data: null, error: { message: 'violates check constraint "blocks_not_self"', code: '23514' } };
    if (mine.has(blocked)) return { data: null, error: { message: 'duplicate key value', code: '23505' } };
    mine.add(blocked);
    return { data: null, error: null };
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
