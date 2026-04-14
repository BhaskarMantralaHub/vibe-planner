/**
 * Cloudflare Pages Function — Storage proxy
 *
 * Proxies /storage/{bucket}/{path} to Supabase Storage public URLs.
 * Hides the Supabase project URL from the browser.
 *
 * Example: /storage/expense-receipts/team-id/file.jpg
 *       → https://{project}.supabase.co/storage/v1/object/public/expense-receipts/team-id/file.jpg
 */

interface Env {
  SUPABASE_URL: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const pathSegments = context.params.path;
  const path = Array.isArray(pathSegments) ? pathSegments.join('/') : pathSegments;

  if (!path) {
    return new Response('Not found', { status: 404 });
  }

  const supabaseUrl = context.env.SUPABASE_URL;
  if (!supabaseUrl) {
    return new Response('Storage not configured', { status: 500 });
  }

  const targetUrl = `${supabaseUrl}/storage/v1/object/public/${path}`;

  const response = await fetch(targetUrl, {
    headers: { 'Accept': context.request.headers.get('Accept') || '*/*' },
  });

  if (!response.ok) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(response.body, {
    status: 200,
    headers: {
      'content-type': response.headers.get('content-type') || 'application/octet-stream',
      'content-length': response.headers.get('content-length') || '',
      'cache-control': 'public, max-age=31536000, immutable',
      'access-control-allow-origin': '*',
    },
  });
};
