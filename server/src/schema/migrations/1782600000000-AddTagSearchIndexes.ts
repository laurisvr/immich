import { Kysely, sql } from 'kysely';

// Mirrors DatabaseRepository.targetListCount; tag_search is not one of the
// upstream-managed vector indexes, so the list count is fixed at build time.
function targetListCount(count: number): number {
  if (count < 128_000) {
    return 1;
  } else if (count < 2_048_000) {
    return 1 << (32 - Math.clz32(count / 1000));
  }
  return 1 << (33 - Math.clz32(Math.sqrt(count)));
}

export async function up(db: Kysely<any>): Promise<void> {
  // Literal tag matching (exact / word / n-gram equality)
  await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS tag_search_tag_lower_idx ON tag_search (LOWER(tag))`.execute(db);
  // Word-boundary regex matching (~ operator)
  await sql`CREATE INDEX IF NOT EXISTS tag_search_tag_trgm_idx ON tag_search USING gin (LOWER(tag) gin_trgm_ops)`.execute(
    db,
  );

  // ANN index for the embedding channel; options mirror vectorIndexQuery()
  const {
    rows: [{ count }],
  } = await sql<{ count: number }>`SELECT COUNT(*)::int AS count FROM tag_search`.execute(db);
  const lists = targetListCount(count);
  await sql
    .raw(
      `CREATE INDEX IF NOT EXISTS tag_search_embedding_idx ON tag_search USING vchordrq (embedding vector_cosine_ops) WITH (options = $$
      residual_quantization = false
      [build.internal]
      lists = [${lists}]
      spherical_centroids = true
      build_threads = 4
      sampling_factor = 1024
      $$)`,
    )
    .execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX IF EXISTS tag_search_embedding_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS tag_search_tag_trgm_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS tag_search_tag_lower_idx`.execute(db);
}
