# Default Theme Backup

Preserved copies of the pre-branding theme files. Restore any of these to
revert back to the generic shadcn/Tailwind default appearance:

- `index.css.bak` — original CSS tokens (default shadcn blue at HSL 221.2 83.2% 53.3%)
- `favicon.svg.bak` — original purple/violet "bolt" favicon placeholder

To restore everything, copy these files back over:

```bash
cp src/themes/default-backup/index.css.bak src/index.css
cp src/themes/default-backup/favicon.svg.bak public/favicon.svg
```

And delete the branded additions:
- `src/lib/branding.tsx`
- Remove the Google Fonts link from `index.html`

Backed up on: 2026-04-20
