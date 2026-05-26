// Lightweight smoke page that renders through the root layout. The deploy
// health check hits this to catch SSR errors (e.g. a hook called outside its
// provider) that `/api/health` cannot see, since Route Handlers bypass
// `app/layout.tsx`. Keep this page free of redirects, auth lookups, and
// data fetching so the probe stays deterministic.
export const dynamic = 'force-dynamic';

export default function HealthzPage() {
	return <div>ok</div>;
}
