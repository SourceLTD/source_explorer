#!/usr/bin/env node
/**
 * Investigate an LLM job via the running Source Explorer Next.js server.
 *
 * Usage examples:
 *   node scripts/investigate-llm-job.mjs "Flag 3 Selected - Jan 14 09:57"
 *   node scripts/investigate-llm-job.mjs --jobId 210 --poll
 *   node scripts/investigate-llm-job.mjs --label "Flag 3 Selected" --entityType lexical_units
 *
 * Notes:
 * - This script talks to the app's HTTP API (default: http://localhost:3000).
 * - If you pass --poll, it will call /api/llm-jobs/poll which will reach out to OpenAI
 *   and update DB rows accordingly (potentially applying results).
 */
import process from 'node:process';

function parseArgs(argv) {
  const args = {
    baseUrl: 'http://localhost:3000',
    entityType: undefined,
    jobId: undefined,
    label: undefined,
    poll: false,
  };

  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--poll') {
      args.poll = true;
      continue;
    }
    if (a === '--baseUrl') {
      args.baseUrl = argv[++i];
      continue;
    }
    if (a === '--entityType') {
      args.entityType = argv[++i];
      continue;
    }
    if (a === '--jobId') {
      args.jobId = argv[++i];
      continue;
    }
    if (a === '--label') {
      args.label = argv[++i];
      continue;
    }
    if (a === '--help' || a === '-h') {
      console.log(
        [
          'Usage:',
          '  node scripts/investigate-llm-job.mjs [label-substring]',
          '  node scripts/investigate-llm-job.mjs --jobId <id> [--poll]',
          '',
          'Options:',
          '  --baseUrl <url>         Default: http://localhost:3000',
          '  --entityType <type>     e.g. lexical_units, frames, super_frames, frames_only',
          '  --jobId <id>            Job ID to inspect',
          '  --label <substring>     Label substring to search for',
          '  --poll                  Trigger /api/llm-jobs/poll for the target job before printing details',
        ].join('\n')
      );
      process.exit(0);
    }
    positionals.push(a);
  }

  if (!args.jobId && !args.label && positionals.length > 0) {
    // Treat a purely-numeric positional as a jobId; otherwise treat it as label substring.
    const first = positionals.join(' ').trim();
    if (/^\d+$/.test(first)) {
      args.jobId = first;
    } else {
      args.label = first;
    }
  }

  return args;
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}\n${text}`);
  }
  if (!text) return null;
  return JSON.parse(text);
}

function summarizeByStatus(items) {
  const counts = new Map();
  for (const item of items) {
    const s = item.status ?? 'unknown';
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}

function shortId(id, n = 18) {
  if (!id) return null;
  const s = String(id);
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.jobId && !args.label) {
    console.error('Provide either --jobId <id> or --label <substring> (or a positional label substring). Use --help for options.');
    process.exit(1);
  }

  const baseUrl = String(args.baseUrl).replace(/\/+$/, '');

  // Find jobId if needed
  let jobId = args.jobId;
  if (!jobId) {
    const url = new URL(`${baseUrl}/api/llm-jobs`);
    url.searchParams.set('includeCompleted', 'true');
    url.searchParams.set('refresh', 'false');
    url.searchParams.set('limit', '50');
    if (args.entityType) url.searchParams.set('entityType', args.entityType);
    const { jobs } = await fetchJson(url.toString());

    const needle = String(args.label).toLowerCase();
    const matches = (jobs ?? []).filter(j => String(j.label ?? '').toLowerCase().includes(needle));

    if (matches.length === 0) {
      console.error(`No jobs matched label substring: ${JSON.stringify(args.label)} (searched latest ${jobs?.length ?? 0})`);
      process.exit(2);
    }

    if (matches.length > 1) {
      console.log(`Found ${matches.length} matching jobs (showing up to 10):`);
      for (const j of matches.slice(0, 10)) {
        console.log(`- id=${j.id} status=${j.status} total=${j.total_items} label=${JSON.stringify(j.label ?? '')}`);
      }
      console.log('Using the newest match (highest created_at). If you want a specific one, pass --jobId <id>.');
    }

    matches.sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
    jobId = matches[0].id;
  }

  if (args.poll) {
    const pollUrl = new URL(`${baseUrl}/api/llm-jobs/poll`);
    pollUrl.searchParams.set('jobIds', String(jobId));
    pollUrl.searchParams.set('limit', '40');
    const pollRes = await fetchJson(pollUrl.toString());
    console.log('\n[Poll] /api/llm-jobs/poll result:');
    console.log(JSON.stringify(pollRes, null, 2));
  }

  const detailUrl = new URL(`${baseUrl}/api/llm-jobs/${jobId}`);
  detailUrl.searchParams.set('refresh', 'false');
  detailUrl.searchParams.set('pendingLimit', '200');
  detailUrl.searchParams.set('succeededLimit', '200');
  detailUrl.searchParams.set('failedLimit', '200');
  const job = await fetchJson(detailUrl.toString());

  console.log('\n[Job]');
  console.log(
    JSON.stringify(
      {
        id: job.id,
        label: job.label,
        status: job.status,
        job_type: job.job_type,
        total_items: job.total_items,
        submitted_items: job.submitted_items,
        processed_items: job.processed_items,
        succeeded_items: job.succeeded_items,
        failed_items: job.failed_items,
        flagged_items: job.flagged_items,
        created_at: job.created_at,
        started_at: job.started_at,
        completed_at: job.completed_at,
        updated_at: job.updated_at,
      },
      null,
      2
    )
  );

  const items = Array.isArray(job.items) ? job.items : [];
  console.log('\n[Items summary]');
  console.log(JSON.stringify(summarizeByStatus(items), null, 2));

  const nonTerminal = items.filter(i => !['succeeded', 'failed', 'skipped'].includes(i.status));
  if (nonTerminal.length > 0) {
    console.log(`\n[Non-terminal items] count=${nonTerminal.length} (showing up to 20):`);
    for (const i of nonTerminal.slice(0, 20)) {
      console.log(
        `- item=${i.id} status=${i.status} provider_task_id=${shortId(i.provider_task_id)} updated_at=${i.updated_at} entry=${i.entry?.code ?? ''}`
      );
    }
  }

  const failed = items.filter(i => i.status === 'failed');
  if (failed.length > 0) {
    console.log(`\n[Failed items] count=${failed.length} (showing up to 20):`);
    for (const i of failed.slice(0, 20)) {
      console.log(`- item=${i.id} entry=${i.entry?.code ?? ''}`);
      console.log(`  last_error=${i.last_error ?? ''}`);
      if (i.response_payload?.error?.code || i.response_payload?.error?.message) {
        console.log(`  provider_error_code=${i.response_payload?.error?.code ?? ''}`);
        console.log(`  provider_error_message=${i.response_payload?.error?.message ?? ''}`);
      }
    }
  }

  // Heuristic hints
  const allErrors = failed.map(i => String(i.last_error ?? '')).join('\n');
  if (allErrors.includes('Error retrieving tool list from MCP server')) {
    console.log('\n[Hint] This looks like an MCP server availability/packaging issue. As a mitigation, try re-running the job with Agentic mode (MCP) OFF.');
  }
}

main().catch(err => {
  console.error(err?.stack || String(err));
  process.exit(1);
});

