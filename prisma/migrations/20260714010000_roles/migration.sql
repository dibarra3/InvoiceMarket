-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'FIELD_CREW');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'OWNER';

