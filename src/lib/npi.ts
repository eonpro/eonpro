const NPI_REGISTRY_URL = 'https://npiregistry.cms.hhs.gov/api/';

export type NpiLookupResult = {
  number: string;
  enumerationType?: string;
  basic?: {
    firstName?: string;
    lastName?: string;
    first_name?: string;
    last_name?: string;
    namePrefix?: string;
    credential?: string;
  };
  addresses?: Array<{
    addressPurpose?: string;
    addressType?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  }>;
};

export async function lookupNpi(npi: string): Promise<NpiLookupResult> {
  const searchParams = new URLSearchParams({
    number: npi,
    version: '2.1',
  });

  const res = await fetch(`${NPI_REGISTRY_URL}?${searchParams.toString()}`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`NPI Registry request failed (${res.status})`);
  }

  const data = (await res.json()) as {
    result_count?: number;
    results?: NpiLookupResult[];
    Errors?: Array<{ description?: string }>;
  };

  if (data?.Errors?.length) {
    throw new Error(data.Errors.map((e: any) => e.description).join(', '));
  }

  if (!data?.result_count || !data.results?.length) {
    throw new Error('No provider found for that NPI');
  }

  return data.results[0];
}
