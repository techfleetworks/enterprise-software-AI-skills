// PLANTED (dependency): a service referencing a web transport concern — arch-gate must flag this.
export function loadOrder() {
  return request.body.orderId; // leaked `request` into a service
}
