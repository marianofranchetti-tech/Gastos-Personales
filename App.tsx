import './global.css';
import { SQLiteProvider } from 'expo-sqlite';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { migrateDbIfNeeded } from './src/db/schema';
import { DataProvider } from './src/db/DataProvider';
import { HomeShell } from './src/screens/HomeShell';

export default function App() {
  return (
    <SafeAreaProvider>
      <SQLiteProvider databaseName="gastos.db" onInit={migrateDbIfNeeded}>
        <DataProvider>
          <HomeShell />
        </DataProvider>
      </SQLiteProvider>
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}
