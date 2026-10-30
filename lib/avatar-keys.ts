// Avatar animal keys + labels — pure data, no JSX, so server actions and
// server components can import it without pulling in the artwork module.
export const ANIMAL_KEYS = [
  "wolf",
  "fox",
  "bear",
  "owl",
  "lion",
  "stag",
  "ram",
  "bull",
  "horse",
  "boar",
  "cat",
  "dog",
] as const;

export type AnimalKey = (typeof ANIMAL_KEYS)[number];

export const ANIMAL_LIST: { key: AnimalKey; label: string }[] = [
  { key: "wolf", label: "Wolf" },
  { key: "fox", label: "Fox" },
  { key: "bear", label: "Bear" },
  { key: "owl", label: "Owl" },
  { key: "lion", label: "Lion" },
  { key: "stag", label: "Stag" },
  { key: "ram", label: "Ram" },
  { key: "bull", label: "Bull" },
  { key: "horse", label: "Horse" },
  { key: "boar", label: "Boar" },
  { key: "cat", label: "Cat" },
  { key: "dog", label: "Dog" },
];
