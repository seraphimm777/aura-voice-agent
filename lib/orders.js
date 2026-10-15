// Mock order DB + tools. Policy math lives in code, NOT in the LLM, so guardrails are deterministic.
export const ORDERS = {
  "ORD-101": { id: "ORD-101", customer: "Priya Sharma", product: "Vitamin C Serum (30ml)", value: 699, status: "Out for Delivery", notes: "BlueDart BD-982103. Expected by 6 PM today" },
  "ORD-102": { id: "ORD-102", customer: "Rahul Verma", product: "Hydrating Sunscreen SPF 50", value: 499, status: "Delivered", notes: "Delhivery DL-441029. Delivered 14 days ago", deliveredDaysAgo: 14 },
  "ORD-103": { id: "ORD-103", customer: "Ananya Patel", product: "Green Tea Face Wash + Toner", value: 850, status: "Processing", notes: "Ordered 3 hours ago. Eligible for cancellation" },
};

// cancelled-order state is passed in per request (stateless server)
const view = (o, cancelled) => (cancelled.has(o.id) ? { ...o, status: "Cancelled", notes: "Cancelled at the customer's request" } : o);

// Speech-to-text writes "ord 101" / "O R D 1 0 1" etc. Normalise to ORD-101.
export function normalizeId(raw = "") {
  const digits = String(raw).replace(/\D/g, "");
  return digits ? `ORD-${digits}` : "";
}

export function runTool(name, args = {}, cancelled = new Set()) {
  const id = normalizeId(args.order_id);
  if (!id) return { error: "MISSING_ORDER_ID", message: "No order ID provided. Ask the customer for it." };
  if (!ORDERS[id]) return { error: "ORDER_NOT_FOUND", message: `No order found with ID ${id}. Ask the customer to repeat or verify it.` };
  const o = view(ORDERS[id], cancelled);

  if (name === "get_order_details") return { order: o };

  if (name === "check_cancellation_eligibility") {
    const ok = o.status === "Processing";
    return { order_id: id, status: o.status, eligible: ok,
      reason: ok ? "Order is still Processing, so it can be cancelled." : o.status === "Cancelled" ? "Order is already cancelled." : "Cancellation is only possible while Processing. Customer may refuse delivery at the doorstep if Out for Delivery." };
  }

  if (name === "cancel_order") {
    if (o.status !== "Processing") return { order_id: id, cancelled: false, status: o.status, reason: "Order cannot be cancelled in its current status." };
    cancelled.add(id);
    return { order_id: id, cancelled: true, reference: `CXL-${id.slice(4)}`, message: "Order has been cancelled." };
  }

  if (name === "check_return_eligibility") {
    if (o.status !== "Delivered") return { order_id: id, eligible: false, reason: `Order is ${o.status}, not delivered yet, so a return doesn't apply.` };
    const within = o.deliveredDaysAgo <= 7;
    const unopened = args.product_opened === false;
    return { order_id: id, days_since_delivery: o.deliveredDaysAgo, eligible: within && unopened,
      reason: !within ? "Outside the 7-day return window." : args.product_opened === undefined ? "Ask the customer if the product is opened or used." : !unopened ? "Opened/used products cannot be returned." : "Within 7 days and unopened: eligible." };
  }
  return { error: "UNKNOWN_TOOL" };
}

export const toolDeclarations = [
  { name: "get_order_details", description: "Get status, product, value and tracking notes for an order.",
    parameters: { type: "OBJECT", properties: { order_id: { type: "STRING", description: "e.g. ORD-101" } }, required: ["order_id"] } },
  { name: "check_cancellation_eligibility", description: "Check if an order can be cancelled. Use before offering a cancellation.",
    parameters: { type: "OBJECT", properties: { order_id: { type: "STRING" } }, required: ["order_id"] } },
  { name: "cancel_order", description: "Actually cancel an order. ONLY call this after check_cancellation_eligibility says eligible AND the customer has explicitly said yes to cancelling. Never claim an order is cancelled unless this tool returned cancelled true.",
    parameters: { type: "OBJECT", properties: { order_id: { type: "STRING" } }, required: ["order_id"] } },
  { name: "check_return_eligibility", description: "Check if an order can be returned. Pass product_opened only if the customer said so.",
    parameters: { type: "OBJECT", properties: { order_id: { type: "STRING" }, product_opened: { type: "BOOLEAN" } }, required: ["order_id"] } },
];
