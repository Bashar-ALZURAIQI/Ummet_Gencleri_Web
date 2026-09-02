# Ümmet Gençleri Web

Official website and management platform of Ümmet Gençleri.

## Technology

- React
- TypeScript
- Vite
- Tailwind CSS
- Supabase

## Local Development

Install dependencies:

npm install

Start development server:

npm run dev

Build:

npm run build

## Environment Variables

Create a local `.env` file:

VITE_SUPABASE_URL=<your-project-url>
VITE_SUPABASE_ANON_KEY=<your-anon-key>
VITE_VAPID_PUBLIC_KEY=<your-public-vapid-key>

Never commit `.env` or private credentials.

## Security

Administrative operations are protected by Supabase authentication,
Row Level Security and server-side authorization.
