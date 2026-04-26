import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const DEFAULT_DB_RELATIVE_PATH = ['.figma-ds-cli', 'write-queue', 'queue.sqlite'];

function nowTs(now = Date.now) {
  return Number(now());
}

function jsonEncode(value) {
  if (value === undefined) return null;
  return JSON.stringify(value);
}

function jsonDecode(value, fallback = null) {
  if (value == null) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function ensureNonEmptyString(value, fieldName) {
  if (value == null) return null;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
  return value.trim();
}

function mapOperationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    action: row.action,
    intent: row.intent,
    queueMode: row.queue_mode,
    targetPageId: row.target_page_id,
    targetPageName: row.target_page_name,
    payload: jsonDecode(row.payload_json),
    status: row.status,
    attemptCount: row.attempt_count,
    leaseOwner: row.lease_owner,
    leaseExpiresAt: row.lease_expires_at,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    result: jsonDecode(row.result_json),
    errorText: row.error_text,
    preSnapshot: jsonDecode(row.pre_snapshot_json),
    postSnapshot: jsonDecode(row.post_snapshot_json)
  };
}

function mapEventRow(row) {
  return {
    id: row.id,
    opId: row.op_id,
    ts: row.ts,
    eventType: row.event_type,
    detail: jsonDecode(row.detail_json)
  };
}

export function resolveQueueDbPath(env = process.env) {
  if (env?.FIGMA_WRITE_QUEUE_DB) return env.FIGMA_WRITE_QUEUE_DB;
  return join(homedir(), ...DEFAULT_DB_RELATIVE_PATH);
}

function ensureQueueDbDir(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
}

function runStatement(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }
      resolve({ changes: this?.changes ?? 0, lastID: this?.lastID ?? null });
    });
  });
}

function getStatement(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(row ?? null);
    });
  });
}

function allStatement(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(rows ?? []);
    });
  });
}

