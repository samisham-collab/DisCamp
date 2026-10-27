// A small in-memory stand-in for Supabase: the auth calls, query chains and
// Storage calls DisCamp uses, with the same ownership and moderation rules as
// the real database (migrations 0003, 0004, 0006 and 0008), so screen tests
// can sign in, add, edit, delete, report, block, add photos, check in, post
// and send cleanups, review them and read Embers.

import { jest } from '@jest/globals';
import type { Session, SupabaseClient } from '@supabase/supabase-js';

import { TERMS_VERSION } from '@/config';
import { distanceMeters } from '@/lib/geo';
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
/** A photo's preview, next to it (migration 0011). */
const PREVIEW_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.preview\.jpg$/;
const photoForPreview = (path: string) => path.replace(/\.preview\.jpg$/, '.jpg');

/** "SRID=4326;POINT(lng lat)" as the app sends it, or null. */
function readPoint(text: unknown): { latitude: number; longitude: number } | null {
  const point = /POINT\((-?[\d.]+) (-?[\d.]+)\)/.exec(String(text ?? ''));
  return point ? { latitude: Number(point[2]), longitude: Number(point[1]) } : null;
}

/** Embers for an approved cleanup, by size (migration 0008). */
const CLEANUP_EMBERS: Record<string, number> = { small: 50, medium: 100, large: 150 };

