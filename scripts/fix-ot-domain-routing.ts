#!/usr/bin/env npx tsx
/**
 * Fix OT Domain Routing — Force ot.eonpro.io to Latest Deployment
 * ================================================================
 *
 * ot.eonpro.io was serving an older deployment (404 for /api routes, different UI).
 * This script uses the Vercel API to:
 * 1. Add ot.eonpro.io explicitly to the eonpro project (if not already)
 * 2. Promote the latest production deployment so ALL domains point to it
 *
 * Prerequisites:
 *   - VERCEL_TOKEN: Create at https://vercel.com/account/tokens
 *   - Project "eonpro" must exist in your Vercel team
 *
 * Usage:
 *   VERCEL_TOKEN=xxx npx tsx scripts/fix-ot-domain-routing.ts
 *   VERCEL_TOKEN=xxx npx tsx scripts/fix-ot-domain-routing.ts --dry-run
 *
 * @see docs/ENTERPRISE_DOMAIN_ROUTING_INCIDENT.md
 */

const VERCEL_API = 'https://api.vercel.com';

async function vercelFetch(
  path: string,
  opts: RequestInit & { teamId?: string } = {}
): Promise<Response> {
  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    throw new Error('VERCEL_TOKEN is required. Create one at https://vercel.com/account/tokens');
  }

  const url = new URL(path, VERCEL_API);
  if (opts.teamId) {
    url.searchParams.set('teamId', opts.teamId);
    delete (opts as Record<string, unknown>).teamId;
  }

  return fetch(url.toString(), {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...opts.headers,
    },
  });
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  if (dryRun) {
    console.log('[DRY RUN] No changes will be made.\n');
  }

  // 1. Find project (try both team and personal)
  const teamId = process.env.VERCEL_TEAM_ID; // optional
  const projectName = process.env.VERCEL_PROJECT_NAME || 'eonpro';

  let projectRes = await vercelFetch(`/v9/projects/${projectName}`, {
    teamId: teamId || undefined,
  });

  if (!projectRes.ok) {
    const err = await projectRes.text();
    console.error('Failed to find project:', projectRes.status, err);
    process.exit(1);
  }

  const project = (await projectRes.json()) as { id: string; name: string };
  console.log(`✓ Project: ${project.name} (${project.id})\n`);

  // 2. Get latest production deployment
  const deploymentsRes = await vercelFetch(
    `/v6/deployments?projectId=${project.id}&target=production&limit=1`,
    { teamId: teamId || undefined }
  );
  if (!deploymentsRes.ok) {
    console.error('Failed to list deployments:', await deploymentsRes.text());
    process.exit(1);
  }

  const deployments = (await deploymentsRes.json()) as { deployments?: Array<{ uid: string; state: string; meta?: { githubCommitSha?: string } }> };
  const latest = deployments.deployments?.[0];
  if (!latest || latest.state !== 'READY') {
    console.error('No ready production deployment found.');
    process.exit(1);
  }

  console.log(`✓ Latest production deployment: ${latest.uid}`);
  if (latest.meta?.githubCommitSha) {
    console.log(`  Commit: ${latest.meta.githubCommitSha}\n`);
  }

  // 3. Add ot.eonpro.io explicitly
  if (!dryRun) {
    const addDomainRes = await vercelFetch(`/v10/projects/${project.id}/domains`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'ot.eonpro.io',
        gitBranch: null,
      }),
      teamId: teamId || undefined,
    });

    if (addDomainRes.ok) {
      const domain = (await addDomainRes.json()) as { name: string; verified: boolean };
      console.log(`✓ Added domain: ${domain.name} (verified: ${domain.verified})`);
    } else if (addDomainRes.status === 400) {
      const err = (await addDomainRes.json()) as { error?: { message?: string } };
      if (err.error?.message?.includes('already exists')) {
        console.log('✓ Domain ot.eonpro.io already exists on project');
      } else {
        console.warn('Domain add returned 400:', err);
      }
    } else {
      console.warn('Domain add failed:', addDomainRes.status, await addDomainRes.text());
    }
  } else {
    console.log('[DRY RUN] Would add ot.eonpro.io to project');
  }

  // 4. Promote latest deployment — points ALL production domains to this deployment
  // This clears any stale/cached assignment for subdomains like ot
  if (!dryRun) {
    const promoteRes = await vercelFetch(
      `/v1/projects/${project.id}/rollback/${latest.uid}`,
      {
        method: 'POST',
        teamId: teamId || undefined,
      }
    );

    if (promoteRes.ok) {
      console.log(`\n✓ Promoted deployment ${latest.uid} — all production domains now point to latest`);
    } else {
      console.warn('\nPromote/rollback failed:', promoteRes.status, await promoteRes.text());
      console.log('You may need to do this manually in Vercel Dashboard → Deployments → Promote');
    }
  } else {
    console.log(`\n[DRY RUN] Would promote deployment ${latest.uid} to production`);
  }

  console.log('\nVerification:');
  console.log('  curl -s "https://ot.eonpro.io/api/version" | jq .');
  console.log('  # Should return JSON with same commit as app.eonpro.io');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
