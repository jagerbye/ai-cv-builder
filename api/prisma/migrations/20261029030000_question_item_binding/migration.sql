-- ADR-027: a question binds to the item it is about, not to a position in an array.
ALTER TABLE "questions" ADD COLUMN "item_id" UUID;
ALTER TABLE "questions" ADD CONSTRAINT "questions_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "cv_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "questions_item_id_idx" ON "questions"("item_id");

-- Existing rows: bind each indexed question to the item that currently sits at the path it names.
UPDATE "questions" q
SET "item_id" = ci."id"
FROM "cv_items" ci
WHERE q."path" ~ '\]'
  AND ci."cv_id" = q."cv_id"
  AND ci."path" = regexp_replace(q."path", '^(.*\])(\..*)?$', '\1');

-- When an item goes (replaced by a regeneration, deleted by the user, cascaded from its parent) the question about it
-- must not keep an index that will mean another item: it is unbound and names its section.
CREATE FUNCTION "questions_unbind_item"() RETURNS trigger AS $$
BEGIN
  UPDATE "questions"
  SET "item_id" = NULL, "path" = regexp_replace("path", '\[.*$', '')
  WHERE "item_id" = OLD."id";
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "cv_items_unbind_questions" BEFORE DELETE ON "cv_items"
FOR EACH ROW EXECUTE FUNCTION "questions_unbind_item"();
