# CloudWatch Monitoring & Alerting Configuration

## Overview

This document outlines the CloudWatch monitoring setup for EonPro's database infrastructure, focusing on connection pool health and RDS performance.

---

## Critical Alarms

### 1. Database Connection Exhaustion

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "eonpro-db-connections-critical" \
  --alarm-description "RDS connections near maximum limit" \
  --namespace "AWS/RDS" \
  --metric-name "DatabaseConnections" \
  --dimensions Name=DBInstanceIdentifier,Value=eonpro-db \
  --statistic Average \
  --period 60 \
  --evaluation-periods 3 \
  --threshold 60 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --alarm-actions "arn:aws:sns:us-east-2:ACCOUNT_ID:eonpro-alerts" \
  --region us-east-2
```

### 2. High CPU Utilization

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "eonpro-db-cpu-high" \
  --alarm-description "RDS CPU utilization above 80%" \
  --namespace "AWS/RDS" \
  --metric-name "CPUUtilization" \
  --dimensions Name=DBInstanceIdentifier,Value=eonpro-db \
  --statistic Average \
  --period 300 \
  --evaluation-periods 3 \
  --threshold 80 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --alarm-actions "arn:aws:sns:us-east-2:ACCOUNT_ID:eonpro-alerts" \
  --region us-east-2
```

### 3. Free Storage Low

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "eonpro-db-storage-low" \
  --alarm-description "RDS free storage below 5GB" \
  --namespace "AWS/RDS" \
  --metric-name "FreeStorageSpace" \
  --dimensions Name=DBInstanceIdentifier,Value=eonpro-db \
  --statistic Average \
  --period 300 \
  --evaluation-periods 3 \
  --threshold 5368709120 \
  --comparison-operator LessThanOrEqualToThreshold \
  --alarm-actions "arn:aws:sns:us-east-2:ACCOUNT_ID:eonpro-alerts" \
  --region us-east-2
```

### 4. Database Memory Pressure

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "eonpro-db-memory-low" \
  --alarm-description "RDS freeable memory below 200MB" \
  --namespace "AWS/RDS" \
  --metric-name "FreeableMemory" \
  --dimensions Name=DBInstanceIdentifier,Value=eonpro-db \
  --statistic Average \
  --period 300 \
  --evaluation-periods 3 \
  --threshold 209715200 \
  --comparison-operator LessThanOrEqualToThreshold \
  --alarm-actions "arn:aws:sns:us-east-2:ACCOUNT_ID:eonpro-alerts" \
  --region us-east-2
```

---

## RDS Proxy Alarms (After Setup)

### 5. Proxy Client Connections High

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "eonpro-proxy-connections-high" \
  --alarm-description "RDS Proxy client connections high" \
  --namespace "AWS/RDS" \
  --metric-name "ClientConnections" \
  --dimensions Name=ProxyName,Value=eonpro-proxy \
  --statistic Average \
  --period 60 \
  --evaluation-periods 5 \
  --threshold 500 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --alarm-actions "arn:aws:sns:us-east-2:ACCOUNT_ID:eonpro-alerts" \
  --region us-east-2
```

### 6. Proxy Database Connections High

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "eonpro-proxy-db-connections" \
  --alarm-description "RDS Proxy to DB connections approaching limit" \
  --namespace "AWS/RDS" \
  --metric-name "DatabaseConnections" \
  --dimensions Name=ProxyName,Value=eonpro-proxy \
  --statistic Average \
  --period 60 \
  --evaluation-periods 3 \
  --threshold 50 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --alarm-actions "arn:aws:sns:us-east-2:ACCOUNT_ID:eonpro-alerts" \
  --region us-east-2
```

---

## SNS Topic Setup

```bash
# Create SNS topic for alerts
aws sns create-topic \
  --name "eonpro-alerts" \
  --region us-east-2

# Subscribe email to topic
aws sns subscribe \
  --topic-arn "arn:aws:sns:us-east-2:ACCOUNT_ID:eonpro-alerts" \
  --protocol email \
  --notification-endpoint "alerts@your-domain.com" \
  --region us-east-2

# Subscribe SMS (optional)
aws sns subscribe \
  --topic-arn "arn:aws:sns:us-east-2:ACCOUNT_ID:eonpro-alerts" \
  --protocol sms \
  --notification-endpoint "+1XXXXXXXXXX" \
  --region us-east-2
```

---

## CloudWatch Dashboard

