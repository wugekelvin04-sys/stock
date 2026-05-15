import Database from 'better-sqlite3'
import path from 'node:path'
import { app } from 'electron'

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (_db) return _db
  const dbPath = path.join(app.getPath('userData'), 'stock-desk.db')
  _db = new Database(dbPath)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  migrate(_db)
  return _db
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS holdings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('stock','option')),
      qty REAL NOT NULL,
      cost_basis REAL NOT NULL,
      strike REAL,
      expiry TEXT,
      side TEXT CHECK(side IN ('call','put',NULL)),
      exchange TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS quote_cache (
      key TEXT PRIMARY KEY,
      data_json TEXT NOT NULL,
      fetched_at INTEGER NOT NULL,
      ttl_seconds INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_picks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      picks_json TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      triggered_at INTEGER NOT NULL,
      content TEXT NOT NULL,
      portfolio_snapshot TEXT
    );

    CREATE TABLE IF NOT EXISTS search_history (
      query TEXT PRIMARY KEY,
      used_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS watchlist_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS watchlist_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL REFERENCES watchlist_groups(id) ON DELETE CASCADE,
      symbol TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(group_id, symbol)
    );

    CREATE TABLE IF NOT EXISTS sector_picks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      picks_json TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `)
}

// ── Holdings ──────────────────────────────────────────────────────────────────

export interface HoldingRow {
  id: number
  symbol: string
  type: 'stock' | 'option'
  qty: number
  costBasis: number
  strike?: number
  expiry?: string
  side?: 'call' | 'put'
  exchange?: string
}

export function saveHoldings(records: Omit<HoldingRow, 'id'>[]) {
  const db = getDb()
  const upsert = db.prepare(`
    INSERT INTO holdings (symbol, type, qty, cost_basis, strike, expiry, side, exchange, updated_at)
    VALUES (@symbol, @type, @qty, @costBasis, @strike, @expiry, @side, @exchange, unixepoch())
    ON CONFLICT DO NOTHING
  `)
  const insertMany = db.transaction((rows: typeof records) => {
    for (const r of rows) upsert.run(r)
  })
  insertMany(records)
}

export function listHoldings(): HoldingRow[] {
  return getDb()
    .prepare(`SELECT id, symbol, type, qty, cost_basis as costBasis, strike, expiry, side, exchange FROM holdings ORDER BY symbol`)
    .all() as HoldingRow[]
}

export function deleteHolding(id: number) {
  getDb().prepare(`DELETE FROM holdings WHERE id = ?`).run(id)
}

export function clearHoldings() {
  getDb().prepare(`DELETE FROM holdings`).run()
}

// ── Cache ─────────────────────────────────────────────────────────────────────

export function cacheGet(key: string): unknown | null {
  const row = getDb()
    .prepare(`SELECT data_json, fetched_at, ttl_seconds FROM quote_cache WHERE key = ?`)
    .get(key) as { data_json: string; fetched_at: number; ttl_seconds: number } | undefined
  if (!row) return null
  if (Date.now() / 1000 - row.fetched_at > row.ttl_seconds) return null
  return JSON.parse(row.data_json)
}

export function cacheSet(key: string, data: unknown, ttlSeconds: number) {
  getDb()
    .prepare(`INSERT OR REPLACE INTO quote_cache (key, data_json, fetched_at, ttl_seconds) VALUES (?, ?, ?, ?)`)
    .run(key, JSON.stringify(data), Math.floor(Date.now() / 1000), ttlSeconds)
}

export function cacheGetStale(key: string): unknown | null {
  const row = getDb()
    .prepare(`SELECT data_json FROM quote_cache WHERE key = ?`)
    .get(key) as { data_json: string } | undefined
  return row ? JSON.parse(row.data_json) : null
}

// ── Daily picks ───────────────────────────────────────────────────────────────

export interface DailyPick {
  symbol: string
  reason: string
}

export function saveDailyPicks(date: string, picks: DailyPick[]) {
  getDb()
    .prepare(`INSERT INTO daily_picks (date, picks_json) VALUES (?, ?)`)
    .run(date, JSON.stringify(picks))
}

export function getLatestDailyPicks(): { date: string; picks: DailyPick[] } | null {
  const row = getDb()
    .prepare(`SELECT date, picks_json FROM daily_picks ORDER BY id DESC LIMIT 1`)
    .get() as { date: string; picks_json: string } | undefined
  if (!row) return null
  return { date: row.date, picks: JSON.parse(row.picks_json) as DailyPick[] }
}

// ── Sector picks ─────────────────────────────────────────────────────────────

export interface SectorPickStock {
  symbol: string
  reason: string  // one-line why this stock in this sector today
}

export interface SectorPick {
  name: string        // sector display name, e.g. "半导体"
  etf: string         // reference ETF, e.g. "SOXX"
  changeHint: string  // short market context, e.g. "出口限制松绑带动整体上涨"
  stocks: SectorPickStock[]
}

export function saveSectorPicks(date: string, picks: SectorPick[]) {
  getDb()
    .prepare(`INSERT INTO sector_picks (date, picks_json) VALUES (?, ?)`)
    .run(date, JSON.stringify(picks))
}

export function getLatestSectorPicks(): { date: string; picks: SectorPick[] } | null {
  const row = getDb()
    .prepare(`SELECT date, picks_json FROM sector_picks ORDER BY id DESC LIMIT 1`)
    .get() as { date: string; picks_json: string } | undefined
  if (!row) return null
  return { date: row.date, picks: JSON.parse(row.picks_json) as SectorPick[] }
}

// ── Insights ──────────────────────────────────────────────────────────────────

export function saveInsight(content: string, portfolioSnapshot?: string) {
  getDb()
    .prepare(`INSERT INTO insights (triggered_at, content, portfolio_snapshot) VALUES (unixepoch(), ?, ?)`)
    .run(content, portfolioSnapshot ?? null)
}

export function listInsights(limit = 20) {
  return getDb()
    .prepare(`SELECT id, triggered_at, content FROM insights ORDER BY triggered_at DESC LIMIT ?`)
    .all(limit) as { id: number; triggered_at: number; content: string }[]
}

// ── Search history ────────────────────────────────────────────────────────────

export function addSearchHistory(query: string) {
  getDb()
    .prepare(`INSERT OR REPLACE INTO search_history (query, used_at) VALUES (?, unixepoch())`)
    .run(query)
}

export function getSearchHistory(limit = 10): string[] {
  return (getDb()
    .prepare(`SELECT query FROM search_history ORDER BY used_at DESC LIMIT ?`)
    .all(limit) as { query: string }[]).map((r) => r.query)
}

// ── Settings ──────────────────────────────────────────────────────────────────

export function getSetting(key: string, fallback: string): string {
  const row = getDb().prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as { value: string } | undefined
  return row?.value ?? fallback
}

export function setSetting(key: string, value: string) {
  getDb().prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`).run(key, value)
}

