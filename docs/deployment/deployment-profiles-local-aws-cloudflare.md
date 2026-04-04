# Deployment Profiles: Local Server, AWS, and Cloudflare

Use this guide when moving from local development into real hosting.

## Profile 1: Physical Local Server (On-Prem)

Best for:

1. Hospital intranet pilots.
2. Teams needing data residency on owned hardware.

### Setup

1. Install Docker Engine + Docker Compose plugin.
2. Install Node.js 22+ and pnpm.
3. Clone the repository and run bootstrap:

```powershell
pnpm run setup:bootstrap
```

4. Start stack:

```powershell
pnpm run demo:up
pnpm run start:auth
pnpm run start:notification
pnpm run start:appointment
```

5. Put Nginx/Caddy in front for TLS and routing.

### Cost profile

1. Lowest cloud bill (compute is your own hardware).
2. Higher internal ops burden (patching, backups, monitoring).

## Profile 2: AWS Lightsail + Cloudflare (Recommended First Production Path)

Best for:

1. Fast production rollout with low ops complexity.
2. Predictable monthly cost.

### Setup

1. Create one Linux VM (Lightsail) with Docker installed.
2. Deploy PulseWard compose stack on VM.
3. Put Cloudflare in front of API/landing domains.
4. Keep API base path stable as `/api/v1`.
5. Store real secrets in AWS SSM or equivalent secret manager.

### Why this is usually easiest

1. Lightsail pricing is bundled and predictable.
2. Cloudflare free tier covers DNS + TLS + baseline WAF features.
3. Operational model remains close to local Docker compose workflow.

## Profile 3: AWS EC2 (Flexible but More Ops)

Best for:

1. Teams needing custom networking and fine-grained infrastructure control.
2. Multi-service scaling patterns beyond single VM comfort.

### Tradeoffs

1. More flexible than Lightsail.
2. Usually more complex billing and operations (instance, EBS, data transfer, load balancing, IP costs).

## Pricing Summary (Quick Guidance)

Pricing changes frequently. Validate on vendor pricing pages before committing budgets.

1. Cloudflare:
   Free plan available, with paid add-ons and paid plans as needed.
2. AWS Lightsail:
   Low bundled entry tiers, including free trial windows for selected bundles.
3. AWS EC2:
   On-demand metered pricing, usually more components to estimate.
4. Clerk:
   Free hobby tier available with paid scale-up plans.
5. WhatsApp Cloud API:
   Paid template message pricing (country and category dependent), while some message classes can be free under specific windows.
6. Telegram bots:
   Free to create/use (platform level), easiest low-cost channel to start.

## Recommended Start Order

1. Local Docker and strict tenant bootstrap.
2. One tenant pilot on Lightsail + Cloudflare.
3. Add paid connectors only after baseline stability.
4. Move to EC2/ECS/Kubernetes only when usage and SLOs justify migration.
