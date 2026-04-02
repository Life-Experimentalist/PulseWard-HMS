# Cloudflare Pages Deployment for Landing Page

## Purpose

This guide explains how to deploy `apps/landing-page` to Cloudflare Pages when you are ready.

## What To Deploy

- Source folder: `apps/landing-page`
- Site type: static HTML/CSS/JS
- Build requirement: none

## Option A: Git-Connected Cloudflare Pages Project

1. Open Cloudflare Dashboard > Workers & Pages > Create application.
2. Choose Pages > Import an existing Git repository.
3. Select `Life-Experimentalist/PulseWard-HMS`.
4. Configure build settings:

- Production branch: `main`
- Build command: `exit 0`
- Build output directory: `apps/landing-page`

5. Save and deploy.

## Option B: Direct Upload via Wrangler (Optional)

Use this when you want to deploy without Git-triggered builds.

```powershell
npx wrangler pages deploy apps/landing-page --project-name pulseward-landing --branch=main
```

For preview branches:

```powershell
npx wrangler pages deploy apps/landing-page --project-name pulseward-landing --branch=preview
```

## Custom Domain Setup

1. Open your Pages project.
2. Go to Custom domains.
3. Select Set up a domain and add your domain.
4. If DNS is already in Cloudflare, setup is automatic.
5. If DNS is external, apply the DNS records shown by Cloudflare.

## Branch Controls and Preview Deployments

Use Settings > Builds > Branch control to:

- Restrict which branches auto-deploy.
- Keep `main` as production.
- Limit preview builds to selected branches.

## Environment Variables

Landing page currently does not require runtime secrets.
If you add API URLs or feature flags later, define them in Pages project environment variables and keep production/preview values separate.

## Verification Checklist

- Root page loads without 404 errors.
- Manifest and static assets load correctly.
- Mobile layout and navigation work.
- Custom domain has valid HTTPS certificate.
