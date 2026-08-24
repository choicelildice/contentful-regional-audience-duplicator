// ── Configure these values before building the app ─────────────────────────
// After editing, run `npm run build && npm run upload` to redeploy.

/** Entry ID of the target-market audience in your Contentful space */
export const TARGET_AUDIENCE_ID = 'your-target-audience-entry-id';

/** Entry ID of the global (non-targeted) audience in your Contentful space */
export const GLOBAL_AUDIENCE_ID = 'your-global-audience-entry-id';

/** Brand name to scan for in entry titles and slugs */
export const SOURCE_BRAND = 'YourBrand';

/** Brand name to use in duplicated target-market entries */
export const TARGET_BRAND = 'YourBrandCopy';

/** Short label for the target market — used in UI text */
export const TARGET_MARKET = 'Japan';

/** Label for the global audience — used in UI text */
export const GLOBAL_MARKET = 'Global (Except Japan)';
