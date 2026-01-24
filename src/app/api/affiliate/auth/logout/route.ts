/**
 * Affiliate Logout
 * 
 * Clears the session cookie.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'affiliate_session';

export async function POST() {
  const cookieStore = await cookies();
  
  cookieStore.delete(COOKIE_NAME);

  return NextResponse.json({ success: true });
}
