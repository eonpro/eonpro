import { prisma } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      patient: true,
      events: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });

  return Response.json({ orders });
}

