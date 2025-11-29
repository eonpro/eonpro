#!/bin/bash

# Fix all files with import issues
echo "Fixing import issues..."

# Find and fix all files with the problematic pattern
grep -r "^import { $" src --include="*.ts" --include="*.tsx" -l | while read file; do
  echo "Fixing: $file"
  # Use sed to fix the pattern
  sed -i '' '/^import { $/,/^import { logger/ {
    /^import { $/d
    s/^import { logger/import { logger/
    /^import { logger/a\
import {
  }' "$file"
done

echo "Done!"
