import { lookupNpi } from "@/lib/npi";
import { z } from "zod";

const schema = z.object({
  npi: z.string().min(10).max(10),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json(parsed.error, { status: 400 });
  }

  try {
    const result = await lookupNpi(parsed.data.npi);
    return Response.json({ result });
  } catch (err: any) {
    // @ts-ignore
   
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: errorMessage ?? "Lookup failed" }, { status: 400 });
  }
}

