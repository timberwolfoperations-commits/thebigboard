import type { ReactNode } from "react";

// The curated avatar set: simple animal marks in the site's black &
// cream theme, drawn angular — crest, not cartoon. Each animal is a
// right half (mirrored by the Avatar component) plus center details.
// INK doubles as the tile color and the negative-space color, so
// eyes/noses always match the tile.
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
    half: (<><path d="M24 8 L28.5 9 L33.5 2.5 L36 10.5 L38.5 17 L36.8 26.5 L32 34.5 L24 41 Z"/><polygon fill={INK} points="29.8,8.6 32.6,4.8 33.2,10.2"/></>),
    center: (<><polygon fill={INK} points="21.8,35.5 26.2,35.5 24,38.8"/><polygon fill={INK} points="28.5,21.0 32.3,19.8 32.3,21.400000000000002 28.5,22.2"/><polygon fill={INK} points="15.700000000000001,21.0 19.5,19.8 19.5,21.400000000000002 15.700000000000001,22.2"/></>),
  },
  fox: {
    half: (<><path d="M24 9 L27 9.5 L34 1.5 L37 12 L39 19 L35.5 26 L37 28.5 L31.5 34.5 L24 41.5 Z"/><polygon fill={INK} points="29.5,9.2 33,4.5 33.8,11.5"/></>),
    center: (<><polygon fill={INK} points="22.2,36.5 25.8,36.5 24,39.2"/><polygon fill={INK} points="28.5,21.2 32.3,20.0 32.3,21.6 28.5,22.4"/><polygon fill={INK} points="15.700000000000001,21.2 19.5,20.0 19.5,21.6 15.700000000000001,22.4"/></>),
  },
  bear: {
    half: (<><polygon points="37.7,11.0 34.5,14.6 29.8,13.6 28.3,9.0 31.5,5.4 36.2,6.4"/><path d="M24 8 L32 9 L37 15 L37.5 24 L34 33 L29 38.5 L24 40 Z"/></>),
    center: (<><polygon fill={INK} points="19.8,29.5 28.2,29.5 27.2,33.8 20.8,33.8"/><polygon points="21.9,30.3 26.1,30.3 24,32.8"/><polygon fill={INK} points="27.700000000000003,19.9 31.5,18.7 31.5,20.3 27.700000000000003,21.099999999999998"/><polygon fill={INK} points="16.5,19.9 20.299999999999997,18.7 20.299999999999997,20.3 16.5,21.099999999999998"/></>),
  },
  owl: {
    half: (<><path d="M24 6 L29 8 L32.5 4 L35 9.5 L37.5 16 L36.5 26 L31 36 L24 40 Z"/></>),
    center: (<><polygon fill={INK} points="24,13 31.5,15.5 30.5,25.5 24,34 17.5,25.5 16.5,15.5"/><polygon fill="#f7f4ef" points="20.6,17.8 22.900000000000002,20.1 20.6,22.400000000000002 18.3,20.1"/><polygon fill="#f7f4ef" points="27.4,17.8 29.7,20.1 27.4,22.400000000000002 25.099999999999998,20.1"/><polygon points="22.8,24.2 25.2,24.2 24,27"/></>),
  },
  lion: {
    half: (<></>),
    center: (<><polygon points="24.0,3.8 26.8,7.7 31.0,5.2 32.1,9.9 36.9,9.1 36.1,13.9 40.8,15.0 38.3,19.2 42.2,22.0 38.3,24.8 40.8,29.0 36.1,30.1 36.9,34.9 32.1,34.1 31.0,38.8 26.8,36.3 24.0,40.2 21.2,36.3 17.0,38.8 15.9,34.1 11.1,34.9 11.9,30.1 7.2,29.0 9.7,24.8 5.8,22.0 9.7,19.2 7.2,15.0 11.9,13.9 11.1,9.1 15.9,9.9 17.0,5.2 21.2,7.7"/><polygon points="34.0,27.1 28.1,33.0 19.9,33.0 14.0,27.1 14.0,18.9 19.9,13.0 28.1,13.0 34.0,18.9"/><polygon fill={INK} points="26.0,21.4 29.799999999999997,20.2 29.799999999999997,21.8 26.0,22.599999999999998"/><polygon fill={INK} points="18.200000000000003,21.4 22.0,20.2 22.0,21.8 18.200000000000003,22.599999999999998"/><polygon fill={INK} points="21.9,26.8 26.1,26.8 24,29.8"/></>),
  },
  stag: {
    half: (<><path d="M28.5 13.5 L34.5 6.5 L34 1.5 M31.5 10.5 L38 7.5 L39 2.5 M30 12.2 L31.2 5.8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square"/><path d="M26 15 L33 11.5 L35.5 15 L31 17.5 Z"/><path d="M24 13 L30 12 L33.5 16 L32.5 25 L29.5 34 L24 38 Z"/></>),
    center: (<><polygon fill={INK} points="22,32.5 26,32.5 24,35.5"/><polygon fill={INK} points="27.900000000000002,21.0 31.3,19.8 31.3,21.400000000000002 27.900000000000002,22.2"/><polygon fill={INK} points="16.7,21.0 20.099999999999998,19.8 20.099999999999998,21.400000000000002 16.7,22.2"/></>),
  },
  ram: {
    half: (<><path d="M32 14 L38.5 11.5 L41.5 16.5 L39.5 23 L34.5 24.5 L31.8 20.5 L33.5 16.8 L36.8 17.2" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square" strokeLinejoin="miter"/><path d="M24 10.5 L30 10.5 L33 15 L32.5 24 L30 33 L24 36.5 Z"/></>),
    center: (<><polygon fill={INK} points="22.4,31.8 25.6,31.8 24,34"/><polygon fill={INK} points="26.900000000000002,20.2 30.3,19.0 30.3,20.6 26.900000000000002,21.4"/><polygon fill={INK} points="17.7,20.2 21.099999999999998,19.0 21.099999999999998,20.6 17.7,21.4"/></>),
  },
  bull: {
    half: (<><path d="M30 13 L37 11.5 L44 5.5 L43.8 10.5 L38 15.5 L30.5 16 Z"/><path d="M30.5 17.5 L37.5 16.2 L38.8 19.5 L32 21.5 Z"/><path d="M24 9.5 L31 11 L33.5 17 L32.5 26.5 L29.5 34.5 L24 36.5 Z"/></>),
    center: (<><polygon fill={INK} points="19.5,29.5 28.5,29.5 27.8,34 20.2,34"/><polygon fill="#f7f4ef" points="22.3,30.6 23.5,31.8 22.3,33.0 21.1,31.8"/><polygon fill="#f7f4ef" points="25.7,30.6 26.9,31.8 25.7,33.0 24.5,31.8"/><polygon fill={INK} points="28.1,19.599999999999998 31.5,18.4 31.5,20.0 28.1,20.799999999999997"/><polygon fill={INK} points="16.5,19.599999999999998 19.9,18.4 19.9,20.0 16.5,20.799999999999997"/></>),
  },
  horse: {
    half: (<><path d="M24 12 L27 4 L30.5 11 L33 15 L33.5 22 L31.5 31 L29 39 L24 42 Z"/></>),
    center: (<><polygon fill={INK} points="26.6,19.4 30.4,18.2 30.4,19.8 26.6,20.599999999999998"/><polygon fill={INK} points="17.6,19.4 21.4,18.2 21.4,19.8 17.6,20.599999999999998"/><polygon fill={INK} points="26.3,34.8 27.5,36 26.3,37.2 25.1,36"/><polygon fill={INK} points="21.7,34.8 22.9,36 21.7,37.2 20.5,36"/></>),
  },
  boar: {
    half: (<><path d="M24 9 L28.5 5 L31.5 10.5 L36 14 L37.5 21 L36 29 L31.5 36 L24 38.5 Z"/></>),
    center: (<><polygon fill={INK} points="19.8,28.5 28.2,28.5 27.4,33.5 20.6,33.5"/><polygon fill="#f7f4ef" points="22.2,29.7 23.3,31 22.2,32.3 21.099999999999998,31"/><polygon fill="#f7f4ef" points="25.8,29.7 26.900000000000002,31 25.8,32.3 24.7,31"/><polygon points="18.3,34.2 19.7,28.6 21.2,33.8"/><polygon points="29.7,34.2 28.3,28.6 26.8,33.8"/><polygon fill={INK} points="27.5,19.9 31.299999999999997,18.7 31.299999999999997,20.3 27.5,21.099999999999998"/><polygon fill={INK} points="16.700000000000003,19.9 20.5,18.7 20.5,20.3 16.700000000000003,21.099999999999998"/></>),
  },
  cat: {
    half: (<><path d="M24 11 L27.5 11 L32 4 L34.5 11.5 L37 15 L37.5 22 L35 30 L30 36.5 L24 38.5 Z"/></>),
    center: (<><polygon fill={INK} points="29.3,17.9 30.8,20 29.3,22.1 27.8,20"/><polygon fill={INK} points="18.7,17.9 20.2,20 18.7,22.1 17.2,20"/><polygon fill={INK} points="22.9,28.3 25.1,28.3 24,30.2"/><path d="M29.5 26.5 L36.5 24.8 M29.8 28.8 L36.8 28.8 M18.5 26.5 L11.5 24.8 M18.2 28.8 L11.2 28.8" fill="none" stroke={INK} strokeWidth="0.9" strokeLinecap="round"/></>),
  },
  dog: {
    half: (<><path d="M29.5 9 L36 8 L38.5 14 L37 22 L33 25 L30 20 Z"/><path d="M24 8 L31 9 L34.5 14 L34 27 L30 35 L24 37.5 Z"/></>),
    center: (<><polygon fill={INK} points="19.8,28 28.2,28 27.2,33.2 20.8,33.2"/><polygon points="22,25.6 26,25.6 24,28.4"/><polygon fill={INK} points="26.900000000000002,18.2 30.7,17.0 30.7,18.6 26.900000000000002,19.4"/><polygon fill={INK} points="17.3,18.2 21.099999999999998,17.0 21.099999999999998,18.6 17.3,19.4"/></>),
  },
};
