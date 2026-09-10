import { defineConfig } from 'vitest/config';

// Solo lógica pura y acceso a datos: nada que necesite el runtime de React Native.
// Los tests de base de datos usan node:sqlite a través del adaptador en
// src/test/dbFake.ts, así que corren contra SQLite de verdad sin levantar Expo.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Cada archivo crea su propia base en memoria y no comparte estado global,
    // así que reusar workers es seguro y evita ~1s de arranque por archivo.
    isolate: false,
  },
});
