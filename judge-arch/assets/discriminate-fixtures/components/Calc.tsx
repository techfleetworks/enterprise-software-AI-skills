// PLANTED (boundary): business logic inside a UI component — arch-gate must flag this.
export function calculateTotal(a: number, b: number) {
  return a + b; // business rule that belongs in a service
}
