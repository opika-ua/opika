-- Nationwide track, N1: geography schema. Additive; no data outside `cities` is touched.
--
-- `cities` grows from 8 rows to ~29.7k when the importer (N2) runs; this migration only makes room:
-- the 27 first-level regions (inserted here, so `cities.region_id` can be NOT NULL from day one),
-- settlement columns, the slug-alias table, and pg_trgm with the search indexes.
-- Hand-edited, not the generated form: `ADD COLUMN ... NOT NULL` fails on a table that already has
-- rows (the 8 seeded cities), so each column is added nullable, backfilled by slug, then tightened,
-- the same technique as 0005. Loosening centroid_lat/lng to nullable is the only constraint relaxed,
-- and the 8 rows keep their coordinates.
--
-- The region rows must equal `packages/db/src/geography/regions-data.ts`; `regions-data.test.ts`
-- compares them. `search_name`/`search_latin` literals below are `searchNameOf`/`searchLatinOf` of
-- each name; `city-geography-backfill.test.ts` asserts that.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TABLE "city_slug_aliases" (
	"slug" text PRIMARY KEY NOT NULL,
	"city_id" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "city_slug_aliases_reason_values" CHECK ("city_slug_aliases"."reason" IN ('legacy', 'renamed'))
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"kind" text NOT NULL,
	"slug" text NOT NULL,
	"name_uk" text NOT NULL,
	"name_uk_short" text NOT NULL,
	"name_uk_label" text NOT NULL,
	"name_en" text NOT NULL,
	CONSTRAINT "regions_code_unique" UNIQUE("code"),
	CONSTRAINT "regions_slug_unique" UNIQUE("slug"),
	CONSTRAINT "regions_code_format" CHECK ("regions"."code" ~ '^UA[0-9]{2}$'),
	CONSTRAINT "regions_kind_values" CHECK ("regions"."kind" IN ('oblast', 'autonomous_republic', 'special_status_city'))
);
--> statement-breakpoint
INSERT INTO "regions" ("id", "code", "kind", "slug", "name_uk", "name_uk_short", "name_uk_label", "name_en") VALUES
  ('30756d7b-1a9e-598f-afc1-598613672165', 'UA01', 'autonomous_republic', 'krym', 'Автономна Республіка Крим', 'АР Крим', 'АР Крим', 'Autonomous Republic of Crimea'),
  ('32fc59e2-f0f5-54e8-8c35-cc3c5371ff24', 'UA05', 'oblast', 'vinnytska', 'Вінницька область', 'Вінницька обл.', 'Вінницька', 'Vinnytsia Oblast'),
  ('69ee7ad3-8441-5e3d-a040-436a838e2f61', 'UA07', 'oblast', 'volynska', 'Волинська область', 'Волинська обл.', 'Волинська', 'Volyn Oblast'),
  ('f0b44f7e-b535-56f7-a11b-4cb077d7aac0', 'UA12', 'oblast', 'dnipropetrovska', 'Дніпропетровська область', 'Дніпропетровська обл.', 'Дніпропетровська', 'Dnipropetrovsk Oblast'),
  ('081837d4-ba81-593c-96f3-fced7111f910', 'UA14', 'oblast', 'donetska', 'Донецька область', 'Донецька обл.', 'Донецька', 'Donetsk Oblast'),
  ('574a6d9e-7c5b-541d-8a97-6f1985dff66f', 'UA18', 'oblast', 'zhytomyrska', 'Житомирська область', 'Житомирська обл.', 'Житомирська', 'Zhytomyr Oblast'),
  ('f4c626e0-f713-5ca8-a62c-a1a1054dada3', 'UA21', 'oblast', 'zakarpatska', 'Закарпатська область', 'Закарпатська обл.', 'Закарпатська', 'Zakarpattia Oblast'),
  ('903fda77-bee2-5a28-9f2f-37345b0da9c1', 'UA23', 'oblast', 'zaporizka', 'Запорізька область', 'Запорізька обл.', 'Запорізька', 'Zaporizhzhia Oblast'),
  ('3911197a-f3dd-57c0-a9fb-a2ee66a56b3b', 'UA26', 'oblast', 'ivano-frankivska', 'Івано-Франківська область', 'Івано-Франківська обл.', 'Івано-Франківська', 'Ivano-Frankivsk Oblast'),
  ('814661e1-67de-532e-a38e-2216d8b521ff', 'UA32', 'oblast', 'kyivska', 'Київська область', 'Київська обл.', 'Київська', 'Kyiv Oblast'),
  ('0af11ced-98c6-56ce-bd9a-3d621792b1d3', 'UA35', 'oblast', 'kirovohradska', 'Кіровоградська область', 'Кіровоградська обл.', 'Кіровоградська', 'Kirovohrad Oblast'),
  ('601b9557-5b0c-5fc9-81fc-9b9a4be2ce8f', 'UA44', 'oblast', 'luhanska', 'Луганська область', 'Луганська обл.', 'Луганська', 'Luhansk Oblast'),
  ('4941682f-eeb2-5de1-a644-e489b479a5f1', 'UA46', 'oblast', 'lvivska', 'Львівська область', 'Львівська обл.', 'Львівська', 'Lviv Oblast'),
  ('15d8ef98-e59c-5573-abd7-9d88a2171536', 'UA48', 'oblast', 'mykolaivska', 'Миколаївська область', 'Миколаївська обл.', 'Миколаївська', 'Mykolaiv Oblast'),
  ('a1dd023f-f109-503f-902b-d3f25bbe10fe', 'UA51', 'oblast', 'odeska', 'Одеська область', 'Одеська обл.', 'Одеська', 'Odesa Oblast'),
  ('de99d78f-94c8-50e2-9420-4ca3402d08a5', 'UA53', 'oblast', 'poltavska', 'Полтавська область', 'Полтавська обл.', 'Полтавська', 'Poltava Oblast'),
  ('bb96d47c-2d70-5a7c-a215-fb2242c6e343', 'UA56', 'oblast', 'rivnenska', 'Рівненська область', 'Рівненська обл.', 'Рівненська', 'Rivne Oblast'),
  ('5cdb2f8b-60e0-5f55-b7a7-8fcfe1fce18f', 'UA59', 'oblast', 'sumska', 'Сумська область', 'Сумська обл.', 'Сумська', 'Sumy Oblast'),
  ('e237ec66-f62a-530b-8b57-d7c451234ac3', 'UA61', 'oblast', 'ternopilska', 'Тернопільська область', 'Тернопільська обл.', 'Тернопільська', 'Ternopil Oblast'),
  ('35f75347-75fc-545c-9f62-72da668838dc', 'UA63', 'oblast', 'kharkivska', 'Харківська область', 'Харківська обл.', 'Харківська', 'Kharkiv Oblast'),
  ('40fe1785-9640-5b38-9e71-407e56d6f5a6', 'UA65', 'oblast', 'khersonska', 'Херсонська область', 'Херсонська обл.', 'Херсонська', 'Kherson Oblast'),
  ('499c467f-517b-5a33-a5bb-a862274f42dd', 'UA68', 'oblast', 'khmelnytska', 'Хмельницька область', 'Хмельницька обл.', 'Хмельницька', 'Khmelnytskyi Oblast'),
  ('c5dcb6fe-fdba-57b4-9df3-b297f48c90ff', 'UA71', 'oblast', 'cherkaska', 'Черкаська область', 'Черкаська обл.', 'Черкаська', 'Cherkasy Oblast'),
  ('9fb1210f-0467-5d2b-907b-9d99d3a14e8b', 'UA73', 'oblast', 'chernivetska', 'Чернівецька область', 'Чернівецька обл.', 'Чернівецька', 'Chernivtsi Oblast'),
  ('1a6297f2-1689-5d68-b625-5092b4958cff', 'UA74', 'oblast', 'chernihivska', 'Чернігівська область', 'Чернігівська обл.', 'Чернігівська', 'Chernihiv Oblast'),
  ('f421e743-f9dd-5198-86bd-8a05911ec75b', 'UA80', 'special_status_city', 'kyiv', 'Київ', 'м. Київ', 'Київ', 'Kyiv'),
  ('c45a68e7-2bf8-52b5-99ac-b10752d86025', 'UA85', 'special_status_city', 'sevastopol', 'Севастополь', 'м. Севастополь', 'Севастополь', 'Sevastopol');--> statement-breakpoint
