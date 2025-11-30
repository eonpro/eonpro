import { NextRequest, NextResponse } from 'next/server';

// Proxy endpoint for NPI Registry lookup to avoid CORS issues
// The NPPES API doesn't support CORS, so we need to make the request server-side

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const npi = searchParams.get('npi');

  if (!npi) {
    return NextResponse.json({ error: 'NPI number is required' }, { status: 400 });
  }

  // Validate NPI format (10 digits)
  if (!/^\d{10}$/.test(npi)) {
    return NextResponse.json({ error: 'Invalid NPI format. Must be 10 digits.' }, { status: 400 });
  }

  try {
    const response = await fetch(
      `https://npiregistry.cms.hhs.gov/api/?version=2.1&number=${npi}`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: `NPI Registry returned status ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Check if results were found
    if (!data.results || data.results.length === 0) {
      return NextResponse.json({ error: 'No provider found with this NPI' }, { status: 404 });
    }

    const result = data.results[0];
    
    // Extract relevant provider information
    const providerInfo = {
      npi: result.number,
      entityType: result.enumeration_type, // 'NPI-1' for individual, 'NPI-2' for organization
      // For individual providers (NPI-1)
      firstName: result.basic?.first_name || '',
      lastName: result.basic?.last_name || '',
      middleName: result.basic?.middle_name || '',
      credential: result.basic?.credential || '',
      // For organizations (NPI-2)
      organizationName: result.basic?.organization_name || '',
      // Common fields
      gender: result.basic?.gender || '',
      status: result.basic?.status || '',
      lastUpdated: result.basic?.last_updated || '',
      // Primary taxonomy (specialty)
      taxonomies: result.taxonomies?.map((t: any) => ({
        code: t.code,
        desc: t.desc,
        primary: t.primary,
        state: t.state,
        license: t.license,
      })) || [],
      // Get primary specialty
      primarySpecialty: result.taxonomies?.find((t: any) => t.primary)?.desc || 
                        result.taxonomies?.[0]?.desc || '',
      // License info from taxonomy
      licenseNumber: result.taxonomies?.find((t: any) => t.primary)?.license ||
                     result.taxonomies?.[0]?.license || '',
      licenseState: result.taxonomies?.find((t: any) => t.primary)?.state ||
                    result.taxonomies?.[0]?.state || '',
      // Addresses
      addresses: result.addresses?.map((a: any) => ({
        type: a.address_purpose, // 'LOCATION' or 'MAILING'
        address1: a.address_1,
        address2: a.address_2,
        city: a.city,
        state: a.state,
        zip: a.postal_code,
        phone: a.telephone_number,
        fax: a.fax_number,
      })) || [],
      // Identifiers (may include state license numbers)
      identifiers: result.identifiers || [],
    };

    return NextResponse.json(providerInfo);
  } catch (error: any) {
    console.error('NPI lookup error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to lookup NPI' },
      { status: 500 }
    );
  }
}

