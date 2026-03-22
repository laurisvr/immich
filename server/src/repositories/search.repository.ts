import { Injectable } from '@nestjs/common';
import { Kysely, OrderByDirection, Selectable, ShallowDehydrateObject, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { columns } from 'src/database';
import { DummyValue, GenerateSql } from 'src/decorators';
import { MapAsset } from 'src/dtos/asset-response.dto';
import { SearchFilter, SearchOrder } from 'src/dtos/search.dto';
import { AssetStatus, AssetType, AssetVisibility, VectorIndex } from 'src/enum';
import { probes } from 'src/repositories/database.repository';
import { DB } from 'src/schema';
import { AssetExifTable } from 'src/schema/tables/asset-exif.table';
import {
  anyUuid,
  searchAssetBuilder,
  searchAssetBuilderLegacy,
  searchMetadataV3Examples,
  searchStatisticsV3Examples,
  withExifInner,
  withSearchOrder,
} from 'src/utils/database';
import { paginationHelper } from 'src/utils/pagination';
import z from 'zod';

export interface SearchAssetIdOptions {
  checksum?: Buffer;
  id?: string;
}

export interface SearchUserIdOptions {
  libraryId?: string | null;
  userIds?: string[];
}

export type SearchIdOptions = SearchAssetIdOptions & SearchUserIdOptions;

export interface SearchStatusOptions {
  isEncoded?: boolean;
  isFavorite?: boolean;
  isMotion?: boolean;
  isOffline?: boolean;
  isNotInAlbum?: boolean;
  type?: AssetType;
  status?: AssetStatus;
  withArchived?: boolean;
  withDeleted?: boolean;
  visibility?: AssetVisibility;
}

export interface SearchOneToOneRelationOptions {
  withExif?: boolean;
  withStacked?: boolean;
}

export interface SearchRelationOptions extends SearchOneToOneRelationOptions {
  withFaces?: boolean;
  withPeople?: boolean;
}

export interface SearchDateOptions {
  createdBefore?: Date;
  createdAfter?: Date;
  takenBefore?: Date;
  takenAfter?: Date;
  trashedBefore?: Date;
  trashedAfter?: Date;
  updatedBefore?: Date;
  updatedAfter?: Date;
}

export interface SearchPathOptions {
  encodedVideoPath?: string;
  originalFileName?: string;
  originalPath?: string;
  previewPath?: string;
  thumbnailPath?: string;
}

export interface SearchExifOptions {
  city?: string | null;
  country?: string | null;
  lensModel?: string | null;
  make?: string | null;
  model?: string | null;
  state?: string | null;
  description?: string | null;
  rating?: number | null;
}

export interface SearchEmbeddingOptions {
  embedding: string;
  userIds: string[];
}

export interface SearchOcrOptions {
  ocr?: string;
}

export interface SearchPeopleOptions {
  personIds?: string[];
}

export interface SearchTagOptions {
  tagIds?: string[] | null;
}

export interface SearchAlbumOptions {
  albumIds?: string[];
}

export interface SearchOrderOptions {
  orderDirection?: 'asc' | 'desc';
}

export interface SearchPaginationOptions {
  page: number;
  size: number;
}

type BaseAssetSearchOptions = SearchDateOptions &
  SearchIdOptions &
  SearchExifOptions &
  SearchOrderOptions &
  SearchPathOptions &
  SearchStatusOptions &
  SearchUserIdOptions &
  SearchPeopleOptions &
  SearchTagOptions &
  SearchAlbumOptions &
  SearchOcrOptions;

export type AssetSearchOptions = Omit<BaseAssetSearchOptions, 'visibility'> &
  SearchRelationOptions & { visibility?: AssetVisibility | 'not-locked' };

export type AssetSearchBuilderOptions = Omit<AssetSearchOptions, 'orderDirection'>;

export interface AssetSearchBuilderV3Options {
  filter?: SearchFilter;
  /** Server-derived ownership scope. Never client-controlled. */
  userIds?: string[];
  withExif?: boolean;
  withFaces?: boolean;
  withPeople?: boolean;
  withStacked?: boolean;
  order?: SearchOrder;
}

export interface AssetSearchPaginationV3Options {
  size: number;
}

export type SmartSearchOptions = SearchDateOptions &
  SearchEmbeddingOptions &
  SearchExifOptions &
  SearchOneToOneRelationOptions &
  Omit<SearchStatusOptions, 'visibility'> &
  SearchUserIdOptions &
  SearchPeopleOptions &
  SearchTagOptions &
  SearchOcrOptions & { visibility?: AssetVisibility | 'not-locked' };

export type OcrSearchOptions = SearchDateOptions & SearchOcrOptions;

export type LargeAssetSearchOptions = AssetSearchOptions & { minFileSize?: number };

export interface FaceEmbeddingSearch extends SearchEmbeddingOptions {
  hasPerson?: boolean;
  numResults: number;
  maxDistance: number;
  minBirthDate?: Date | null;
}

export interface FaceSearchResult {
  distance: number;
  id: string;
  personId: string | null;
}

export interface AssetDuplicateResult {
  assetId: string;
  duplicateId: string | null;
  distance: number;
}

export interface GetStatesOptions {
  country?: string;
}

export interface GetCitiesOptions extends GetStatesOptions {
  state?: string;
}

export interface GetCameraModelsOptions {
  make?: string;
  lensModel?: string;
}

export interface GetCameraMakesOptions {
  model?: string;
  lensModel?: string;
}

export interface GetCameraLensModelsOptions {
  make?: string;
  model?: string;
}

@Injectable()
export class SearchRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  @GenerateSql({
    params: [
      { page: 1, size: 100 },
      {
        takenAfter: DummyValue.DATE,
        lensModel: DummyValue.STRING,
        withStacked: true,
        isFavorite: true,
        userIds: [DummyValue.UUID],
      },
    ],
  })
  async searchMetadata(pagination: SearchPaginationOptions, options: AssetSearchOptions) {
    const orderDirection = (options.orderDirection?.toLowerCase() || 'desc') as OrderByDirection;
    const items = await searchAssetBuilderLegacy(this.db, options)
      .select(columns.searchAsset)
      .orderBy('asset.fileCreatedAt', orderDirection)
      .orderBy('asset.id', orderDirection)
      .limit(pagination.size + 1)
      .offset((pagination.page - 1) * pagination.size)
      .execute();

    return paginationHelper(items, pagination.size);
  }

  @GenerateSql({
    params: [
      {
        takenAfter: DummyValue.DATE,
        lensModel: DummyValue.STRING,
        isFavorite: true,
        userIds: [DummyValue.UUID],
      },
    ],
  })
  searchStatistics(options: AssetSearchOptions) {
    return searchAssetBuilderLegacy(this.db, options)
      .select((qb) => qb.fn.countAll<number>().as('total'))
      .executeTakeFirstOrThrow();
  }

  @GenerateSql({
    params: [
      100,
      {
        takenAfter: DummyValue.DATE,
        lensModel: DummyValue.STRING,
        withStacked: true,
        isFavorite: true,
        userIds: [DummyValue.UUID],
      },
    ],
  })
  async searchRandom(size: number, options: AssetSearchOptions) {
    return searchAssetBuilderLegacy(this.db, options)
      .select(columns.searchAsset)
      .orderBy(sql`random()`)
      .limit(size)
      .execute();
  }

  @GenerateSql({
    params: [
      100,
      {
        takenAfter: DummyValue.DATE,
        lensModel: DummyValue.STRING,
        withStacked: true,
        isFavorite: true,
        userIds: [DummyValue.UUID],
      },
    ],
  })
  searchLargeAssets(size: number, options: LargeAssetSearchOptions) {
    const orderDirection = (options.orderDirection?.toLowerCase() || 'desc') as OrderByDirection;
    return searchAssetBuilderLegacy(this.db, options)
      .select(columns.searchAsset)
      .$call(withExifInner)
      .where('asset_exif.fileSizeInByte', '>', options.minFileSize || 0)
      .orderBy('asset_exif.fileSizeInByte', orderDirection)
      .limit(size)
      .execute();
  }

  @GenerateSql({
    params: [
      { page: 1, size: 200 },
      {
        takenAfter: DummyValue.DATE,
        embedding: DummyValue.VECTOR,
        lensModel: DummyValue.STRING,
        withStacked: true,
        isFavorite: true,
        userIds: [DummyValue.UUID],
      },
    ],
  })
  searchSmart(pagination: SearchPaginationOptions, options: SmartSearchOptions) {
    if (!z.int().min(1).max(1000).safeParse(pagination.size).success) {
      throw new Error(`Invalid value for 'size': ${pagination.size}`);
    }

    return this.db.transaction().execute(async (trx) => {
      await sql`set local vchordrq.probes = ${sql.lit(probes[VectorIndex.Clip])}`.execute(trx);
      const items = await searchAssetBuilderLegacy(trx, options)
        .select(columns.searchAsset)
        .innerJoin('smart_search', 'asset.id', 'smart_search.assetId')
        .orderBy(sql`smart_search.embedding <=> ${options.embedding}`)
        .orderBy('asset.id', 'asc')
        .limit(pagination.size + 1)
        .offset((pagination.page - 1) * pagination.size)
        .execute();
      return paginationHelper(items, pagination.size);
    });
  }

  @GenerateSql({
    params: [DummyValue.UUID],
  })
  async getEmbedding(assetId: string) {
    return this.db.selectFrom('smart_search').selectAll().where('assetId', '=', assetId).executeTakeFirst();
  }

  @GenerateSql({
    params: [
      {
        userIds: [DummyValue.UUID],
        embedding: DummyValue.VECTOR,
        numResults: 10,
        maxDistance: 0.6,
      },
    ],
  })
  searchFaces({ userIds, embedding, numResults, maxDistance, hasPerson, minBirthDate }: FaceEmbeddingSearch) {
    if (!z.int().min(1).max(1000).safeParse(numResults).success) {
      throw new Error(`Invalid value for 'numResults': ${numResults}`);
    }

    return this.db.transaction().execute(async (trx) => {
      await sql`set local vchordrq.probes = ${sql.lit(probes[VectorIndex.Face])}`.execute(trx);
      return await trx
        .with('cte', (qb) =>
          qb
            .selectFrom('asset_face')
            .select([
              'asset_face.id',
              'asset_face.personId',
              sql<number>`face_search.embedding <=> ${embedding}`.as('distance'),
            ])
            .innerJoin('asset', 'asset.id', 'asset_face.assetId')
            .innerJoin('face_search', 'face_search.faceId', 'asset_face.id')
            .leftJoin('person', 'person.id', 'asset_face.personId')
            .where('asset.ownerId', '=', anyUuid(userIds))
            .where('asset.deletedAt', 'is', null)
            .$if(!!hasPerson, (qb) => qb.where('asset_face.personId', 'is not', null))
            .$if(!!minBirthDate, (qb) =>
              qb.where((eb) =>
                eb.or([eb('person.birthDate', 'is', null), eb('person.birthDate', '<=', minBirthDate!)]),
              ),
            )
            .orderBy('distance')
            .limit(numResults),
        )
        .selectFrom('cte')
        .selectAll()
        .where('cte.distance', '<=', maxDistance)
        .execute();
    });
  }

  @GenerateSql({ params: [DummyValue.STRING] })
  searchPlaces(placeName: string) {
    return this.db
      .selectFrom('geodata_places')
      .selectAll()
      .where(
        () =>
          // kysely doesn't support trigram %>> or <->>> operators
          sql`
            f_unaccent(name) %>> f_unaccent(${placeName}) or
            f_unaccent("admin2Name") %>> f_unaccent(${placeName}) or
            f_unaccent("admin1Name") %>> f_unaccent(${placeName}) or
            f_unaccent("alternateNames") %>> f_unaccent(${placeName})
          `,
      )
      .orderBy(
        sql`
          coalesce(f_unaccent(name) <->>> f_unaccent(${placeName}), 0.1) +
          coalesce(f_unaccent("admin2Name") <->>> f_unaccent(${placeName}), 0.1) +
          coalesce(f_unaccent("admin1Name") <->>> f_unaccent(${placeName}), 0.1) +
          coalesce(f_unaccent("alternateNames") <->>> f_unaccent(${placeName}), 0.1)
        `,
      )
      .limit(20)
      .execute();
  }

  @GenerateSql({ params: [[DummyValue.UUID]] })
  getAssetsByCity(userIds: string[]) {
    return this.db
      .withRecursive('cte', (qb) => {
        const base = qb
          .selectFrom('asset_exif')
          .select(['city', 'assetId'])
          .innerJoin('asset', 'asset.id', 'asset_exif.assetId')
          .where('asset.ownerId', '=', anyUuid(userIds))
          .where('asset.visibility', '=', AssetVisibility.Timeline)
          .where('asset.type', '=', AssetType.Image)
          .where('asset.deletedAt', 'is', null)
          .orderBy('city')
          .limit(1);

        const recursive = qb
          .selectFrom('cte')
          .select(['l.city', 'l.assetId'])
          .innerJoinLateral(
            (qb) =>
              qb
                .selectFrom('asset_exif')
                .select(['city', 'assetId'])
                .innerJoin('asset', 'asset.id', 'asset_exif.assetId')
                .where('asset.ownerId', '=', anyUuid(userIds))
                .where('asset.visibility', '=', AssetVisibility.Timeline)
                .where('asset.type', '=', AssetType.Image)
                .where('asset.deletedAt', 'is', null)
                .whereRef('asset_exif.city', '>', 'cte.city')
                .orderBy('city')
                .limit(1)
                .as('l'),
            (join) => join.onTrue(),
          );

        return sql<{ city: string; assetId: string }>`(${base} union all ${recursive})`;
      })
      .selectFrom('asset')
      .innerJoin('asset_exif', 'asset.id', 'asset_exif.assetId')
      .innerJoin('cte', 'asset.id', 'cte.assetId')
      .select(columns.searchAsset)
      .select((eb) =>
        eb
          .fn('to_jsonb', [eb.table('asset_exif')])
          .$castTo<ShallowDehydrateObject<Selectable<AssetExifTable>>>()
          .as('exifInfo'),
      )
      .orderBy('asset_exif.city')
      .execute();
  }

  async upsert(assetId: string, embedding: string): Promise<void> {
    await this.db
      .insertInto('smart_search')
      .values({ assetId, embedding })
      .onConflict((oc) => oc.column('assetId').doUpdateSet((eb) => ({ embedding: eb.ref('excluded.embedding') })))
      .execute();
  }

  private tagSearchProbes?: number;

  async searchTags(options: SmartSearchOptions, query: string, limit: number): Promise<string[]> {
    // Three scoring channels for tag matching, cheapest-first so the
    // embedding channel never has to scan the whole table:
    // 1. Literal match (btree on LOWER(tag) + trigram index): the query, one
    //    of its words, or a multi-word run of it equals the tag, or the query
    //    appears in the tag on word boundaries → strongest signal, IDF-weighted
    // 2. Fuzzy match (Levenshtein against the distinct tags in tag_idf,
    //    whole query only; distance ≤ 1, or ≤ 2 from 7 chars): an
    //    edit-distance hit is treated as evidence, not a score — it halves
    //    the tag's semantic distance. True typo corrections also embed close
    //    to the query so they surface; coincidental near-words (a rare tag
    //    "bekco" is distance 2 from "beach") embed far away and sink.
    //    Deliberately not per-word: cross-lingual queries hit near-words in
    //    the wrong language ("hond" is distance 1 from "hood") and would
    //    drown out the embedding channel that handles them correctly.
    // 3. LABSE embedding match (vchordrq ANN top-K): semantic fallback,
    //    IDF- and word-count-weighted
    //
    // Literal matches always rank above embedding matches, but a literal
    // match on a common tag like "indoor" ranks below a literal match on
    // a rare tag like "Van Gogh" (via IDF weighting). tag_idf is a stale
    // materialized view, so IDF joins are LEFT (missing tag → neutral 1.0)
    // and only the fuzzy channel depends on it for matching.
    //
    // Visibility and all other DTO filters (dates, camera, location, people,
    // favorites, ...) are applied through searchAssetBuilder, matching
    // upstream searchSmart semantics.
    const lowerQuery = query.toLowerCase().trim();
    const queryWords = lowerQuery.split(/\s+/).filter(Boolean);
    if (queryWords.length === 0) {
      return [];
    }
    const words = [...new Set(queryWords)];
    const ngrams = new Set<string>();
    for (let n = 2; n <= queryWords.length; n++) {
      for (let i = 0; i + n <= queryWords.length; i++) {
        ngrams.add(queryWords.slice(i, i + n).join(' '));
      }
    }
    // Word-boundary regex so "cat" matches the tag "black cat" but not "scatter"
    const boundaryPattern = String.raw`\m${lowerQuery.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`)}\M`;
    // The ANN channel is a global top-K; rows outside the filtered asset set
    // are discarded afterwards, so overfetch relative to the requested limit.
    const annLimit = Math.min(Math.max(1024, limit * 8), 8192);
    const filtered = searchAssetBuilder(this.db, {
      ...options,
      withExif: false,
      withFaces: false,
      withPeople: false,
    }).select('asset.id');

    return this.db.transaction().execute(async (trx) => {
      await sql`set local vchordrq.probes = ${sql.lit(await this.getTagSearchProbes())}`.execute(trx);
      const { rows } = await sql<{ assetId: string }>`
        WITH lit AS (
          SELECT ts."assetId", LOWER(ts.tag) AS tag,
            CASE WHEN LOWER(ts.tag) = ${lowerQuery} THEN 0.001 ELSE 0.05 END::float8 AS base,
            NULL::float8 AS emb_dist, true AS is_literal
          FROM tag_search ts
          WHERE LOWER(ts.tag) = ${lowerQuery}
            OR LOWER(ts.tag) = ANY(${words}::text[])
            OR LOWER(ts.tag) = ANY(${[...ngrams]}::text[])
            OR LOWER(ts.tag) ~ ${boundaryPattern}
        ), fuzzy AS (
          SELECT ts."assetId", LOWER(ts.tag) AS tag, NULL::float8 AS base,
            ((ts.embedding <=> ${options.embedding}) * 0.5)::float8 AS emb_dist, false AS is_literal
          FROM tag_search ts
          INNER JOIN (
            SELECT tc.tag
            FROM tag_idf tc
            WHERE length(tc.tag) BETWEEN 4 AND 100
              AND abs(length(tc.tag) - length(${lowerQuery})) <= 2
              AND levenshtein(tc.tag, ${lowerQuery}) <= CASE WHEN length(${lowerQuery}) >= 7 THEN 2 ELSE 1 END
          ) ft ON LOWER(ts.tag) = ft.tag
        ), ann AS (
          SELECT ts."assetId", LOWER(ts.tag) AS tag, NULL::float8 AS base,
            (ts.embedding <=> ${options.embedding})::float8 AS emb_dist, false AS is_literal
          FROM tag_search ts
          ORDER BY ts.embedding <=> ${options.embedding}
          LIMIT ${annLimit}
        ), cand AS (
          SELECT * FROM lit
          UNION ALL SELECT * FROM fuzzy
          UNION ALL SELECT * FROM ann
        ), scored AS (
          SELECT c."assetId", c.tag, c.is_literal,
            COALESCE(
              c.base,
              c.emb_dist
                / GREATEST(LEAST(array_length(string_to_array(c.tag, ' '), 1)::float / ${queryWords.length}::float, 1.0), 0.1)
            )
            / GREATEST(COALESCE(ln(tc.total_assets::float / GREATEST(tc.tag_count, 1)::float), 1.0), 1.0) AS dist
          FROM cand c
          LEFT JOIN tag_idf tc ON tc.tag = c.tag
          WHERE c."assetId" IN (${filtered})
        )
        SELECT sub."assetId"
        FROM (
          SELECT s."assetId",
            MIN(s.dist) / GREATEST(COUNT(DISTINCT s.tag) FILTER (WHERE s.is_literal), 1) AS best_dist
          FROM scored s
          GROUP BY s."assetId"
          ORDER BY best_dist, s."assetId"
          LIMIT ${limit}
        ) sub
        ORDER BY sub.best_dist, sub."assetId"
      `.execute(trx);

      return rows.map((r) => r.assetId);
    });
  }

  private async getTagSearchProbes(): Promise<number> {
    if (this.tagSearchProbes === undefined) {
      const { rows } = await sql<{ indexdef: string }>`
        SELECT indexdef FROM pg_indexes WHERE indexname = 'tag_search_embedding_idx'
      `.execute(this.db);
      // Measured on this dataset: recall@1024 plateaus at ~83% from probes=16
      // upward (the gap is quantization, not probing), while cost rises
      // sharply past lists/32. So probe 1/32 of lists instead of upstream's 1/8.
      const lists = Number(rows[0]?.indexdef.match(/lists = \[(\d+)/)?.[1] ?? 1);
      this.tagSearchProbes = Math.max(1, Math.ceil(lists / 32));
    }
    return this.tagSearchProbes;
  }

  async upsertTagEmbedding(assetId: string, tag: string, embedding: string): Promise<void> {
    await sql`
      INSERT INTO tag_search ("assetId", tag, embedding)
      VALUES (${assetId}, ${tag}, ${embedding})
      ON CONFLICT ("assetId", tag) DO UPDATE SET embedding = EXCLUDED.embedding
    `.execute(this.db);
  }

  async getCountries(userIds: string[]): Promise<string[]> {
    const res = await this.getExifField('country', userIds).execute();
    return res.map((row) => row.country!);
  }

  @GenerateSql({ params: [[DummyValue.UUID], DummyValue.STRING] })
  async getStates(userIds: string[], { country }: GetStatesOptions): Promise<string[]> {
    const res = await this.getExifField('state', userIds)
      .$if(!!country, (qb) => qb.where('country', '=', country!))
      .execute();

    return res.map((row) => row.state!);
  }

  @GenerateSql({ params: [[DummyValue.UUID], DummyValue.STRING, DummyValue.STRING] })
  async getCities(userIds: string[], { country, state }: GetCitiesOptions): Promise<string[]> {
    const res = await this.getExifField('city', userIds)
      .$if(!!country, (qb) => qb.where('country', '=', country!))
      .$if(!!state, (qb) => qb.where('state', '=', state!))
      .execute();

    return res.map((row) => row.city!);
  }

  @GenerateSql({ params: [[DummyValue.UUID], DummyValue.STRING, DummyValue.STRING] })
  async getCameraMakes(userIds: string[], { model, lensModel }: GetCameraMakesOptions): Promise<string[]> {
    const res = await this.getExifField('make', userIds)
      .$if(!!model, (qb) => qb.where('model', '=', model!))
      .$if(!!lensModel, (qb) => qb.where('lensModel', '=', lensModel!))
      .execute();

    return res.map((row) => row.make!);
  }

  @GenerateSql({ params: [[DummyValue.UUID], DummyValue.STRING, DummyValue.STRING] })
  async getCameraModels(userIds: string[], { make, lensModel }: GetCameraModelsOptions): Promise<string[]> {
    const res = await this.getExifField('model', userIds)
      .$if(!!make, (qb) => qb.where('make', '=', make!))
      .$if(!!lensModel, (qb) => qb.where('lensModel', '=', lensModel!))
      .execute();

    return res.map((row) => row.model!);
  }

  @GenerateSql({ params: [[DummyValue.UUID], DummyValue.STRING] })
  async getCameraLensModels(userIds: string[], { make, model }: GetCameraLensModelsOptions): Promise<string[]> {
    const res = await this.getExifField('lensModel', userIds)
      .$if(!!make, (qb) => qb.where('make', '=', make!))
      .$if(!!model, (qb) => qb.where('model', '=', model!))
      .execute();

    return res.map((row) => row.lensModel!);
  }

  @GenerateSql(...searchMetadataV3Examples)
  searchMetadataV3(
    pagination: AssetSearchPaginationV3Options,
    options: AssetSearchBuilderV3Options,
  ): Promise<MapAsset[]> {
    return withSearchOrder(searchAssetBuilder(this.db, options), options.order)
      .select(columns.searchAsset)
      .limit(pagination.size)
      .execute();
  }

  @GenerateSql(...searchStatisticsV3Examples)
  searchStatisticsV3(options: AssetSearchBuilderV3Options) {
    return searchAssetBuilder(this.db, options)
      .select((qb) => qb.fn.countAll<number>().as('total'))
      .executeTakeFirstOrThrow();
  }

  private getExifField(field: 'city' | 'state' | 'country' | 'make' | 'model' | 'lensModel', userIds: string[]) {
    return this.db
      .selectFrom('asset_exif')
      .select(field)
      .distinctOn(field)
      .innerJoin('asset', 'asset.id', 'asset_exif.assetId')
      .where('ownerId', '=', anyUuid(userIds))
      .where('visibility', '=', AssetVisibility.Timeline)
      .where('deletedAt', 'is', null)
      .where(field, 'is not', null)
      .where(field, '!=', '');
  }
}
