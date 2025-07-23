import logo from './logo.svg';
import './App.css';
import React, { useEffect } from 'react';
import SQLite from 'react-native-sqlite-storage';

function App() {
  useEffect(() => {
    SQLite.enablePromise(true);

    (async () => {
      // Datenbank öffnen oder erstellen
      const db = await SQLite.openDatabase({ name: 'schwanger.db', location: 'default' });

      // Tabelle mit gewünschten Spaltennamen anlegen
      await db.executeSql(
        `CREATE TABLE IF NOT EXISTS zutaten (
          I_FORTLF_NR INTEGER PRIMARY KEY AUTOINCREMENT,
          C_ZUTAT VARCHAR(100),
          B_VERBOTEN BOOLEAN
        );`
      );

      // Listen der Zutaten
      const verbotene = [
        "rohmilch", "rohmilchkäse", "rohes ei", "eiweiß roh", "mettwurst", "tatar", "carpaccio",
        "salami roh", "leber", "leberwurst", "rohfisch", "sushi", "sashimi", "räucherlachs",
        "hai", "schwertfisch", "heilbutt", "tiefseefisch", "süßholzextrakt", "aloe", "ginseng",
        "mistel", "wermut", "beifuß", "kombucha", "sprossen roh", "benzoesäure", "natriumnitrit",
        "e250", "e210", "e211", "e102", "e110", "e122", "e124", "e129", "alkohol", "ethylalkohol",
        "nicht-pasteurisierter saft"
      ];
      const erlaubt = [
        "salami (durcherhitzt)", "leberwurst (gelegentlich)", "koffein", "guarana", "mate", "lakritz",
        "süßholz", "aspartam", "cyclamat", "acesulfam-k", "energy drink", "weichkäse (aus pasteurisierter milch)",
        "fisch (niedriger quecksilbergehalt)", "schwarzer tee", "grüner tee", "cola", "kakao", "algen", "nori"
      ];

      // Tabelle leeren (optional, damit keine Duplikate entstehen)
      await db.executeSql('DELETE FROM zutaten');

      // Verbotene Zutaten einfügen (B_VERBOTEN = 1)
      for (const zutat of verbotene) {
        await db.executeSql('INSERT INTO zutaten (C_ZUTAT, B_VERBOTEN) VALUES (?, ?)', [zutat, 1]);
      }
      // Erlaubte Zutaten einfügen (B_VERBOTEN = 0)
      for (const zutat of erlaubt) {
        await db.executeSql('INSERT INTO zutaten (C_ZUTAT, B_VERBOTEN) VALUES (?, ?)', [zutat, 0]);
      }

      // Daten abfragen (nur zur Kontrolle, Ausgabe in Konsole)
      const [results] = await db.executeSql('SELECT * FROM zutaten');
      for (let i = 0; i < results.rows.length; i++) {
        console.log(results.rows.item(i));
      }
    })();
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <p>SQLite-Initialisierung läuft (siehe Konsole für Testdaten).</p>
      </header>
    </div>
  );
}

export default App;