function closeDb(db) {
  return new Promise((resolve, reject) => {
    db.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS operations (
    id TEXT PRIMARY KEY,
    idempotency_key TEXT UNIQUE,
    action TEXT NOT NULL,
    intent TEXT NOT NULL,
    queue_mode TEXT NOT NULL,
    target_page_id TEXT,
    target_page_name TEXT,
    payload_json TEXT,
    status TEXT NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    lease_owner TEXT,
    lease_expires_at INTEGER,
    created_at INTEGER NOT NULL,
    started_at INTEGER,
    finished_at INTEGER,
    result_json TEXT,
    error_text TEXT,
    pre_snapshot_json TEXT,
    post_snapshot_json TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    op_id TEXT NOT NULL,
    ts INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    detail_json TEXT
  )`,
  'CREATE INDEX IF NOT EXISTS idx_operations_status_created_at ON operations(status, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_events_op_id ON events(op_id)'
];

async function openDefaultDb(dbPath) {
  const sqlite3 = await import('sqlite3');
  const Database = sqlite3.default?.Database ?? sqlite3.Database;
  return new Promise((resolve, reject) => {
    const db = new Database(dbPath, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(db);
    });
  });
}

function createSqliteAdapter() {
  let db = null;
  let ownsDb = false;

  return {
    async init({ dbPath, db: injectedDb }) {
      if (injectedDb) {
        db = injectedDb;
        ownsDb = false;
      } else {
        ensureQueueDbDir(dbPath);
        db = await openDefaultDb(dbPath);
        ownsDb = true;
      }

      for (const migration of MIGRATIONS) {
        await runStatement(db, migration);
      }
    },
    async close() {
      if (db && ownsDb) {
        await closeDb(db);
      }
    },
    async getOperationById(id) {
      const row = await getStatement(db, 'SELECT * FROM operations WHERE id = ?', [id]);
      return mapOperationRow(row);
    },
    async getOperationByIdempotencyKey(idempotencyKey) {
      if (!idempotencyKey) return null;
      const row = await getStatement(db, 'SELECT * FROM operations WHERE idempotency_key = ?', [idempotencyKey]);
      return mapOperationRow(row);
    },
    async insertOperation(record) {
      await runStatement(
        db,
        `INSERT INTO operations (
          id, idempotency_key, action, intent, queue_mode, target_page_id, target_page_name,
          payload_json, status, attempt_count, lease_owner, lease_expires_at, created_at,
          started_at, finished_at, result_json, error_text, pre_snapshot_json, post_snapshot_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.id,
          record.idempotency_key,
          record.action,
          record.intent,
          record.queue_mode,
          record.target_page_id,
          record.target_page_name,
          record.payload_json,
          record.status,
          record.attempt_count,
          record.lease_owner,
          record.lease_expires_at,
          record.created_at,
          record.started_at,
          record.finished_at,
          record.result_json,
          record.error_text,
          record.pre_snapshot_json,
          record.post_snapshot_json
        ]
      );
    },
    async insertEvent(opId, ts, eventType, detail) {
      await runStatement(
        db,
        'INSERT INTO events (op_id, ts, event_type, detail_json) VALUES (?, ?, ?, ?)',
        [opId, ts, eventType, jsonEncode(detail)]
      );
    },
    async listEvents(opId) {
      const rows = await allStatement(db, 'SELECT * FROM events WHERE op_id = ? ORDER BY id ASC', [opId]);
      return rows.map(mapEventRow);
    },
    async getNextQueued() {
      const row = await getStatement(
        db,
        'SELECT * FROM operations WHERE status = ? ORDER BY created_at ASC LIMIT 1',
        ['queued']
      );
      return mapOperationRow(row);
    },
    async getActiveRunning(now) {
      const row = await getStatement(
        db,
        'SELECT * FROM operations WHERE status = ? AND lease_expires_at > ? ORDER BY started_at ASC LIMIT 1',
        ['running', now]
      );
      return mapOperationRow(row);
    },
    async listExpiredRunning(now) {
      const rows = await allStatement(
        db,
        'SELECT * FROM operations WHERE status = ? AND lease_expires_at <= ? ORDER BY lease_expires_at ASC',
        ['running', now]
      );
      return rows.map(mapOperationRow);
    },
    async markRunning(id, patch) {
      await runStatement(
        db,
        `UPDATE operations
         SET status = 'running',
             attempt_count = ?,
             lease_owner = ?,
             lease_expires_at = ?,
             started_at = COALESCE(started_at, ?),
             error_text = NULL
         WHERE id = ?`,
        [patch.attemptCount, patch.leaseOwner, patch.leaseExpiresAt, patch.startedAt, id]
      );
    },
    async requeue(id) {
      await runStatement(
        db,
        `UPDATE operations
         SET status = 'queued',
             lease_owner = NULL,
             lease_expires_at = NULL
         WHERE id = ?`,
        [id]
      );
    },
    async markFailed(id, patch) {
      await runStatement(
        db,
        `UPDATE operations
         SET status = 'failed',
             lease_owner = NULL,
             lease_expires_at = NULL,
             finished_at = ?,
             error_text = ?
         WHERE id = ?`,
        [patch.finishedAt, patch.errorText, id]
      );
    },
    async markSuccess(id, patch) {
      await runStatement(
        db,
        `UPDATE operations
         SET status = 'success',
             lease_owner = NULL,
             lease_expires_at = NULL,
             finished_at = ?,
             result_json = ?,
             pre_snapshot_json = ?,
             post_snapshot_json = ?,
             error_text = NULL
         WHERE id = ?`,
        [patch.finishedAt, patch.resultJson, patch.preSnapshotJson, patch.postSnapshotJson, id]
      );
    }
  };
}

