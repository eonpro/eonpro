-- Add avatarUrl field to User table for profile pictures
-- This field stores the S3 URL or key for the user's profile picture

ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;

-- Create index for faster lookups when displaying avatars in lists
CREATE INDEX IF NOT EXISTS "User_avatarUrl_idx" ON "User"("avatarUrl") WHERE "avatarUrl" IS NOT NULL;
