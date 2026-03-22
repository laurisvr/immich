import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Required for fuzzy tag matching (Levenshtein distance)
  await sql`CREATE EXTENSION IF NOT EXISTS fuzzystrmatch`.execute(db);

  // Per-tag embedding table for hybrid semantic search.
  await sql`
    CREATE TABLE IF NOT EXISTS tag_search (
      "assetId" uuid NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
      tag text NOT NULL,
      embedding vector(768) NOT NULL,
      PRIMARY KEY ("assetId", tag)
    )
  `.execute(db);

  await sql`ALTER TABLE tag_search ALTER COLUMN embedding SET STORAGE EXTERNAL`.execute(db);

  // Pre-computed IDF scores per tag (case-insensitive).
  // Refreshed periodically to avoid expensive aggregation on every search.
  await sql`
    CREATE MATERIALIZED VIEW IF NOT EXISTS tag_idf AS
    SELECT LOWER(tag) as tag,
      COUNT(DISTINCT "assetId") as tag_count,
      (SELECT COUNT(DISTINCT "assetId") FROM tag_search) as total_assets
    FROM tag_search
    GROUP BY LOWER(tag)
  `.execute(db);

  await sql`CREATE UNIQUE INDEX IF NOT EXISTS tag_idf_tag_idx ON tag_idf (tag)`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP MATERIALIZED VIEW IF EXISTS tag_idf`.execute(db);
  await sql`DROP TABLE IF EXISTS tag_search`.execute(db);
}
