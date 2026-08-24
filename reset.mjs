// reset.mjs — Resets the demo space to pre-run state
//
// Usage:
//   CONTENTFUL_MANAGEMENT_TOKEN=<token> CONTENTFUL_SPACE_ID=<space> node reset.mjs
//
// What it does:
//   1. Deletes all target-market copies (entries with TARGET_BRAND in slug/title)
//   2. Clears the audiences field on all originals so they show up unassigned

import pkg from 'contentful-management';
const { createClient } = pkg;

// ── Keep in sync with src/config.ts ───────────────────────────────────────
const SOURCE_BRAND = 'YourBrand';
const TARGET_BRAND = 'YourBrandCopy';
// ──────────────────────────────────────────────────────────────────────────

const SPACE_ID = process.env.CONTENTFUL_SPACE_ID;
const ENV_ID = 'master';
const TOKEN = process.env.CONTENTFUL_MANAGEMENT_TOKEN;

if (!TOKEN) {
  console.error('Error: CONTENTFUL_MANAGEMENT_TOKEN environment variable is not set.');
  console.error('Run: CONTENTFUL_MANAGEMENT_TOKEN=<token> CONTENTFUL_SPACE_ID=<space> node reset.mjs');
  process.exit(1);
}

if (!SPACE_ID) {
  console.error('Error: CONTENTFUL_SPACE_ID environment variable is not set.');
  console.error('Run: CONTENTFUL_MANAGEMENT_TOKEN=<token> CONTENTFUL_SPACE_ID=<space> node reset.mjs');
  process.exit(1);
}

const cma = createClient({ accessToken: TOKEN }, { type: 'plain' });

async function main() {
  console.log('Fetching entries…');

  const [topics, tasks, routes] = await Promise.all([
    cma.entry.getMany({ spaceId: SPACE_ID, environmentId: ENV_ID, query: { content_type: 'topic', limit: 200 } }),
    cma.entry.getMany({ spaceId: SPACE_ID, environmentId: ENV_ID, query: { content_type: 'task', limit: 200 } }),
    cma.entry.getMany({ spaceId: SPACE_ID, environmentId: ENV_ID, query: { content_type: 'route', limit: 200 } }),
  ]);

  const allEntries = [...topics.items, ...tasks.items, ...routes.items];

  const targetBrandLower = TARGET_BRAND.toLowerCase();
  const isTargetCopy = (e) => {
    const slug = e.fields.slug?.['en-US'] ?? e.fields.path?.['en-US'] ?? '';
    const title = e.fields.title?.['en-US'] ?? '';
    return slug.includes(targetBrandLower) || title.toLowerCase().includes(targetBrandLower);
  };

  const hasAudienceAssigned = (e) => {
    const audiences = e.fields.audiences?.['en-US'] ?? [];
    return audiences.length > 0;
  };

  const targetCopies = allEntries.filter(isTargetCopy);
  const originals = allEntries.filter(e => !isTargetCopy(e) && hasAudienceAssigned(e));

  console.log(`Found ${targetCopies.length} ${TARGET_BRAND} copies to delete`);
  console.log(`Found ${originals.length} originals to reset\n`);

  // ── Delete target-market copies ────────────────────────────────────────────
  if (targetCopies.length > 0) {
    console.log(`Deleting ${TARGET_BRAND} copies…`);
    for (const entry of targetCopies) {
      const id = entry.sys.id;
      const label = entry.fields.title?.['en-US'] ?? entry.fields.path?.['en-US'] ?? id;
      try {
        if (entry.sys.publishedVersion) {
          await cma.entry.unpublish({ spaceId: SPACE_ID, environmentId: ENV_ID, entryId: id });
        }
        await cma.entry.delete({ spaceId: SPACE_ID, environmentId: ENV_ID, entryId: id });
        console.log(`  ✓ Deleted: ${label}`);
      } catch (err) {
        console.log(`  ✗ Failed to delete "${label}": ${err.message}`);
      }
    }
  }

  // ── Clear audiences on originals ──────────────────────────────────────────
  if (originals.length > 0) {
    console.log('\nClearing audiences on originals…');
    for (const entry of originals) {
      const id = entry.sys.id;
      const label = entry.fields.title?.['en-US'] ?? entry.fields.path?.['en-US'] ?? id;
      try {
        // Re-fetch to get current version before updating
        const fresh = await cma.entry.get({ spaceId: SPACE_ID, environmentId: ENV_ID, entryId: id });
        const updated = await cma.entry.update(
          { spaceId: SPACE_ID, environmentId: ENV_ID, entryId: id },
          { ...fresh, fields: { ...fresh.fields, audiences: { 'en-US': [] } } }
        );
        await cma.entry.publish(
          { spaceId: SPACE_ID, environmentId: ENV_ID, entryId: id },
          updated
        );
        console.log(`  ✓ Reset: ${label}`);
      } catch (err) {
        console.log(`  ✗ Failed to reset "${label}": ${err.message}`);
      }
    }
  }

  if (targetCopies.length === 0 && originals.length === 0) {
    console.log('Nothing to reset — space already looks clean.');
  } else {
    console.log('\nDone. Space is ready for the next demo run.');
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
