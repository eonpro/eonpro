#!/bin/bash

# Reboot RDS Instance Script
# Usage: ./scripts/reboot-rds.sh

set -e

DB_INSTANCE="eonpro-db"
REGION="us-east-2"

echo "=== RDS Instance Reboot Script ==="
echo ""

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "ERROR: AWS CLI is not installed."
    echo "Install it with: brew install awscli"
    exit 1
fi

# Check current status
echo "Checking current status of $DB_INSTANCE..."
STATUS=$(aws rds describe-db-instances \
    --db-instance-identifier "$DB_INSTANCE" \
    --region "$REGION" \
    --query 'DBInstances[0].DBInstanceStatus' \
    --output text 2>/dev/null || echo "ERROR")

if [ "$STATUS" = "ERROR" ]; then
    echo "ERROR: Could not get instance status. Check your AWS credentials."
    echo "Run: aws configure"
    exit 1
fi

echo "Current status: $STATUS"
echo ""

if [ "$STATUS" != "available" ]; then
    echo "WARNING: Instance is not in 'available' state."
    echo "Cannot reboot while status is: $STATUS"
    exit 1
fi

# Confirm reboot
echo "This will reboot the RDS instance: $DB_INSTANCE"
echo "The database will be unavailable for 1-5 minutes."
read -p "Are you sure you want to proceed? (y/N): " confirm

if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "Reboot cancelled."
    exit 0
fi

# Reboot the instance
echo ""
echo "Rebooting $DB_INSTANCE..."
aws rds reboot-db-instance \
    --db-instance-identifier "$DB_INSTANCE" \
    --region "$REGION"

echo ""
echo "Reboot initiated successfully!"
echo ""
echo "Monitoring status (press Ctrl+C to stop monitoring)..."
echo ""

# Monitor the reboot
while true; do
    STATUS=$(aws rds describe-db-instances \
        --db-instance-identifier "$DB_INSTANCE" \
        --region "$REGION" \
        --query 'DBInstances[0].DBInstanceStatus' \
        --output text)
    
    TIMESTAMP=$(date '+%H:%M:%S')
    echo "[$TIMESTAMP] Status: $STATUS"
    
    if [ "$STATUS" = "available" ]; then
        echo ""
        echo "=== Reboot complete! Database is now available ==="
        break
    fi
    
    sleep 10
done