export function createInMemoryQueueStore() {
  const operations = new Map();
  const events = [];
  let eventId = 0;

  return {
    async init() {},
    async close() {},
    async getOperationById(id) {
      const op = operations.get(id);
      return op ? mapOperationRow(op) : null;
    },
    async getOperationByIdempotencyKey(idempotencyKey) {
      if (!idempotencyKey) return null;
      for (const op of operations.values()) {
        if (op.idempotency_key === idempotencyKey) return mapOperationRow(op);
      }
      return null;
    },
    async insertOperation(record) {
      if (record.idempotency_key) {
        for (const op of operations.values()) {
          if (op.idempotency_key === record.idempotency_key) {
            throw new Error('UNIQUE constraint failed: operations.idempotency_key');
          }
        }
      }
      operations.set(record.id, { ...record });
    },
    async insertEvent(opId, ts, eventType, detail) {
      eventId += 1;
      events.push({
        id: eventId,
        op_id: opId,
        ts,
        event_type: eventType,
        detail_json: jsonEncode(detail)
      });
    },
    async listEvents(opId) {
      return events.filter((evt) => evt.op_id === opId).map(mapEventRow);
    },
    async getNextQueued() {
      const queued = Array.from(operations.values())
        .filter((op) => op.status === 'queued')
        .sort((a, b) => a.created_at - b.created_at);
      return mapOperationRow(queued[0] ?? null);
    },
    async getActiveRunning(now) {
      const running = Array.from(operations.values())
        .filter((op) => op.status === 'running' && op.lease_expires_at > now)
        .sort((a, b) => (a.started_at ?? 0) - (b.started_at ?? 0));
      return mapOperationRow(running[0] ?? null);
    },
    async listExpiredRunning(now) {
      return Array.from(operations.values())
        .filter((op) => op.status === 'running' && op.lease_expires_at <= now)
        .sort((a, b) => (a.lease_expires_at ?? 0) - (b.lease_expires_at ?? 0))
        .map(mapOperationRow);
    },
    async markRunning(id, patch) {
      const op = operations.get(id);
      if (!op) return;
      op.status = 'running';
      op.attempt_count = patch.attemptCount;
      op.lease_owner = patch.leaseOwner;
      op.lease_expires_at = patch.leaseExpiresAt;
      op.started_at = op.started_at ?? patch.startedAt;
      op.error_text = null;
    },
    async requeue(id) {
      const op = operations.get(id);
      if (!op) return;
      op.status = 'queued';
      op.lease_owner = null;
      op.lease_expires_at = null;
    },
    async markFailed(id, patch) {
      const op = operations.get(id);
      if (!op) return;
      op.status = 'failed';
      op.lease_owner = null;
      op.lease_expires_at = null;
      op.finished_at = patch.finishedAt;
      op.error_text = patch.errorText;
    },
    async markSuccess(id, patch) {
      const op = operations.get(id);
      if (!op) return;
      op.status = 'success';
      op.lease_owner = null;
      op.lease_expires_at = null;
      op.finished_at = patch.finishedAt;
      op.result_json = patch.resultJson;
      op.pre_snapshot_json = patch.preSnapshotJson;
      op.post_snapshot_json = patch.postSnapshotJson;
      op.error_text = null;
    }
  };
}

export class QueueStore {
  constructor(options = {}) {
    this.env = options.env ?? process.env;
    this.dbPath = options.dbPath ?? resolveQueueDbPath(this.env);
    this.now = options.now ?? Date.now;
    this.ownerId = options.ownerId ?? `worker-${randomUUID()}`;
    this.leaseMs = options.leaseMs ?? 5000;
    this.maxAttempts = options.maxAttempts ?? 2;
    this.adapter = options.adapter ?? createSqliteAdapter();
    this.db = options.db ?? null;
  }

  async init() {
    await this.adapter.init({ dbPath: this.dbPath, db: this.db });
    return this;
  }

  async close() {
    await this.adapter.close();
  }

