// PLANTED (ownership): writing into another module's table instead of its interface.
export function save(x: unknown) {
  otherModule.table.insert(x); // cross-module table write
}
