import React, { useState, useEffect, useCallback } from 'react';
import type { PageAppSDK } from '@contentful/app-sdk';
import {
  Box,
  Flex,
  Stack,
  Heading,
  Paragraph,
  Text,
  Button,
  Checkbox,
  Spinner,
  Badge,
  Note,
  Table,
} from '@contentful/f36-components';
import {
  TARGET_AUDIENCE_ID,
  GLOBAL_AUDIENCE_ID,
  SOURCE_BRAND,
  TARGET_BRAND,
  TARGET_MARKET,
  GLOBAL_MARKET,
} from './config';

type EntryType = 'topic' | 'task' | 'route';
type EntryStatus = 'idle' | 'running' | 'done' | 'error';

interface DemoEntry {
  id: string;
  type: EntryType;
  label: string;
  slug: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawFields: Record<string, any>;
  status: EntryStatus;
  japanId?: string;
  error?: string;
}

interface Props {
  sdk: PageAppSDK;
}

function replaceBrand(str: string): string {
  const re = new RegExp(SOURCE_BRAND, 'g');
  const reLower = new RegExp(SOURCE_BRAND.toLowerCase(), 'g');
  return str.replace(re, TARGET_BRAND).replace(reLower, TARGET_BRAND.toLowerCase());
}

function audienceLink(id: string) {
  return { sys: { type: 'Link' as const, linkType: 'Entry' as const, id } };
}