```bash
# Create monitoring dashboard
aws cloudwatch put-dashboard \
  --dashboard-name "EonPro-Database-Health" \
  --dashboard-body '{
    "widgets": [
      {
        "type": "metric",
        "x": 0,
        "y": 0,
        "width": 12,
        "height": 6,
        "properties": {
          "title": "Database Connections",
          "metrics": [
            ["AWS/RDS", "DatabaseConnections", "DBInstanceIdentifier", "eonpro-db"]
          ],
          "view": "timeSeries",
          "region": "us-east-2",
          "period": 60
        }
      },
      {
        "type": "metric",
        "x": 12,
        "y": 0,
        "width": 12,
        "height": 6,
        "properties": {
          "title": "CPU Utilization",
          "metrics": [
            ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", "eonpro-db"]
          ],
          "view": "timeSeries",
          "region": "us-east-2",
          "period": 60
        }
      },
      {
        "type": "metric",
        "x": 0,
        "y": 6,
        "width": 12,
        "height": 6,
        "properties": {
          "title": "Freeable Memory",
          "metrics": [
            ["AWS/RDS", "FreeableMemory", "DBInstanceIdentifier", "eonpro-db"]
          ],
          "view": "timeSeries",
          "region": "us-east-2",
          "period": 60
        }
      },
      {
        "type": "metric",
        "x": 12,
        "y": 6,
        "width": 12,
        "height": 6,
        "properties": {
          "title": "Read/Write Latency",
          "metrics": [
            ["AWS/RDS", "ReadLatency", "DBInstanceIdentifier", "eonpro-db"],
            ["AWS/RDS", "WriteLatency", "DBInstanceIdentifier", "eonpro-db"]
          ],
          "view": "timeSeries",
          "region": "us-east-2",
          "period": 60
        }
      },
      {
        "type": "metric",
        "x": 0,
        "y": 12,
        "width": 24,
        "height": 6,
        "properties": {
          "title": "Free Storage Space",
          "metrics": [
            ["AWS/RDS", "FreeStorageSpace", "DBInstanceIdentifier", "eonpro-db"]
          ],
          "view": "timeSeries",
          "region": "us-east-2",
          "period": 300
        }
      }
    ]
  }' \
  --region us-east-2
```

---

## Application Health Monitoring

### Custom Metrics from Application

Add to your application to push custom metrics:

```typescript
import { CloudWatch } from '@aws-sdk/client-cloudwatch';

const cloudwatch = new CloudWatch({ region: 'us-east-2' });

export async function publishConnectionMetrics(metrics: {
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
}) {
  await cloudwatch.putMetricData({
    Namespace: 'EonPro/Database',
    MetricData: [
      {
        MetricName: 'ActiveConnections',
        Value: metrics.activeConnections,
        Unit: 'Count',
        Dimensions: [{ Name: 'Service', Value: 'api' }],
      },
      {
        MetricName: 'IdleConnections',
        Value: metrics.idleConnections,
        Unit: 'Count',
        Dimensions: [{ Name: 'Service', Value: 'api' }],
      },
      {
        MetricName: 'WaitingRequests',
        Value: metrics.waitingRequests,
        Unit: 'Count',
        Dimensions: [{ Name: 'Service', Value: 'api' }],
      },
    ],
  });
}
```

---

## Alarm Response Runbook

### Connection Exhaustion (>60 connections)

1. **Immediate**: Check `/api/health?full=true` for pool stats
2. **If critical**: Run connection cleanup script
   ```bash
   psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND usename != 'rdsadmin';"
   ```
3. **Long-term**: Enable RDS Proxy or increase instance size

### High CPU (>80%)

1. Check for long-running queries:
   ```sql
   SELECT pid, now() - pg_stat_activity.query_start AS duration, query
   FROM pg_stat_activity
   WHERE state != 'idle'
   ORDER BY duration DESC
   LIMIT 10;
   ```
2. Kill problematic queries if needed
3. Review query performance and add indexes

### Low Memory (<200MB)

1. Check for memory-intensive queries
2. Consider upgrading instance class
3. Review connection limits

### Low Storage (<5GB)

1. Clean up old data (logs, temp tables)
2. Run VACUUM FULL on large tables
3. Increase storage allocation

---

## Recommended Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| Connections | 50 | 65 |
| CPU % | 70 | 85 |
| Memory MB | 300 | 150 |
| Storage GB | 10 | 5 |
| Latency ms | 50 | 100 |

---

## Scheduled Reports

Create a Lambda function to generate daily reports:

```bash
# Create CloudWatch Insights query for daily summary
aws logs start-query \
  --log-group-name "/aws/rds/instance/eonpro-db/postgresql" \
  --start-time $(date -d '24 hours ago' +%s) \
  --end-time $(date +%s) \
  --query-string 'fields @timestamp, @message
    | filter @message like /ERROR|FATAL|connection/
    | stats count(*) as errors by bin(1h)'
```
