-- Add phone field to User table for SMS login and notifications
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT;
