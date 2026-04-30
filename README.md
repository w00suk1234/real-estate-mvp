# AgentNote Real Estate MVP

AgentNote is a real-estate brokerage workflow MVP for managing customers, schedules, listing briefings, and brochure-ready property notes.

## Production URLs

- Primary domain: https://agentnote.co.kr
- Vercel preview/default URL: https://real-estate-mvp-navy.vercel.app

User-facing links should use `https://agentnote.co.kr`. The Vercel URL is kept only as a fallback/reference address.

## Stack

- Frontend: Vite + React
- Hosting: Vercel
- Auth / Database / Storage: Supabase
- Storage bucket: `property-images`
- Chrome extension: reads the current Naver Land page and sends listing data to AgentNote

## Image Storage Policy

Images must not be stored directly in the database.

Required flow:

1. User selects representative/additional listing images.
2. Browser resizes and compresses each image before upload.
3. Compressed images are uploaded to Supabase Storage bucket `property-images`.
4. Database rows store only public URLs or storage paths.

Limits:

- Representative image: 1 file
- Additional images: up to 10 files
- Original file size: max 10MB per image
- Allowed formats: jpg, jpeg, png, webp
- Resize target: max 1200px on the longest side
- Output target: WebP, quality around 0.82, retry around 0.72 if needed

Do not save base64 data URLs, File objects, or original high-resolution image bodies in Supabase tables.

## Local Development

```bash
cd frontend
npm install
npm run dev
```

## Environment Variables

Create `frontend/.env.local`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-key
VITE_APP_URL=https://agentnote.co.kr
VITE_API_BASE_URL=
```

## Build

```bash
cd frontend
npm run build
```

## Chrome Extension Install

1. Open `chrome://extensions` in Chrome.
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select the project `chrome-extension` folder.
5. Refresh the Naver Land tab, then use the AgentNote import button.

The extension sends listing data to https://agentnote.co.kr.
