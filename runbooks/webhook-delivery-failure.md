# Webhook delivery failure

Symptoms: failure/retry/DLQ rate rises. Confirm customer endpoint versus platform egress/DNS/TLS issue. Never relax SSRF policy or follow redirects. Bound attempts/time/body, isolate slow destinations and move exhausted deliveries to DLQ. Replay creates a new delivery ID after authorization. Verify signatures and tenant scope.
