# Codex-only inventory controls

This site does not include an admin page or public inventory editor.

Inventory is controlled locally in the Git repository through:

- `codex-inventory.json` - source data for listings, filters, and collections.
- `assets/listings/<listing-id>/` - photo folders for each listing.
- `tools/codex-inventory-admin.mjs` - local command-line generator used by Codex.
- `tools/new-listing-template.ps1` - reusable listing template for new listings.

The public website only receives generated product cards, filters, and listing data. Visitors cannot edit inventory through the website because there is no website admin page.

Common commands, run from the repository root:

```powershell
& 'C:\Users\gabri\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' tools\codex-inventory-admin.mjs list
& 'C:\Users\gabri\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' tools\codex-inventory-admin.mjs filters
& 'C:\Users\gabri\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' tools\codex-inventory-admin.mjs generate
& 'C:\Users\gabri\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' tools\codex-inventory-admin.mjs clear
```

To create a listing:

1. Add photos to `assets/listings/<listing-id>/`.
2. Ask Codex to add the listing details, or edit and run:

```powershell
powershell -ExecutionPolicy Bypass -File tools\new-listing-template.ps1
```

Useful Codex prompts:

- "Add a new .45 ACP listing named Heritage Elite with a $4,200 price and use these photos."
- "Archive a listing."
- "Change a listing to limited availability."
- "Clear all listings."

Production note: keep `tools/` out of the hosted site if you do not want visitors to view the raw helper scripts.
