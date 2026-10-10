# Roadmap

## Fatto (v0.1)

- Modello dati strutturato e motore di scalatura testato (lineare, sub-lineare, discreto, fisso, q.b., percentuali del panettiere, pivot, fattori fattibili, arrotondamento pratico).
- Lista ricette con ricerca e tag; vista lettura con configuratore (porzioni, resa, pivot).
- Modalità cucina: mise en place con checklist, un passo per schermata, quantità riscalate nel testo, timer con notifica e suono, schermo sempre acceso, frecce da tastiera, diario di fine cottura con voto e note.
- Wizard in quattro fasi (ricetta, ingredienti con regola di scalatura, passaggi con inserimento degli ingredienti al cursore, riepilogo con prova ×2).
- Varianti (duplica ricetta), export/import JSON, PWA offline.

## Prossimi passi

### Uso quotidiano
- Timer multipli persistenti tra i passaggi (barra timer sempre visibile).
- Passaggi paralleli (`parallelWith`): "mentre riposa, prepara il sugo".
- Comandi vocali in modalità cucina (push-to-talk: avanti, indietro, ripeti, timer).
- Vista "percentuali del panettiere" per i lievitati.
- Conversione unità (tazze ↔ grammi per ingredienti noti).
- Foto per ricetta e per passaggio.

### AI (richiede un piccolo backend per non esporre la chiave)
1. **Import**: da testo incollato, URL o foto → ricetta strutturata con regole di scalatura proposte, da confermare nel wizard.
2. **Valutazione varianti**: "sostituisco il burro con olio", "triplico la dose: i tempi reggono?" ragionando sulla struttura.
3. **Evoluzione**: dalle sessioni di cottura (voti, note) proporre modifiche e creare una variante versionata.
4. **Assistente in cottura**: domande al volo sul passaggio corrente.

### Infrastruttura
- Sincronizzazione tra dispositivi (opzionale, es. PocketBase o file su cloud).
- Test end-to-end con Playwright.
- Icone PWA raster per iOS.
