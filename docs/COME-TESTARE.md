# Come testare l'app

## Dove

- **Online**: https://paolobets.github.io/Riccettario/ (si aggiorna a ogni push su `main`, dopo un paio di minuti).
- **Sul telefono come app**: apri l'indirizzo in Safari (iPhone) o Chrome (Android), poi *Condividi → Aggiungi alla schermata Home*. Da lì parte a schermo intero e funziona anche offline.
- **In locale**: `pnpm install && pnpm dev`, poi http://localhost:5173.

Le ricette vivono nel browser del dispositivo: telefono e computer hanno archivi separati. Per passarle da uno all'altro usa *Impostazioni → Esporta / Importa da file*.

## Checklist, in ordine

### 1. Lettura e configuratore (5 minuti, nessuna chiave)
- [ ] Apri "Impasto per pizza". Porta le porzioni da 4 a 6: l'acqua deve seguire la farina al 65 %, il lievito deve crescere meno del fattore.
- [ ] Tocca la quantità della farina, scrivi `300` e conferma: tutta la ricetta si riproporziona (fattore ×0,6).
- [ ] Apri "Spaghetti alla carbonara", porta a 3 porzioni: i tuorli diventano 5 con avviso arancione (lineare sarebbe 4,5). Compare il suggerimento dei fattori "fattibili".
- [ ] Ripristina (bottone accanto al fattore).

### 2. Modalità cucina
- [ ] Dalla carbonara, "Cucina passo per passo". Spunta gli ingredienti nella mise en place, poi "Inizia".
- [ ] Al passo 1 compare "Nel frattempo puoi" con i passi 2 e 3: toccane uno, poi usa il rimando per tornare al passo 1.
- [ ] Al passo 4 avvia il timer "Pasta". Torna indietro: il timer resta nella barra in alto. Chiudi la scheda e riaprila: il timer c'è ancora.
- [ ] Arriva in fondo, dai un voto e una nota, salva: compaiono nel "Diario di cottura" della ricetta.

### 3. Wizard
- [ ] "+ Nuova": inserisci titolo e porzioni, due ingredienti (uno "a pezzi interi"), un passaggio inserendo gli ingredienti con i bottoni sotto al testo.
- [ ] Nel riepilogo controlla la "Prova di scalatura ×2", poi salva.

### 4. Assistente AI (serve la chiave)
- [ ] *Impostazioni → Assistente AI*: incolla la chiave Anthropic, scegli il modello, salva.
- [ ] *✨ Importa → Testo*: incolla una ricetta qualsiasi (anche presa da un sito). Controlla nel riepilogo ingredienti, regole di scalatura e passaggi, poi salva. Sotto il banner c'è il costo della richiesta.
- [ ] *✨ Importa → Foto*: fotografa una pagina di un libro di ricette.
- [ ] *✨ Importa → Indirizzo web*: incolla l'URL di una ricetta. Questo è il percorso meno collaudato: se fallisce, segnalalo con l'URL usato.
- [ ] In una ricetta apri l'assistente e fai una domanda rapida. Ricarica la pagina: la conversazione è ancora lì.
- [ ] In modalità cucina, "✨ Chiedi" su un passaggio.
- [ ] Scheda "Variante": scrivi un'istruzione, crea la variante, controlla che si apra come nuova ricetta.
- [ ] *Impostazioni*: la "Spesa stimata finora" riporta le richieste fatte.

## Cosa segnalare

Per ogni problema: cosa stavi facendo, cosa ti aspettavi, cosa è successo, su quale dispositivo e browser. Per l'AI aggiungi anche il testo o l'URL usato. Gli errori dell'assistente compaiono in rosso sotto il pannello con un messaggio leggibile.