export default function App({ sdk }: Props) {
  const [entries, setEntries] = useState<DemoEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle');
  const [doneCount, setDoneCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);

  const envId = sdk.ids.environment;

  // ── Load entries ──────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const [topics, tasks, routes] = await Promise.all([
          sdk.cma.entry.getMany({ environmentId: envId, query: { content_type: 'topic', limit: 200 } }),
          sdk.cma.entry.getMany({ environmentId: envId, query: { content_type: 'task', limit: 200 } }),
          sdk.cma.entry.getMany({ environmentId: envId, query: { content_type: 'route', limit: 200 } }),
        ]);

        const items: DemoEntry[] = [];

        const brandLower = SOURCE_BRAND.toLowerCase();

        for (const e of topics.items) {
          const title: string = e.fields.title?.['en-US'] ?? '';
          const slug: string = e.fields.slug?.['en-US'] ?? '';
          if (title.includes(SOURCE_BRAND) || slug.includes(brandLower)) {
            items.push({ id: e.sys.id, type: 'topic', label: title, slug, rawFields: e.fields, status: 'idle' });
          }
        }

        for (const e of tasks.items) {
          const title: string = e.fields.title?.['en-US'] ?? '';
          const slug: string = e.fields.slug?.['en-US'] ?? '';
          if (title.includes(SOURCE_BRAND) || slug.includes(brandLower)) {
            items.push({ id: e.sys.id, type: 'task', label: title, slug, rawFields: e.fields, status: 'idle' });
          }
        }

        for (const e of routes.items) {
          const path: string = e.fields.path?.['en-US'] ?? '';
          if (path.includes(brandLower)) {
            items.push({ id: e.sys.id, type: 'route', label: path, slug: path, rawFields: e.fields, status: 'idle' });
          }
        }

        // Sort: topics → tasks → routes
        items.sort((a, b) => {
          const order: Record<EntryType, number> = { topic: 0, task: 1, route: 2 };
          return order[a.type] - order[b.type];
        });

        setEntries(items);
        setSelected(new Set(items.map(i => i.id)));
      } catch (err: unknown) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load entries');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [envId]);

  // ── Selection helpers ─────────────────────────────────────────────────────
  const toggleAll = useCallback(() => {
    setSelected(prev =>
      prev.size === entries.length ? new Set() : new Set(entries.map(e => e.id))
    );
  }, [entries]);

  const toggleOne = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const updateEntry = useCallback((id: string, patch: Partial<DemoEntry>) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
  }, []);

  // ── Duplication logic ─────────────────────────────────────────────────────
  const runDuplication = useCallback(async () => {
    setPhase('running');
    setDoneCount(0);
    setErrorCount(0);

    const toProcess = entries.filter(e => selected.has(e.id));
    const topics = toProcess.filter(e => e.type === 'topic');
    const tasks = toProcess.filter(e => e.type === 'task');
    const routes = toProcess.filter(e => e.type === 'route');

    // Map original entry ID → Japan copy ID, built as we go
    const idMap = new Map<string, string>();

    async function processArticle(entry: DemoEntry, contentTypeId: string) {
      updateEntry(entry.id, { status: 'running' });
      try {
        const newTitle = replaceBrand(entry.rawFields.title?.['en-US'] ?? '');
        const newSlug = replaceBrand(entry.rawFields.slug?.['en-US'] ?? '');

        // For tasks: point parentTopic at the Japan copy if one was created
        const parentField =
          contentTypeId === 'task' && entry.rawFields.parentTopic?.['en-US']
            ? {
                parentTopic: {
                  'en-US': audienceLink(
                    idMap.get(entry.rawFields.parentTopic['en-US'].sys.id) ??
                    entry.rawFields.parentTopic['en-US'].sys.id
                  ),
                },
              }
            : {};

        const created = await sdk.cma.entry.create(
          { contentTypeId, environmentId: envId },
          {
            fields: {
              title: { 'en-US': newTitle },
              slug: { 'en-US': newSlug },
              ...(entry.rawFields.body ? { body: entry.rawFields.body } : {}),
              ...parentField,
              audiences: { 'en-US': [audienceLink(TARGET_AUDIENCE_ID)] },
            },
          }
        );
        await sdk.cma.entry.publish({ entryId: created.sys.id, environmentId: envId }, created);

        // Assign Global audience to the original
        const original = await sdk.cma.entry.get({ entryId: entry.id, environmentId: envId });
        const updated = await sdk.cma.entry.update(
          { entryId: entry.id, environmentId: envId },
          { ...original, fields: { ...original.fields, audiences: { 'en-US': [audienceLink(GLOBAL_AUDIENCE_ID)] } } }
        );
        await sdk.cma.entry.publish({ entryId: entry.id, environmentId: envId }, updated);

        idMap.set(entry.id, created.sys.id);
        updateEntry(entry.id, { status: 'done', japanId: created.sys.id });
        setDoneCount(n => n + 1);
      } catch (err: unknown) {
        updateEntry(entry.id, { status: 'error', error: err instanceof Error ? err.message : 'Error' });
        setErrorCount(n => n + 1);
      }
    }

    async function processRoute(entry: DemoEntry) {
      updateEntry(entry.id, { status: 'running' });
      try {
        const newPath = replaceBrand(entry.rawFields.path?.['en-US'] ?? '');
        const linkedId: string | undefined = entry.rawFields.linkedContent?.['en-US']?.sys?.id;
        const japanLinkedId = linkedId ? (idMap.get(linkedId) ?? linkedId) : undefined;

        const created = await sdk.cma.entry.create(
          { contentTypeId: 'route', environmentId: envId },
          {
            fields: {
              path: { 'en-US': newPath },
              ...(japanLinkedId
                ? { linkedContent: { 'en-US': audienceLink(japanLinkedId) } }
                : {}),
              audiences: { 'en-US': [audienceLink(TARGET_AUDIENCE_ID)] },
            },
          }
        );
        await sdk.cma.entry.publish({ entryId: created.sys.id, environmentId: envId }, created);

        const original = await sdk.cma.entry.get({ entryId: entry.id, environmentId: envId });
        const updated = await sdk.cma.entry.update(
          { entryId: entry.id, environmentId: envId },
          { ...original, fields: { ...original.fields, audiences: { 'en-US': [audienceLink(GLOBAL_AUDIENCE_ID)] } } }
        );
        await sdk.cma.entry.publish({ entryId: entry.id, environmentId: envId }, updated);

        idMap.set(entry.id, created.sys.id);
        updateEntry(entry.id, { status: 'done', japanId: created.sys.id });
        setDoneCount(n => n + 1);
      } catch (err: unknown) {
        updateEntry(entry.id, { status: 'error', error: err instanceof Error ? err.message : 'Error' });
        setErrorCount(n => n + 1);
      }
    }

    // Process in dependency order: topics → tasks → routes
    for (const e of topics) await processArticle(e, 'topic');
    for (const e of tasks) await processArticle(e, 'task');
    for (const e of routes) await processRoute(e);

    setPhase('done');
  }, [entries, selected, envId, updateEntry]);

  // ── Loading / error states ────────────────────────────────────────────────
  if (loading) {
    return (
      <Flex alignItems="center" justifyContent="center" style={{ height: '50vh' }}>
        <Flex alignItems="center" gap="spacingS">
          <Spinner />
          <Text>Scanning Help Center entries…</Text>
        </Flex>
      </Flex>
    );
  }

  if (loadError) {
    return (
      <Box padding="spacingXl">
        <Note variant="negative">{loadError}</Note>
      </Box>
    );
  }

  const totalSelected = entries.filter(e => selected.has(e.id)).length;
  const allChecked = selected.size === entries.length && entries.length > 0;
  const someChecked = selected.size > 0 && selected.size < entries.length;

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <Box padding="spacingXl" style={{ maxWidth: 900, margin: '0 auto' }}>
      <Stack flexDirection="column" spacing="spacingL">

        <Stack flexDirection="column" spacing="spacingXs">
          <Heading as="h1">{TARGET_MARKET} Market Launch</Heading>
          <Paragraph fontColor="gray600">
            Found <strong>{entries.length}</strong> Help Center{' '}
            {entries.length === 1 ? 'entry' : 'entries'} containing "{SOURCE_BRAND}" in
            the title or slug. Select the entries to duplicate, then click{' '}
            <strong>Duplicate for {TARGET_MARKET}</strong>.
          </Paragraph>
          <Paragraph fontColor="gray500" fontSize="fontSizeS">
            Each selected entry is cloned with "{SOURCE_BRAND}" → "{TARGET_BRAND}" in
            titles and slugs. {TARGET_MARKET} copies receive the {TARGET_MARKET}{' '}
            audience; originals are updated to {GLOBAL_MARKET}. Routes are rewired to
            point at their {TARGET_MARKET} article copies.
          </Paragraph>
        </Stack>

        {phase === 'done' && (
          <Note variant={errorCount > 0 ? 'warning' : 'positive'}>
            <strong>
              {doneCount} {doneCount === 1 ? 'entry' : 'entries'} duplicated
              {errorCount > 0 ? ` · ${errorCount} failed` : ' successfully'}.
            </strong>{' '}
            {TARGET_MARKET} copies use {TARGET_BRAND} branding and are assigned to the{' '}
            {TARGET_MARKET} audience. Originals now target {GLOBAL_MARKET}.
          </Note>
        )}

        <Table>
          <Table.Head>
            <Table.Row>
              <Table.Cell style={{ width: 44 }}>
                {phase === 'idle' && entries.length > 0 && (
                  <Checkbox
                    isChecked={allChecked}
                    isIndeterminate={someChecked}
                    onChange={toggleAll}
                    aria-label="Select all"
                  />
                )}
              </Table.Cell>
              <Table.Cell style={{ width: 72 }}>Type</Table.Cell>
              <Table.Cell>Title / Path</Table.Cell>
              <Table.Cell>Slug</Table.Cell>
              <Table.Cell style={{ width: 160 }}>Status</Table.Cell>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            {entries.map(entry => (
              <Table.Row key={entry.id}>
                <Table.Cell>
                  {phase === 'idle' && (
                    <Checkbox
                      isChecked={selected.has(entry.id)}
                      onChange={() => toggleOne(entry.id)}
                      aria-label={`Select ${entry.label}`}
                    />
                  )}
                </Table.Cell>
                <Table.Cell>
                  <Badge
                    variant={
                      entry.type === 'topic' ? 'primary'
                      : entry.type === 'task' ? 'featured'
                      : 'secondary'
                    }
                  >
                    {entry.type}
                  </Badge>
                </Table.Cell>
                <Table.Cell>
                  <Text>{entry.label}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Text fontSize="fontSizeS" fontColor="gray500">{entry.slug}</Text>
                </Table.Cell>
                <Table.Cell>
                  {entry.status === 'running' && (
                    <Flex alignItems="center" gap="spacingXs">
                      <Spinner size="small" />
                      <Text fontSize="fontSizeS" fontColor="gray600">Duplicating…</Text>
                    </Flex>
                  )}
                  {entry.status === 'done' && (
                    <Text fontSize="fontSizeS" fontColor="green600">✓ Done</Text>
                  )}
                  {entry.status === 'error' && (
                    <Text fontSize="fontSizeS" fontColor="red600">✗ {entry.error}</Text>
                  )}
                  {entry.status === 'idle' && phase === 'idle' && (
                    <Text fontSize="fontSizeS" fontColor={selected.has(entry.id) ? 'gray500' : 'gray400'}>
                      {selected.has(entry.id) ? 'Ready' : 'Skip'}
                    </Text>
                  )}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>

        {phase !== 'done' && (
          <Flex justifyContent="flex-end" alignItems="center" gap="spacingM">
            {phase === 'idle' && selected.size > 0 && (
              <Text fontColor="gray500" fontSize="fontSizeS">
                {selected.size} of {entries.length} selected
              </Text>
            )}
            <Button
              variant="positive"
              size="medium"
              isDisabled={totalSelected === 0 || phase === 'running'}
              isLoading={phase === 'running'}
              onClick={runDuplication}
            >
              {phase === 'running'
                ? `Duplicating… ${doneCount + errorCount} / ${totalSelected}`
                : `Duplicate ${totalSelected} ${totalSelected === 1 ? 'entry' : 'entries'} for ${TARGET_MARKET}`}
            </Button>
          </Flex>
        )}

      </Stack>
    </Box>
  );
}
