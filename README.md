# contentful-regional-audience-duplicator

A Contentful Page App that scans Help Center entries by brand name, lets editors select which to duplicate for a target market, and runs the duplication in one click — no scripts, no terminal.

**What it does:**

1. Scans all `topic`, `task`, and `route` entries for a configurable brand name in titles and slugs
2. Presents a checklist of matching entries (all pre-selected)
3. On confirm, for each selected entry:
   - Creates a copy with the brand name replaced (e.g. `Clover` → `TrunkClover`) in title and slug
   - Assigns the copy to a target-market audience entry
   - Updates the original to a global (non-target) audience entry
   - Rewires `route` entries to point at their new market-specific article copies
4. Processes in dependency order (topics → tasks → routes) so references are always valid

A `reset.mjs` script reverses all changes for repeated demo or test runs.

---

## Prerequisites

- Node.js 18+
- A Contentful space with `topic`, `task`, and `route` content types
- An `audiences` reference field on those content types
- Two audience entries in the space (target market + global)
- A Contentful App Definition set to the **Page** location

---

## Configuration

Edit **`src/config.ts`** before building:

```ts
export const TARGET_AUDIENCE_ID = 'your-target-audience-entry-id';
export const GLOBAL_AUDIENCE_ID  = 'your-global-audience-entry-id';
export const SOURCE_BRAND        = 'YourBrand';      // brand name to scan for
export const TARGET_BRAND        = 'YourBrandCopy';  // brand name for copies
export const TARGET_MARKET       = 'Japan';          // label used in UI text
export const GLOBAL_MARKET       = 'Global (Except Japan)'; // label used in UI text
```

Mirror the brand names in the config block at the top of **`reset.mjs`** (noted inline).

---

## Setup

```bash
npm install
```

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

```
CONTENTFUL_ACCESS_TOKEN=your-cma-token
CONTENTFUL_ORG_ID=your-org-id
CONTENTFUL_APP_DEF_ID=your-app-definition-id
CONTENTFUL_SPACE_ID=your-space-id
```

---

## Build & deploy

```bash
npm run build
npm run upload
```

Then install the app in your space via **Apps > Manage apps**.

---

## Local development

```bash
npm run dev
```

Set the app's frontend URL to `http://localhost:3000` in your App Definition while developing.

---

## Reset

To undo all duplications and restore originals to an unaudience-assigned state:

```bash
CONTENTFUL_MANAGEMENT_TOKEN=<token> CONTENTFUL_SPACE_ID=<space> node reset.mjs
```

---

> **Disclaimer:** Contentful provides this sample code solely to demonstrate a technical scenario. Any and all sample code provided by Contentful is not intended for production use. Contentful is not responsible for maintaining or supporting this sample code after it has been provided to you.
