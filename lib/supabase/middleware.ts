import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { Database } from '../types/database';
import { sanitizeRedirectUrl, isAuthDateToday, getTodayDateString } from '../utils/auth-helpers';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder')) {
    return supabaseResponse;
  }

  try {
    const supabase = createServerClient<Database>(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            supabaseResponse = NextResponse.next({
              request,
            });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // 1. Política de expiración "una vez por día"
    // Si hay un usuario activo, comprobamos si la cookie de fecha corresponde a hoy
    const sessionDayCookie = request.cookies.get('tpm_session_day')?.value;
    let isSessionValidToday = Boolean(user);

    if (user && sessionDayCookie && !isAuthDateToday(sessionDayCookie)) {
      // Ha comenzado un nuevo día: la sesión debe renovarse
      await supabase.auth.signOut();
      isSessionValidToday = false;
    } else if (user && !sessionDayCookie) {
      // Si el usuario está autenticado pero aún no tiene la cookie de sesión diaria,
      // la inicializamos para la jornada activa en la zona horaria de la planta
      const today = getTodayDateString();
      supabaseResponse.cookies.set('tpm_session_day', today, {
        path: '/',
        maxAge: 86400,
        sameSite: 'lax',
      });
    }

    const currentPath = request.nextUrl.pathname;

    // 2. Protección de rutas operativas: /equipo, /inspeccion y /perfil
    const isProtectedOperationalRoute =
      currentPath.startsWith('/equipo') || 
      currentPath.startsWith('/inspeccion') || 
      currentPath.startsWith('/perfil');

    if (isProtectedOperationalRoute && !isSessionValidToday) {
      const targetPath = currentPath + request.nextUrl.search;
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/login';
      redirectUrl.search = '';
      redirectUrl.searchParams.set('redirect', sanitizeRedirectUrl(targetPath, '/'));

      const redirectResponse = NextResponse.redirect(redirectUrl);
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
      });
      // Limpiar cookie de sesión diaria si estaba vencida
      redirectResponse.cookies.delete('tpm_session_day');
      return redirectResponse;
    }

    // 3. Protección de ruta /dashboard (Solo supervisor y mantenimiento)
    if (currentPath.startsWith('/dashboard')) {
      if (!isSessionValidToday) {
        const targetPath = currentPath + request.nextUrl.search;
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = '/login';
        redirectUrl.search = '';
        redirectUrl.searchParams.set('redirect', sanitizeRedirectUrl(targetPath, '/dashboard'));

        const redirectResponse = NextResponse.redirect(redirectUrl);
        supabaseResponse.cookies.getAll().forEach((cookie) => {
          redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
        });
        return redirectResponse;
      }

      // Si está autenticado, verificar que NO sea operador
      const { data: perfil } = await supabase
        .from('perfiles')
        .select('rol')
        .eq('id', user!.id)
        .maybeSingle();

      const userRole = (perfil as any)?.rol || user!.user_metadata?.rol || 'operador';

      if (userRole !== 'supervisor' && userRole !== 'mantenimiento') {
        // Operador intentando entrar al dashboard -> expulsar a home
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = '/';
        redirectUrl.search = '';
        redirectUrl.searchParams.set('unauthorized', '1');

        const redirectResponse = NextResponse.redirect(redirectUrl);
        supabaseResponse.cookies.getAll().forEach((cookie) => {
          redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
        });
        return redirectResponse;
      }
    }

    // 4. Si el usuario ya está autenticado e intenta acceder a /login
    if (currentPath === '/login' && isSessionValidToday) {
      const rawRedirect =
        request.nextUrl.searchParams.get('redirect') ||
        request.nextUrl.searchParams.get('redirectTo');

      let targetUrl = '/';
      if (rawRedirect) {
        targetUrl = sanitizeRedirectUrl(rawRedirect, '/');
      } else {
        // Redirigir según rol si no hay redirect específico
        const userRole = user?.user_metadata?.rol;
        if (userRole === 'supervisor' || userRole === 'mantenimiento') {
          targetUrl = '/dashboard';
        } else {
          targetUrl = '/';
        }
      }

      // Evitar loop infinito si el target fuera /login
      if (targetUrl === '/login') {
        targetUrl = '/';
      }

      const redirectUrl = new URL(targetUrl, request.url);
      const redirectResponse = NextResponse.redirect(redirectUrl);
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
      });
      return redirectResponse;
    }
  } catch (error) {
    console.error('Error refreshing session in middleware:', error);
  }

  return supabaseResponse;
}
