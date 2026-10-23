# FlowForge Operations — Autoscaling Readiness
## Horizontal Pod Autoscaler (HPA) Metrics & Scaling Signals

### 1. Scaling Signals
Traditional CPU-based autoscaling is insufficient for asynchronous background workers because queued jobs can accumulate while CPU utilization remains low. FlowForge exposes queue-aware scaling signals:

1. **Queue Waiting Count**: Available via `/api/v1/health/worker` (`metrics.waiting`).
2. **Projected Drain Time**: Available via `/api/v1/operations/capacity` (`queueMetrics.projectedDrainTimeSec`).
3. **Worker Concurrency Saturation**: Available via `/api/v1/operations/capacity` (`workerCapacity.workerSaturationPercent`).

---

### 2. Recommended Kubernetes HPA Configuration
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: flowforge-worker-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: flowforge-worker
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: External
    external:
      metric:
        name: flowforge_queue_waiting_count
      target:
        type: AverageValue
        averageValue: "25"
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 20
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
      - type: Percent
        value: 100
        periodSeconds: 15
```

---

### 3. Scale-In Safety
- **Termination Grace Period**: Set `terminationGracePeriodSeconds: 35` to allow the 30-second worker lease heartbeat to conclude cleanly.
- Checkpoint writes ensure any interrupted workflows resume from `lastCheckpointNodeId` without rerunning completed steps.
