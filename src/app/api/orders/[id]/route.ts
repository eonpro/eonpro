import lifefile from "@/lib/lifefile";
import { logger } from '@/lib/logger';
import { Patient, Provider, Order } from '@/types/models';

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(_req: Request, { params }: Params) {
  const resolvedParams = await params;
  const { id } = resolvedParams;
  try {
    const status = await lifefile.getOrderStatus(id);
    return Response.json({ success: true, status });
  } catch (err: any) {
    // @ts-ignore
   
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.error("[ORDER STATUS] error:", err);
    return Response.json(
      { success: false, error: errorMessage ?? "Unknown error" },
      { status: 502 }
    );
  }
}

