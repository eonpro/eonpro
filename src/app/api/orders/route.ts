import lifefile from "@/lib/lifefile";

export async function POST(req: Request) {
  const body = await req.json();
  const order = await lifefile.createOrder(body);
  return Response.json(order.data);
}
