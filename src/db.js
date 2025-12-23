import localforage from 'localforage';

const KEY_ZUTATEN = 'zutaten';

export async function saveZutaten(verbotene, erlaubt) {
  const daten = [
    ...verbotene.map((z) => ({ C_ZUTAT: z, B_VERBOTEN: 1 })),
    ...erlaubt.map((z) => ({ C_ZUTAT: z, B_VERBOTEN: 0 })),
  ];
  await localforage.setItem(KEY_ZUTATEN, daten);
  return daten.length;
}

export async function getZutaten() {
  const daten = await localforage.getItem(KEY_ZUTATEN);
  return Array.isArray(daten) ? daten : [];
}

export async function clearZutaten() {
  await localforage.removeItem(KEY_ZUTATEN);
}
