# Roadmap

## Fatto (v0.1)

- Modello dati strutturato e motore di scalatura testato (lineare, sub-lineare, discreto, fisso, q.b., percentuali del panettiere, pivot, fattori fattibili, arrotondamento pratico).
- Lista ricette con ricerca e tag; vista lettura con configuratore (porzioni, resa, pivot).
- Modalità cucina: mise en place con checklist, un passo per schermata, quantità riscalate nel testo, timer con notifica e suono, schermo sempre acceso, frecce da tastiera, diario di fine cottura con voto e note.
- Wizard in quattro fasi (ricetta, ingredienti con regola di scalatura, passaggi con inserimento degli ingredienti al cursore, riepilogo con prova ×2).
- Varianti (duplica ricetta), export/import JSON, PWA offline.
- Timer multipli persistenti (barra sempre visibile, sopravvivono al ricaricamento, tocco per saltare al passaggio).
- Passaggi paralleli (`parallelWith`): "nel frattempo puoi" in modalità cucina, selezione nel wizard.
- Nome e colori dell'app in un unico file (`src/app/branding.ts`).
- Assistente in modalità cucina (domande sul passaggio corrente), costo reale per risposta e totale in impostazioni, conversazioni salvate per ricetta.
- Pubblicazione automatica su GitHub Pages a ogni push su main.
- Seconda revisione con la skill frontend-design: identità da quaderno di cucina (Fraunces, verde oliva, filetti), via i cliché crema/terracotta, maiuscoletto e puntini.
- Revisione dell'interfaccia: token semantici di colore con tema chiaro/scuro (automatico o manuale), icone vettoriali, tipografia e spaziature uniformi, stati di focus visibili, animazioni ridotte se richiesto dal sistema.
- Assistente AI: import da testo, foto e URL con output strutturato validato (zod) e revisione nel wizard; domande in streaming con contesto (ricetta, fattore, diario); varianti complete salvate accanto all'originale. Chiave sul dispositivo o proxy Cloudflare opzionale.

## Prossimi passi

### Uso quotidiano
- Comandi vocali in modalità cucina (push-to-talk: avanti, indietro, ripeti, timer).
- Vista "percentuali del panettiere" per i lievitati.
- Conversione unità (tazze ↔ grammi per ingredienti noti).
- Foto per ricetta e per passaggio.

### AI
- Verifica dal vivo dell'import da URL (usa il tool `web_fetch` lato server): finora provato solo con risposte simulate.
- Comandi vocali per le domande in cucina.

### Infrastruttura
- Sincronizzazione tra dispositivi (opzionale, es. PocketBase o file su cloud).
- Test end-to-end con Playwright.
- Icone PWA raster per iOS.
