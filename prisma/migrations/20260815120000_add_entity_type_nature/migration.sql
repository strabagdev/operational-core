-- Add semantic classification for dynamic entity types.
CREATE TYPE "EntityNature" AS ENUM ('MASTER', 'TRANSACTION', 'REFERENCE');

ALTER TABLE "EntityType"
ADD COLUMN "nature" "EntityNature" NOT NULL DEFAULT 'MASTER';
