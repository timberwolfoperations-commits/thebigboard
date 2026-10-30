import type { ReactNode } from "react";

// The curated avatar set: simple animal marks in the site's black &
// cream theme. Each animal is drawn as a right half (mirrored by the
// Avatar component) plus center details. INK doubles as the tile color
// and the negative-space color, so eyes/noses always match the tile.
export const INK = "#141414";
export const CREAM = "#f7f4ef";

export const ANIMAL_KEYS = ["wolf", "fox", "bear", "owl", "lion", "stag", "ram", "bull", "horse", "boar", "cat", "dog"] as const;
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

export const ANIMAL_ART: Record<AnimalKey, { half: ReactNode; center: ReactNode }> = {
  wolf: {
    half: (<><path d="M24 8 L27 8.6 L30.5 2.6 L34 9.5 L36.5 15 L37 23 L34.5 31 L30 37.5 L24 40 Z"/></>),
    center: (<><path fill={INK} d="M20.8 32.5 Q24 31.2 27.2 32.5 L25.8 36 Q24 36.9 22.2 36 Z"/><circle fill={INK} cx="30" cy="20" r="1.9"/><circle fill={INK} cx="18" cy="20" r="1.9"/></>),
  },
  fox: {
    half: (<><path d="M24 9 L26.5 9.2 L34 1.2 L37.5 12 L39 19.5 L35.5 26.5 L36.5 28.2 L31 34.5 L24 40.5 Z"/></>),
    center: (<><path fill={INK} d="M21.5 34 Q24 33 26.5 34 L25.4 37.2 Q24 37.8 22.6 37.2 Z"/><circle fill={INK} cx="30.5" cy="20.5" r="1.7"/><circle fill={INK} cx="17.5" cy="20.5" r="1.7"/></>),
  },
  bear: {
    half: (<><circle cx="33" cy="10" r="4.6"/><path d="M24 7 C31 7 36.5 12 37.5 19 C38.3 25 36 32 32 36.5 C29 39.8 26 41 24 41 Z"/></>),
    center: (<><circle fill={INK} cx="33" cy="10" r="2"/><circle fill={INK} cx="15" cy="10" r="2"/><path fill={INK} d="M20.5 30.5 Q24 29.2 27.5 30.5 Q27 34 24 34.8 Q21 34 20.5 30.5 Z"/><circle fill={INK} cx="29.5" cy="19" r="1.8"/><circle fill={INK} cx="18.5" cy="19" r="1.8"/></>),
  },
  owl: {
    half: (<><path d="M24 5 L28 7 L31 3.5 L33.5 8 C37 12 38 17 37.5 23 C37 32 31 40 24 41 Z"/></>),
    center: (<><circle fill={INK} cx="30" cy="19" r="3.4"/><circle fill={INK} cx="18" cy="19" r="3.4"/><circle cx="30" cy="19" r="1.5"/><circle cx="18" cy="19" r="1.5"/><path fill={INK} d="M22.6 24.5 L25.4 24.5 L24 27.6 Z"/></>),
  },
  lion: {
    half: (<></>),
    center: (<><circle cx="24" cy="22" r="17.5"/><circle cx="24" cy="5.5" r="4.6"/><circle cx="35.7" cy="10.3" r="4.6"/><circle cx="40.5" cy="22" r="4.6"/><circle cx="35.7" cy="33.7" r="4.6"/><circle cx="24" cy="38.5" r="4.6"/><circle cx="12.3" cy="33.7" r="4.6"/><circle cx="7.5" cy="22" r="4.6"/><circle cx="12.3" cy="10.3" r="4.6"/><circle cx="24" cy="23" r="11"/><circle fill={INK} cx="20.3" cy="21" r="1.35"/><circle fill={INK} cx="27.7" cy="21" r="1.35"/><path fill={INK} d="M21.8 26.8 Q24 25.8 26.2 26.8 L25.1 29.4 Q24 30 22.9 29.4 Z"/></>),
  },
  stag: {
    half: (<><path d="M28 14 C31.5 10 33 5.5 32.5 1.8 M30.3 10.5 C33.5 9.5 35.8 6.8 36.5 3.5 M29 12.8 C31 11 31.8 8.5 31.6 6" fill="none" stroke="currentColor" strokeWidth="3.1" strokeLinecap="round"/><path d="M25.5 14.5 L31 10.8 L36 12.2 L33.5 16.8 L28 16.5 Z"/><path d="M24 12.5 C28 12.5 31 14.5 32 18.5 L31 26.5 L28.5 34 L24 37 Z"/></>),
    center: (<><path fill={INK} d="M21.8 31.3 Q24 30.3 26.2 31.3 L25.2 33.8 Q24 34.4 22.8 33.8 Z"/><circle fill={INK} cx="28.3" cy="21" r="1.6"/><circle fill={INK} cx="19.7" cy="21" r="1.6"/></>),
  },
  ram: {
    half: (<><path d="M32.5 13.5 C38.5 11.5 41.5 17 39 22 C37 26 32.8 25.8 31.8 22.3 C31 19.6 33 17.3 35.3 18" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round"/><path d="M24 10 C29 10 32.5 13 33 18.5 L32 28 L29 35 L24 37.5 Z"/></>),
    center: (<><circle fill={INK} cx="28.3" cy="20" r="1.6"/><circle fill={INK} cx="19.7" cy="20" r="1.6"/><circle fill={INK} cx="22.6" cy="33.2" r="0.95"/><circle fill={INK} cx="25.4" cy="33.2" r="0.95"/></>),
  },
  bull: {
    half: (<><path d="M30 13.5 C36 13 41.5 9.5 44 4.5 C39 6 33.5 7.5 29.8 8.2 Z"/><path d="M30.5 15 Q37.5 13.5 39.5 17.5 Q35.5 20.5 30.8 18.5 Z"/><path d="M24 9.5 C28.5 9.5 31.5 12 32.5 16.5 L32 26 L29.5 33.5 L24 36 Z"/></>),
    center: (<><path fill={INK} d="M19.2 29.5 Q24 28 28.8 29.5 L28.2 34 Q24 35.6 19.8 34 Z"/><circle cx="21.4" cy="31.8" r="1.05"/><circle cx="26.6" cy="31.8" r="1.05"/><circle fill={INK} cx="28.8" cy="19.5" r="1.6"/><circle fill={INK} cx="19.2" cy="19.5" r="1.6"/></>),
  },
  horse: {
    half: (<><path d="M24 11.5 L26.6 4 L29.8 10.8 C32.4 13.2 33.4 17 32.8 22 L30.8 31.5 L28.6 39 L24 42 Z"/></>),
    center: (<><circle fill={INK} cx="28.3" cy="18.5" r="1.7"/><circle fill={INK} cx="19.7" cy="18.5" r="1.7"/><circle fill={INK} cx="25.8" cy="36.5" r="1.2"/><circle fill={INK} cx="22.2" cy="36.5" r="1.2"/></>),
  },
  boar: {
    half: (<><path d="M24 8.5 L28 5.2 L30.8 10 C34.5 12 36.3 16 36.8 21 C37.2 27 34.8 33 30.2 36.5 L24 38.5 Z"/></>),
    center: (<><ellipse fill={INK} cx="24" cy="30" rx="5.6" ry="4.3"/><ellipse cx="22" cy="30" rx="0.95" ry="1.3"/><ellipse cx="26" cy="30" rx="0.95" ry="1.3"/><path d="M18.2 35.2 L19.7 29.2 L21.6 34.4 Z"/><path d="M29.8 35.2 L28.3 29.2 L26.4 34.4 Z"/><circle fill={INK} cx="29" cy="19" r="1.7"/><circle fill={INK} cx="19" cy="19" r="1.7"/></>),
  },
  cat: {
    half: (<><path d="M24 10.5 L27 10.5 L31.5 3.8 L34.2 11 C36.7 14 37.6 18 37.2 22.5 C36.8 29 33.2 35 28.6 37.4 L24 38.5 Z"/></>),
    center: (<><circle fill={INK} cx="29.5" cy="20" r="1.6"/><circle fill={INK} cx="18.5" cy="20" r="1.6"/><path fill={INK} d="M22.9 28.3 L25.1 28.3 L24 30.2 Z"/><path d="M29.5 26.5 L36.5 24.8 M29.8 28.8 L36.8 28.8 M18.5 26.5 L11.5 24.8 M18.2 28.8 L11.2 28.8" fill="none" stroke={INK} strokeWidth="0.9" strokeLinecap="round"/></>),
  },
  dog: {
    half: (<><path d="M29.5 8.5 C35.5 7.5 38.8 12.5 37.8 19.5 C37 25 33.8 27 31.3 24.8 C29.8 23.4 29.3 20 29.4 15 Z"/><path d="M24 7 C29.5 7 33 10.5 34 16 L33 26 L29.5 34 L24 36.5 Z"/></>),
    center: (<><ellipse fill={INK} cx="24" cy="29.3" rx="5.1" ry="3.9"/><path d="M21.4 26.6 Q24 25.6 26.6 26.6 L25.3 29.2 Q24 29.8 22.7 29.2 Z"/><circle fill={INK} cx="28.8" cy="17.5" r="1.7"/><circle fill={INK} cx="19.2" cy="17.5" r="1.7"/></>),
  },
};
