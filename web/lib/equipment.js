// The kitchen equipment an owner can say they cook with. Keys match the worker's stations (src/server/equipment.mjs).
export const EQUIPMENT = [
  { key: "fryer", label: "Deep fryer" },
  { key: "plancha", label: "Flat-top griddle (plancha)" },
  { key: "grill", label: "Grill" },
  { key: "oven", label: "Oven (pizza or deck)" },
  { key: "wok", label: "Wok" },
  { key: "pot", label: "Big pot (soups, stews)" },
  { key: "blender", label: "Blender (shakes, juices)" },
  { key: "espresso", label: "Espresso machine" },
];
// The owner's choice is kept as a restaurant note (lessons, source "equipment"), so no table had to change.
export const EQUIPMENT_SOURCE = "equipment";
export const equipmentText = (keys) => `The kitchen cooks with: ${keys.map((k) => EQUIPMENT.find((e) => e.key === k)?.label || k).join(", ") || "none of the usual equipment"}.`;