// ── Watchlist ─────────────────────────────────────────────────────────────────

export interface WatchGroup {
  id: number
  name: string
  sortOrder: number
}

export interface WatchItem {
  id: number
  groupId: number
  symbol: string
  sortOrder: number
}

export function listWatchGroups(): WatchGroup[] {
  return getDb()
    .prepare(`SELECT id, name, sort_order as sortOrder FROM watchlist_groups ORDER BY sort_order, id`)
    .all() as WatchGroup[]
}

export function addWatchGroup(name: string): WatchGroup {
  const db = getDb()
  const maxOrder = (db.prepare(`SELECT MAX(sort_order) as m FROM watchlist_groups`).get() as { m: number | null }).m ?? -1
  db.prepare(`INSERT INTO watchlist_groups (name, sort_order) VALUES (?, ?)`).run(name, maxOrder + 1)
  return db.prepare(`SELECT id, name, sort_order as sortOrder FROM watchlist_groups WHERE name = ?`).get(name) as WatchGroup
}

export function deleteWatchGroup(id: number) {
  getDb().prepare(`DELETE FROM watchlist_groups WHERE id = ?`).run(id)
}

export function listWatchItems(groupId: number): WatchItem[] {
  return getDb()
    .prepare(`SELECT id, group_id as groupId, symbol, sort_order as sortOrder FROM watchlist_items WHERE group_id = ? ORDER BY sort_order, id`)
    .all(groupId) as WatchItem[]
}

export function addWatchItem(groupId: number, symbol: string) {
  const db = getDb()
  const maxOrder = (db.prepare(`SELECT MAX(sort_order) as m FROM watchlist_items WHERE group_id = ?`).get(groupId) as { m: number | null }).m ?? -1
  db.prepare(`INSERT OR IGNORE INTO watchlist_items (group_id, symbol, sort_order) VALUES (?, ?, ?)`).run(groupId, symbol.toUpperCase(), maxOrder + 1)
}

export function removeWatchItem(groupId: number, symbol: string) {
  getDb().prepare(`DELETE FROM watchlist_items WHERE group_id = ? AND symbol = ?`).run(groupId, symbol.toUpperCase())
}

export function isWatched(symbol: string): { groupId: number; groupName: string }[] {
  return getDb()
    .prepare(`SELECT wi.group_id as groupId, wg.name as groupName FROM watchlist_items wi JOIN watchlist_groups wg ON wg.id = wi.group_id WHERE wi.symbol = ?`)
    .all(symbol.toUpperCase()) as { groupId: number; groupName: string }[]
}