ALTER TABLE "cities" ALTER COLUMN "centroid_lat" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cities" ALTER COLUMN "centroid_lng" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "region_id" text;--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "katottg_code" text;--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "district_name_uk" text;--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "hromada_name_uk" text;--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "name_scope" text;--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "search_name" text;--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "search_latin" text;--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "centroid_source" text;--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "source_edition" text;--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "retired_in_edition" text;--> statement-breakpoint
--
-- Backfill by slug (stable, and the only 8 cities any database has: `seed.ts`). Kyiv is a
-- special-status city of its own region; the other 7 are cities of Kyiv oblast.
UPDATE "cities" AS c SET
  "region_id" = v.region_id,
  "kind" = v.kind,
  "name_scope" = 'unique_in_ukraine',
  "search_name" = v.search_name,
  "search_latin" = v.search_latin,
  "centroid_source" = 'manual'
FROM (VALUES
  ('kyiv', 'f421e743-f9dd-5198-86bd-8a05911ec75b', 'special_status_city', 'київ', 'kyiv'),
  ('brovary', '814661e1-67de-532e-a38e-2216d8b521ff', 'city', 'бровари', 'brovary'),
  ('irpin', '814661e1-67de-532e-a38e-2216d8b521ff', 'city', 'ірпінь', 'irpin'),
  ('bucha', '814661e1-67de-532e-a38e-2216d8b521ff', 'city', 'буча', 'bucha'),
  ('vyshhorod', '814661e1-67de-532e-a38e-2216d8b521ff', 'city', 'вишгород', 'vyshhorod'),
  ('boryspil', '814661e1-67de-532e-a38e-2216d8b521ff', 'city', 'бориспіль', 'boryspil'),
  ('fastiv', '814661e1-67de-532e-a38e-2216d8b521ff', 'city', 'фастів', 'fastiv'),
  ('bila-tserkva', '814661e1-67de-532e-a38e-2216d8b521ff', 'city', 'біла церква', 'bila tserkva')
) AS v(slug, region_id, kind, search_name, search_latin)
WHERE c."slug" = v.slug;--> statement-breakpoint
DO $$
DECLARE
  unfilled integer;