  async enqueue(operation) {
    const idempotencyKey = ensureNonEmptyString(operation?.idempotencyKey, 'idempotencyKey');
    if (idempotencyKey) {
      const existing = await this.adapter.getOperationByIdempotencyKey(idempotencyKey);
      if (existing) return existing;
    }

    const createdAt = nowTs(this.now);
    const id = ensureNonEmptyString(operation?.operationId, 'operationId') ?? randomUUID();
    const record = {
      id,
      idempotency_key: idempotencyKey,
      action: ensureNonEmptyString(operation?.action, 'action') ?? 'eval',
      intent: ensureNonEmptyString(operation?.intent, 'intent') ?? 'write',
      queue_mode: ensureNonEmptyString(operation?.queueMode, 'queueMode') ?? 'inline',
      target_page_id: ensureNonEmptyString(operation?.targetPageId, 'targetPageId'),
      target_page_name: ensureNonEmptyString(operation?.targetPageName, 'targetPageName'),
      payload_json: jsonEncode(operation?.payload ?? null),
      status: 'queued',
      attempt_count: 0,
      lease_owner: null,
      lease_expires_at: null,
      created_at: createdAt,
      started_at: null,
      finished_at: null,
      result_json: null,
      error_text: null,
      pre_snapshot_json: null,
      post_snapshot_json: null
    };

    await this.adapter.insertOperation(record);
    await this.appendEvent(id, 'created', { action: record.action, queueMode: record.queue_mode });
    return this.getOperation(id);
  }

  async appendEvent(opId, eventType, detail = null) {
    const ts = nowTs(this.now);
    await this.adapter.insertEvent(opId, ts, eventType, detail);
    return { opId, ts, eventType, detail };
  }

  async getOperation(id) {
    return this.adapter.getOperationById(id);
  }

  async listEvents(opId) {
    return this.adapter.listEvents(opId);
  }

  async acquireNextLease() {
    await this.requeueExpiredLeases();
    const now = nowTs(this.now);

    const active = await this.adapter.getActiveRunning(now);
    if (active) return null;

    const next = await this.adapter.getNextQueued();
    if (!next) return null;

    const patch = {
      attemptCount: next.attemptCount + 1,
      leaseOwner: this.ownerId,
      leaseExpiresAt: now + this.leaseMs,
      startedAt: now
    };

    await this.adapter.markRunning(next.id, patch);
    await this.appendEvent(next.id, 'leased', {
      ownerId: this.ownerId,
      attemptCount: patch.attemptCount,
      leaseExpiresAt: patch.leaseExpiresAt
    });

    return this.getOperation(next.id);
  }

  async requeueExpiredLeases() {
    const now = nowTs(this.now);
    const expired = await this.adapter.listExpiredRunning(now);

    for (const op of expired) {
      if (op.attemptCount >= this.maxAttempts) {
        const errorText = 'Lease expired and retry limit reached';
        await this.adapter.markFailed(op.id, { finishedAt: now, errorText });
        await this.appendEvent(op.id, 'failed', { reason: errorText });
      } else {
        await this.adapter.requeue(op.id);
        await this.appendEvent(op.id, 'retry_scheduled', {
          reason: 'lease_expired',
          attemptCount: op.attemptCount
        });
      }
    }

    return expired.length;
  }

  async markSuccess(opId, payload = {}) {
    const finishedAt = nowTs(this.now);
    await this.adapter.markSuccess(opId, {
      finishedAt,
      resultJson: jsonEncode(payload.result ?? null),
      preSnapshotJson: jsonEncode(payload.preSnapshot ?? null),
      postSnapshotJson: jsonEncode(payload.postSnapshot ?? null)
    });
    await this.appendEvent(opId, 'success', { finishedAt });
    return this.getOperation(opId);
  }

  async markFailed(opId, errorText) {
    const finishedAt = nowTs(this.now);
    const message = ensureNonEmptyString(errorText, 'errorText') ?? 'Execution failed';
    await this.adapter.markFailed(opId, { finishedAt, errorText: message });
    await this.appendEvent(opId, 'failed', { error: message });
    return this.getOperation(opId);
  }
}

export const _internal = {
  DEFAULT_DB_RELATIVE_PATH,
  MIGRATIONS,
  nowTs,
  jsonEncode,
  jsonDecode,
  mapOperationRow,
  mapEventRow,
  createSqliteAdapter,
  runStatement,
  getStatement,
  allStatement
};