export function sessionFor(user: FakeUser): Session {
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
  /** Rows asked for with .range(from, to), inclusive. */
  range_: [number, number] | null = null;

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
  range(from: number, to: number) {
    this.range_ = [from, to];
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
  taskId?: string;
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
  /** Cleanups (cleanup_tasks, with latitude and longitude), by id. `hidden: true` = hidden for review. */
  readonly cleanups = new Map<string, Row>();
  /** Cleanups sent for review (cleanup_completions), oldest first. */
  readonly completions: Row[] = [];
  /** The Embers ledger, oldest first. */
  readonly embers: Row[] = [];
  /** Campers who review cleanups. */
  readonly moderators = new Set<string>();
  /**
   * What public.app_status says (migration 0011): new photos (and cleanups)
   * or all new posts paused near the free plan's limits.
   */
  readonly paused = { photos: false, posting: false };
  /** What public.free_plan_usage answers moderators. */
  usage: Row = {
    database_bytes: 30 * 1024 * 1024,
    database_limit_bytes: 500 * 1024 * 1024,
    storage_bytes: 140 * 1024 * 1024,
    storage_limit_bytes: 1024 * 1024 * 1024,
    pause_at_percent: 90,
    warn_at_percent: 75,
    photos_paused: false,
    posting_paused: false,
    level: 'ok',
    files: 700,
    spots: 312,
    photos: 340,
    checkins: 80,
    cleanups: 12,
    campers: 40,
    active_campers: 23,
    checked_at: '2026-10-21T16:00:00Z',
    month_ago: null,
  };
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
  /** Edge Functions the app called. apple-revoke disconnects Apple by default. */
  readonly invoke = jest.fn(
    async (name: string, _options?: { body?: unknown; signal?: AbortSignal }): Promise<QueryResult> =>
      name === 'apple-revoke'
        ? { data: { revoked: true }, error: null }
        : { data: null, error: { message: `No function ${name}` } },
  );
  /** Push addresses registered with register_push_token, and whose they are. */
  readonly pushTokens = new Map<string, string>();
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
      functions: { invoke: this.invoke },
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
  /** The free plan guard (migration 0011), checked before a camper adds something. */
  private pauseBlock(photos: boolean): QueryError | null {
    if (this.paused.posting) return { message: 'posting_paused', code: 'P0001' };
    if (photos && this.paused.photos) return { message: 'photos_paused', code: 'P0001' };
    return null;
  }

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
    if (query.mode === 'many') {
      return { data: query.range_ ? rows.slice(query.range_[0], query.range_[1] + 1) : rows, error: null };
    }
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
    if (query.table === 'cleanup_tasks' || query.table === 'cleanup_tasks_api') return this.answerCleanup(query, uid);
    if (query.table === 'cleanup_completions') return this.answerCompletion(query, uid);
    if (query.table === 'embers_api') {
      if (!uid) return { data: null, error: { message: 'permission denied for view embers_api', code: '42501' } };
      return this.shape(
        this.embers.filter((r) => r.camper_id === uid && this.matches(r, query.filters)).reverse(),
        query,
      );
    }
    if (query.table === 'blocks') return this.answerBlock(query, uid);

    if (query.table === 'spots') {
      if (!uid) return { data: null, error: { message: 'permission denied for table spots', code: '42501' } };
      const refused =
        query.op === 'delete'
          ? null
          : ((query.op === 'insert' ? this.pauseBlock(false) : null) ?? this.postingBlock(uid));
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
    if (name === 'app_status') {
      const photos = this.paused.photos || this.paused.posting;
      return {
        data: { photos_paused: photos, posting_paused: this.paused.posting, level: photos ? 'paused' : 'ok' },
        error: null,
      };
    }
    if (!uid) return { data: null, error: { message: 'not_signed_in', code: 'P0001' } };
    switch (name) {
      case 'delete_my_account':
        for (const [token, owner] of this.pushTokens) if (owner === uid) this.pushTokens.delete(token);
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
      case 'am_moderator':
        return { data: this.moderators.has(uid), error: null };
      case 'free_plan_usage':
        if (!this.moderators.has(uid)) return { data: null, error: { message: 'not_moderator', code: 'P0001' } };
        return { data: this.usage, error: null };
      case 'cleanup_review_queue':
        if (!this.moderators.has(uid)) return { data: null, error: { message: 'not_moderator', code: 'P0001' } };
        return {
          data: this.completions.filter((c) => c.status === 'pending').map((c) => this.reviewRow(c)),
          error: null,
        };
      case 'approve_cleanup':
      case 'reject_cleanup':
        return this.review(name, uid, args);
      case 'my_embers': {
        const mine = this.embers.filter((r) => r.camper_id === uid);
        const total = mine.reduce((sum, r) => sum + Number(r.amount), 0);
        const day = new Date().toISOString().slice(0, 10);
        const today = mine
          .filter((r) => Number(r.amount) > 0 && (r.earned_on ?? String(r.created_at).slice(0, 10)) === day)
          .reduce((sum, r) => sum + Number(r.amount), 0);
        return { data: [{ total, today, daily_limit: 300 }], error: null };
      }
      case 'register_push_token':
        if (!/^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$/.test(String(args.push_token))) {
          return { data: null, error: { message: 'bad_push_token', code: 'P0001' } };
        }
        this.pushTokens.set(String(args.push_token), uid);
        return { data: null, error: null };
      case 'forget_push_token':
        if (this.pushTokens.get(String(args.push_token)) === uid) this.pushTokens.delete(String(args.push_token));
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
    if (typeof query.payload?.task_id === 'string')
      return this.flagTask(uid, query.payload.task_id, String(reason), details);
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

  private flagTask(uid: string, taskId: string, reason: string, details: unknown): QueryResult {
    const task = this.cleanups.get(taskId);
    if (!task) {
      return {
        data: null,
        error: { message: 'insert or update on table "flags" violates foreign key', code: '23503' },
      };
    }
    if (task.created_by === uid) return { data: null, error: { message: 'own_content', code: 'P0001' } };
    if (this.flags.some((f) => f.reporter === uid && f.status === 'open' && f.taskId === taskId)) {
      return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } };
    }
    this.flags.push({
      reporter: uid,
      taskId,
      reason,
      ...(typeof details === 'string' ? { details } : {}),
      status: 'open',
    });
    const reporters = new Set(
      this.flags.filter((f) => f.taskId === taskId && f.status === 'open').map((f) => f.reporter),
    );
    if (reporters.size >= 3) task.hidden = true;
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
        // Your own files, and not while a photo on a spot (or a cleanup) uses one.
        const listed = this.listedPaths();
        const removed = paths.filter(
          (path) => this.files.get(path)?.owner === uid && uid != null && !listed.has(photoForPreview(path)),
        );
        for (const path of removed) this.files.delete(path);
        return Promise.resolve({ data: removed.map((name) => ({ name })), error: null });
      },
    };
  }

  /** Storage's upload rules (migration 0006's policies on storage.objects). */
  private answerUpload(path: string, body: ArrayBuffer): StorageResult {
    const uid = this.auth.userId;
    const denied = { data: null, error: { message: 'new row violates row-level security policy', statusCode: '403' } };
    if (!uid || !path.startsWith(`${uid}/`) || this.postingBlock(uid) || this.pauseBlock(true)) return denied;
    // A preview only after its photo (migration 0011).
    const preview = PREVIEW_PATH.test(path);
    if (!PHOTO_PATH.test(path) && !preview) return denied;
    if (preview && this.files.get(photoForPreview(path))?.owner !== uid) return denied;
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
    const refused = this.pauseBlock(true) ?? this.postingBlock(uid);
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
      // Taken-back "Still good"s only for the camper who sent them (0007).
      const rows = this.checkins
        .filter((r) => !r.hidden && !blocked.has(String(r.camper_id)) && this.visibleSpot(r.spot_id, uid))
        .filter((r) => r.withdrawn_at == null || (uid != null && r.camper_id === uid))
        .map(({ hidden: _hidden, withdrawn_at: withdrawnAt, ...r }) => ({
          ...r,
          camper_name: this.profiles.get(String(r.camper_id)) ?? null,
          withdrawn: withdrawnAt != null,
        }))
        .filter((r) => this.matches(r, query.filters))
        .reverse();
      return this.shape(rows, query);
    }
    if (!uid || query.op !== 'insert') {
      return { data: null, error: { message: 'permission denied for table checkins', code: '42501' } };
    }
    const refused = this.pauseBlock(false) ?? this.postingBlock(uid);
    if (refused) return { data: null, error: refused };
    const { spot_id: spotId, kind, note } = query.payload ?? {};
    const fail = (message: string) => ({ data: null, error: { message, code: 'P0001' } });
    if (typeof note === 'string' && hasBlockedWords(note)) return fail('blocked_words');
    const spot = this.visibleSpot(spotId, uid);
    if (!spot) return fail('spot_gone');
    if (kind === 'still_good' && spot.created_by === uid) return fail('own_spot');
    const now = Date.now();
    const recent = (r: Row) =>
      now - Date.parse(String(r.created_at)) < (kind === 'still_good' ? 30 * 86_400_000 : 20 * 3_600_000);
    if (this.checkins.some((r) => r.camper_id === uid && r.spot_id === spotId && r.kind === kind && recent(r))) {
      return fail(kind === 'still_good' ? 'confirmed_recently' : 'checkin_recent');
    }
    const at = new Date(now).toISOString();
    this.checkins.push({
      id: this.checkins.length + 1,
      spot_id: spotId,
      camper_id: uid,
      kind,
      note: typeof note === 'string' ? note : null,
      created_at: at,
      hidden: false,
      withdrawn_at: null,
    });
    // As moderation.after_checkin and the spots_api view do.
    spot.report_count = Number(spot.report_count ?? 0) + 1;
    if (kind === 'still_good') {
      spot.last_confirmed_at = at;
      spot.alerts = [];
      if (this.confirmations(spot) >= 2) spot.verified = true;
    } else {
      spot.alerts = [{ kind, at }, ...((spot.alerts as Row[] | undefined) ?? [])].slice(0, 3);
      // A change report takes back this camper's "Still good" here.
      const mine = this.checkins.filter(
        (r) => r.spot_id === spotId && r.camper_id === uid && r.kind === 'still_good' && r.withdrawn_at == null,
      );
      for (const r of mine) r.withdrawn_at = at;
      if (mine.length > 0) {
        const good = this.checkins
          .filter((r) => r.spot_id === spotId && r.kind === 'still_good' && !r.hidden && r.withdrawn_at == null)
          .map((r) => String(r.created_at))
          .sort()
          .at(-1);
        spot.last_confirmed_at = good ?? null;
        if (spot.verified && spot.created_by != null && this.confirmations(spot) < 2) spot.verified = false;
      }
    }
    return { data: null, error: null };
  }

  /** Files a spot photo or a cleanup uses (moderation.photo_listed). */
  private listedPaths(): Set<unknown> {
    return new Set([
      ...[...this.photos.values()].map((r) => r.path),
      ...[...this.cleanups.values()].map((r) => r.before_path),
      ...this.completions.flatMap((r) => [r.after_path, r.haul_path]),
    ]);
  }

  /** The cleanup_tasks_api row for a cleanup, as `uid` sees it. */
  private cleanupView(task: Row, uid: string | null): Row {
    const blocked = this.blockedBy(uid);
    const done = this.completions.find((c) => c.task_id === task.id && c.status === 'approved');
    const shown = done && !blocked.has(String(done.camper_id)) ? done : undefined;
    const spot = this.visibleSpot(task.spot_id, uid);
    return {
      id: task.id,
      latitude: task.latitude,
      longitude: task.longitude,
      kind: task.kind,
      size: task.size,
      note: task.note ?? null,
      status: task.status,
      before_path: task.before_path,
      created_by: task.created_by ?? null,
      posted_by: this.profiles.get(String(task.created_by)) ?? null,
      created_at: task.created_at,
      spot_id: task.spot_id ?? null,
      spot_name: spot ? (spot.name as string) : null,
      hidden: task.hidden === true,
      done_at: task.done_at ?? null,
      cleaned_by_id: shown ? shown.camper_id : null,
      cleaned_by: shown ? (this.profiles.get(String(shown.camper_id)) ?? null) : null,
      after_path: shown ? shown.after_path : null,
      haul_path: shown ? shown.haul_path : null,
    };
  }

  /** Cleanups (migration 0008): reading them, posting one, deleting your own. */
  private answerCleanup(query: FakeQuery, uid: string | null): QueryResult {
    if (query.table === 'cleanup_tasks_api') {
      const blocked = this.blockedBy(uid);
      const rows = [...this.cleanups.values()]
        .filter((t) => !t.hidden || (uid != null && t.created_by === uid))
        .filter((t) => !blocked.has(String(t.created_by)))
        .map((t) => this.cleanupView(t, uid))
        .filter((r) => this.matches(r, query.filters))
        .reverse();
      return this.shape(rows, query);
    }
    if (!uid) return { data: null, error: { message: 'permission denied for table cleanup_tasks', code: '42501' } };
    if (query.op === 'delete') {
      const untouched = (t: Row) =>
        t.created_by === uid &&
        t.status === 'open' &&
        t.hidden !== true &&
        !this.completions.some((c) => c.task_id === t.id) &&
        !this.flags.some((f) => f.taskId === t.id && f.status === 'open');
      const gone = [...this.cleanups.values()].filter((t) => this.matches(t, query.filters) && untouched(t));
      for (const t of gone) this.cleanups.delete(String(t.id));
      return this.shape(
        gone.map((t) => ({ id: t.id })),
        query,
      );
    }
    if (query.op !== 'insert') {
      return { data: null, error: { message: 'permission denied for table cleanup_tasks', code: '42501' } };
    }
    const refused = this.pauseBlock(true) ?? this.postingBlock(uid);
    if (refused) return { data: null, error: refused };
    const { id, location, kind, size, note, before_path: path, spot_id: spotId } = query.payload ?? {};
    const fail = (message: string) => ({ data: null, error: { message, code: 'P0001' } });
    if (typeof note === 'string' && hasBlockedWords(note)) return fail('blocked_words');
    if (path !== `${uid}/${String(id)}.jpg`) return fail('photo_path');
    if (this.files.get(String(path))?.owner !== uid) return fail('photo_missing');
    if (this.cleanups.has(String(id))) return { data: null, error: { message: 'duplicate key value', code: '23505' } };
    if (this.listedPaths().has(String(path))) return fail('photo_used');
    const at = readPoint(location);
    if (!at) return { data: null, error: { message: 'parse error - invalid geometry', code: 'XX000' } };
    if (spotId != null) {
      const spot = this.visibleSpot(spotId, uid);
      if (!spot || distanceMeters(spot as unknown as typeof at, at) > 2_000) return fail('spot_too_far');
    }
    const near = [...this.cleanups.values()].some(
      (t) => t.status !== 'done' && !t.hidden && distanceMeters(t as unknown as typeof at, at) <= 30,
    );
    if (near) return fail('cleanup_nearby');
    this.cleanups.set(String(id), {
      id,
      ...at,
      kind,
      size,
      note: typeof note === 'string' ? note.trim() || null : null,
      status: 'open',
      before_path: path,
      created_by: uid,
      created_at: new Date().toISOString(),
      spot_id: spotId ?? null,
      hidden: false,
      done_at: null,
    });
    return { data: null, error: null };
  }

  /** Cleanups sent for review: sending one, and reading your own (or approved ones). */
  private answerCompletion(query: FakeQuery, uid: string | null): QueryResult {
    if (query.op === 'select') {
      const rows = this.completions
        .filter((c) => c.status === 'approved' || (uid != null && c.camper_id === uid))
        .filter((c) => this.matches(c, query.filters));
      return this.shape(rows, query);
    }
    if (!uid || query.op !== 'insert') {
      return { data: null, error: { message: 'permission denied for table cleanup_completions', code: '42501' } };
    }
    const refused = this.pauseBlock(true) ?? this.postingBlock(uid);
    if (refused) return { data: null, error: refused };
    const {
      id,
      task_id: taskId,
      after_path: after,
      haul_path: haul,
      location,
      accuracy_m: accuracy,
      note,
    } = query.payload ?? {};
    const fail = (message: string) => ({ data: null, error: { message, code: 'P0001' } });
    if (typeof note === 'string' && hasBlockedWords(note)) return fail('blocked_words');
    if (after !== `${uid}/${String(id)}.jpg` || !String(haul).startsWith(`${uid}/`) || haul === after) {
      return fail('photo_path');
    }
    if (this.files.get(String(after))?.owner !== uid || this.files.get(String(haul))?.owner !== uid) {
      return fail('photo_missing');
    }
    if (this.completions.some((c) => c.id === id))
      return { data: null, error: { message: 'duplicate key', code: '23505' } };
    if (this.listedPaths().has(String(after)) || this.listedPaths().has(String(haul))) return fail('photo_used');
    const task = this.cleanups.get(String(taskId));
    if (!task || task.hidden) return fail('cleanup_gone');
    if (task.status === 'done') return fail('cleanup_done');
    if (task.status === 'review') return fail('cleanup_in_review');
    const at = readPoint(location);
    if (!at) return { data: null, error: { message: 'parse error - invalid geometry', code: 'XX000' } };
    if (distanceMeters(task as unknown as typeof at, at) > 150) return fail('cleanup_too_far');
    if (this.completions.filter((c) => c.task_id === taskId && c.camper_id === uid).length >= 2) {
      return fail('cleanup_tries');
    }
    this.completions.push({
      id,
      task_id: taskId,
      camper_id: uid,
      after_path: after,
      haul_path: haul,
      ...at,
      accuracy_m: typeof accuracy === 'number' ? accuracy : null,
      note: typeof note === 'string' ? note.trim() || null : null,
      status: 'pending',
      size: null,
      review_note: null,
      created_at: new Date().toISOString(),
    });
    task.status = 'review';
    return { data: null, error: null };
  }

  /** A row of public.cleanup_review_queue(). */
  private reviewRow(c: Row): Row {
    const task = this.cleanups.get(String(c.task_id)) ?? {};
    const spot = typeof task.spot_id === 'string' ? this.spots.get(task.spot_id) : undefined;
    return {
      completion_id: c.id,
      task_id: c.task_id,
      kind: task.kind,
      task_size: task.size,
      task_note: task.note ?? null,
      before_path: task.before_path,
      after_path: c.after_path,
      haul_path: c.haul_path,
      note: c.note,
      camper_id: c.camper_id,
      camper_name: this.profiles.get(String(c.camper_id)) ?? null,
      camper_joined: '2026-10-01T12:00:00+00:00',
      camper_approved: this.completions.filter((a) => a.camper_id === c.camper_id && a.status === 'approved').length,
      posted_by: task.created_by ?? null,
      posted_by_name: this.profiles.get(String(task.created_by)) ?? null,
      spot_id: task.spot_id ?? null,
      spot_name: spot ? spot.name : null,
      distance_m: Math.round(distanceMeters(task as never, c as never)),
      accuracy_m: c.accuracy_m,
      tries: this.completions.filter((r) => r.task_id === c.task_id && r.camper_id === c.camper_id).length,
      task_created_at: task.created_at,
      sent_at: c.created_at,
    };
  }

  /** approve_cleanup and reject_cleanup, as a moderator. */
  private review(name: string, uid: string, args: Row): QueryResult {
    const fail = (message: string) => ({ data: null, error: { message, code: 'P0001' } });
    if (!this.moderators.has(uid)) return fail('not_moderator');
    const c = this.completions.find((r) => r.id === args.completion);
    if (!c) return fail('review_gone');
    if (c.status !== 'pending') return fail('review_done');
    const task = this.cleanups.get(String(c.task_id));
    if (!task) return fail('review_gone');
    if (name === 'reject_cleanup') {
      const why = String(args.reason ?? '').trim();
      if (!why) return fail('reason_needed');
      Object.assign(c, { status: 'rejected', review_note: why });
      task.status = 'open';
      return { data: null, error: null };
    }
    const size = String(args.final_size ?? task.size);
    if (!(size in CLEANUP_EMBERS)) return fail('invalid_size');
    Object.assign(c, { status: 'approved', size, reviewed_at: new Date().toISOString() });
    Object.assign(task, { status: 'done', done_at: new Date().toISOString() });
    const award = (camper: unknown, reason: string, amount: number) => {
      if (camper == null) return;
      this.embers.push({
        id: this.embers.length + 1,
        camper_id: camper,
        reason,
        ref: task.id,
        spot_id: task.spot_id ?? null,
        spot_name: typeof task.spot_id === 'string' ? (this.spots.get(task.spot_id)?.name ?? null) : null,
        amount,
        full_amount: amount,
        earned_on: new Date().toISOString().slice(0, 10),
        created_at: new Date().toISOString(),
      });
    };
    award(c.camper_id, 'cleanup', CLEANUP_EMBERS[size] ?? 0);
    if (task.created_by !== c.camper_id) award(task.created_by, 'cleanup_reported', 10);
    return { data: null, error: null };
  }

  /** moderation.confirmations: campers other than its own whose "Still good" counts. */
  private confirmations(spot: Row): number {
    return new Set(
      this.checkins
        .filter(
          (r) =>
            r.spot_id === spot.id &&
            r.kind === 'still_good' &&
            !r.hidden &&
            r.withdrawn_at == null &&
            r.camper_id !== spot.created_by,
        )
        .map((r) => r.camper_id),
    ).size;
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
