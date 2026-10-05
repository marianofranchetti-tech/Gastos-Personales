import './global.css';
import { SQLiteProvider } from 'expo-sqlite';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { migrateDbIfNeeded } from './src/db/schema';
import { DataProvider } from './src/db/DataProvider';
import { HomeShell } from './src/screens/HomeShell';
import { TemaProvider } from './src/lib/TemaProvider';
import { PeriodoProvider } from './src/lib/PeriodoProvider';
import { AuthProvider } from './src/auth/AuthProvider';
import { Puerta } from './src/auth/Puerta';

export default function App() {
  return (
    <SafeAreaProvider>
      <SQLiteProvider databaseName="gastos.db" onInit={migrateDbIfNeeded}>
        <TemaProvider>
          <AuthProvider>
            <Puerta>
              <DataProvider>
                <PeriodoProvider>
                  <HomeShell />
                </PeriodoProvider>
              </DataProvider>
            </Puerta>
          </AuthProvider>
        </TemaProvider>
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}