BEGIN
  SELECT count(*) INTO unfilled FROM "cities" WHERE "region_id" IS NULL;
  IF unfilled > 0 THEN
    RAISE EXCEPTION
      'cities geography backfill is incomplete: % row(s) are not one of the 8 known slugs, so their region and kind are unknown. Fill them in by hand before this migration can run.',
      unfilled;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "cities" ALTER COLUMN "region_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cities" ALTER COLUMN "kind" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cities" ALTER COLUMN "name_scope" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cities" ALTER COLUMN "search_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cities" ALTER COLUMN "search_latin" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "city_slug_aliases" ADD CONSTRAINT "city_slug_aliases_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "city_slug_aliases_city_id_idx" ON "city_slug_aliases" USING btree ("city_id");--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cities_region_id_idx" ON "cities" USING btree ("region_id");--> statement-breakpoint
CREATE INDEX "cities_search_name_prefix_idx" ON "cities" USING btree ("search_name" text_pattern_ops);--> statement-breakpoint
CREATE INDEX "cities_search_latin_prefix_idx" ON "cities" USING btree ("search_latin" text_pattern_ops);--> statement-breakpoint
CREATE INDEX "cities_search_name_trgm_idx" ON "cities" USING gin ("search_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "cities_search_latin_trgm_idx" ON "cities" USING gin ("search_latin" gin_trgm_ops);--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_katottg_code_unique" UNIQUE("katottg_code");--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_kind_values" CHECK ("cities"."kind" IN ('special_status_city', 'city', 'selyshche', 'village'));--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_name_scope_values" CHECK ("cities"."name_scope" IN ('unique_in_ukraine', 'unique_in_region', 'unique_in_district', 'shared_in_district'));--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_katottg_code_format" CHECK ("cities"."katottg_code" ~ '^UA[0-9]{17}$');--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_centroid_source_values" CHECK ("cities"."centroid_source" IN ('manual'));--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_centroid_all_or_none" CHECK (("cities"."centroid_lat" IS NULL) = ("cities"."centroid_lng" IS NULL) AND ("cities"."centroid_lat" IS NULL) = ("cities"."centroid_source" IS NULL));