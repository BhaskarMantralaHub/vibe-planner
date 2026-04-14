/**
 * Cloudflare Pages Function — Storage redirect
 *
 * Redirects /storage/{bucket}/{path} to the Supabase Storage public URL.
 * Keeps stored URLs clean (no Supabase domain in the database).
 * Zero performance penalty — just a 302 redirect, browser loads directly from Supabase CDN.
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

  return Response.redirect(targetUrl, 302);
};
