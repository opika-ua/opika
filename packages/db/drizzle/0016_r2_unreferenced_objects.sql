CREATE TABLE "r2_unreferenced_objects" (
	"object_key" text PRIMARY KEY NOT NULL,
	"first_seen_unreferenced_at" timestamp with time zone NOT NULL
);
