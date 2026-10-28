-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cvs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT,
    "target_role" TEXT NOT NULL,
    "source_kind" TEXT NOT NULL,
    "source_text" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cvs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facts" (
    "id" UUID NOT NULL,
    "cv_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "source_quote" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cv_items" (
    "id" UUID NOT NULL,
    "cv_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "parent_id" UUID,
    "path" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "fact_ids" UUID[] NOT NULL DEFAULT '{}',
    "relevance" DECIMAL(4,3),
    "user_edited" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cv_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL,
    "cv_id" UUID NOT NULL,
    "path" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "answer" TEXT,
    "answered_at" TIMESTAMPTZ(6),
    "follow_up_of_id" UUID,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_jobs" (
    "id" UUID NOT NULL,
    "cv_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "stage" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "leased_until" TIMESTAMPTZ(6),
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "error_code" TEXT,
    "error_message" TEXT,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "scope" TEXT NOT NULL DEFAULT 'full',
    "scope_path" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "generation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "cvs_user_id_updated_at_idx" ON "cvs"("user_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "facts_cv_id_idx" ON "facts"("cv_id");

-- CreateIndex
CREATE INDEX "cv_items_cv_id_kind_order_index_idx" ON "cv_items"("cv_id", "kind", "order_index");

-- CreateIndex
CREATE INDEX "cv_items_parent_id_idx" ON "cv_items"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "cv_items_cv_id_path_key" ON "cv_items"("cv_id", "path");

-- CreateIndex
CREATE INDEX "questions_cv_id_status_priority_idx" ON "questions"("cv_id", "status", "priority");

-- CreateIndex
CREATE INDEX "questions_follow_up_of_id_idx" ON "questions"("follow_up_of_id");

-- CreateIndex
CREATE INDEX "generation_jobs_cv_id_idx" ON "generation_jobs"("cv_id");

-- CreateIndex
CREATE INDEX "generation_jobs_user_id_idx" ON "generation_jobs"("user_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cvs" ADD CONSTRAINT "cvs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facts" ADD CONSTRAINT "facts_cv_id_fkey" FOREIGN KEY ("cv_id") REFERENCES "cvs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_items" ADD CONSTRAINT "cv_items_cv_id_fkey" FOREIGN KEY ("cv_id") REFERENCES "cvs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_items" ADD CONSTRAINT "cv_items_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "cv_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_cv_id_fkey" FOREIGN KEY ("cv_id") REFERENCES "cvs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_follow_up_of_id_fkey" FOREIGN KEY ("follow_up_of_id") REFERENCES "questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_cv_id_fkey" FOREIGN KEY ("cv_id") REFERENCES "cvs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written below: what Prisma schema language cannot express.
-- Source of truth: framework/docs/database-schema.md. Keep the two in sync.
-- ---------------------------------------------------------------------------

-- CHECK constraints (enum-like text columns)
ALTER TABLE "cvs" ADD CONSTRAINT "cvs_source_kind_check" CHECK ("source_kind" IN ('pdf', 'text'));
ALTER TABLE "cvs" ADD CONSTRAINT "cvs_state_check" CHECK ("state" IN ('generating', 'ready', 'failed'));
ALTER TABLE "facts" ADD CONSTRAINT "facts_source_check" CHECK ("source" IN ('document', 'user'));
ALTER TABLE "questions" ADD CONSTRAINT "questions_status_check" CHECK ("status" IN ('open', 'answered', 'dismissed'));

-- Partial index: the job lease query (FOR UPDATE SKIP LOCKED) and dead-lease reclaim
CREATE INDEX "generation_jobs_status_leased_until_idx" ON "generation_jobs"("status", "leased_until") WHERE status IN ('queued', 'running');

-- Partial unique index: at most one job in flight per CV (C-010 409 relies on it)
CREATE UNIQUE INDEX "generation_jobs_cv_id_in_flight_key" ON "generation_jobs"("cv_id") WHERE status IN ('queued', 'running');
