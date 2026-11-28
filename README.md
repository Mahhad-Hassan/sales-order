# Sales Order

Sales Order Management is built with React, TypeScript, Tailwind CSS, and Vite. Its frontend uses the Frappe API and the Cloudflare Pages Function at `functions\api\frappe-proxy\[[path]].ts`.

## Development

Install dependencies and run the local app:

```powershell
npm install
npm run dev
```

The Vite development server proxies `/api/` requests to the configured Frappe site. Production requests use `/api/frappe-proxy`.

## Build

```powershell
npm run build
```

The static site is generated in `dist\react-app`.

## Cloudflare Pages

Keep the `functions\` directory at the repository root. Set the Pages output directory to `dist\react-app`; the Pages Function proxies Frappe API requests and the `public\_routes.json` manifest keeps those requests routed to the Function.

To run the Pages site and Function locally:

```powershell
npx wrangler pages dev dist\react-app --compatibility-date 2026-11-06
```

Deploy both assets and Functions from the repository root:

```powershell
npx wrangler pages deploy dist\react-app --project-name sales-order --branch master
```
