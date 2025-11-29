/**
 * Development Token Generator
 * Creates a test token for development purposes
 * REMOVE THIS IN PRODUCTION!
 */

import { NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { JWT_SECRET } from '@/lib/auth/config';

export async function GET() {
  // Only allow in development
  if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") {
    return NextResponse.json(
      { error: 'Not available in production' },
      { status: 403 }
    );
  }

  try {
    // Create a test provider user token
    const token = await new SignJWT({
      id: 1,  // Real user ID from database
      email: 'provider@lifefile.com',
      name: 'Test Provider',
      role: 'provider',
      providerId: 1,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(JWT_SECRET);

    // Also create an admin token
    const adminToken = await new SignJWT({
      id: 3,  // Real admin user ID from database
      email: 'admin@lifefile.com',
      name: 'Test Admin',
      role: 'admin',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(JWT_SECRET);

    return NextResponse.json({
      message: 'Development tokens generated. Copy and paste into browser console:',
      provider: {
        token,
        setInBrowser: `localStorage.setItem('token', '${token}');`,
        user: {
          email: 'provider@lifefile.com',
          role: 'provider',
        }
      },
      admin: {
        token: adminToken,
        setInBrowser: `localStorage.setItem('token', '${adminToken}');`,
        user: {
          email: 'admin@lifefile.com',
          role: 'admin',
        }
      },
      instructions: [
        '1. Open browser console (F12)',
        '2. Copy one of the setInBrowser commands above',
        '3. Paste and run in console',
        '4. Refresh the page',
        '5. You should now be able to save patients'
      ]
    }, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      }
    });
  } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to generate token', details: errorMessage },
      { status: 500 }
    );
  }
}

// Also provide a POST endpoint for easier testing
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") {
    return NextResponse.json(
      { error: 'Not available in production' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { role = 'provider', email, name } = body;

    // Use actual IDs from the database for dev tokens
    let tokenData: any;
    if ((role as string) === "admin") {
      tokenData = {
        id: 3,  // Real admin user ID
        email: email || 'admin@lifefile.com',
        name: name || 'Test Admin',
        role: 'admin',
      };
    } else if (role === 'provider') {
      tokenData = {
        id: 1,  // Real provider user ID
        email: email || 'provider@lifefile.com',
        name: name || 'Test Provider',
        role: "provider",  // Use uppercase to match enum
        providerId: 1,
      };
    } else {
      // For other roles, use temporary IDs (won't work with foreign keys)
      tokenData = {
        id: Math.floor(Math.random() * 1000),
        email: email || `${role}@lifefile.com`,
        name: name || `Test ${role}`,
        role,
      };
      if (role === 'patient') {
        tokenData.patientId = 1;
      } else if (role === 'influencer') {
        tokenData.influencerId = 1;
      }
    }

    const token = await new SignJWT(tokenData)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(JWT_SECRET);

    // Set the token in a cookie as well
    const response = NextResponse.json({
      token,
      user: tokenData,
      message: 'Token generated successfully',
    });

    response.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test",
      sameSite: 'lax',
      maxAge: 86400, // 24 hours
    });

    return response;
  } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to generate token', details: errorMessage },
      { status: 500 }
    );
  }
}
