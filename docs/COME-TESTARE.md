# Come testare l'app

## Dove

- **Online**: https://ricettario.pages.dev (Cloudflare Pages, con l'assistente già collegato: si entra con il link d'invito ricevuto, poi con email e password). Lo specchio su GitHub Pages, https://paolobets.github.io/Riccettario/, richiede invece una chiave Anthropic propria. Entrambi si aggiornano a ogni push su `main`.
- **Sul telefono come app**: apri l'indirizzo in Safari (iPhone) o Chrome (Android), poi *Condividi → Aggiungi alla schermata Home*. Da lì parte a schermo intero e funziona anche offline.
- **In locale**: `pnpm install && pnpm dev`, poi http://localhost:5173.

Su pages.dev le ricette si sincronizzano tra i dispositivi in cui fai l'accesso. Sullo specchio GitHub Pages vivono solo nel browser: per passarle usa *Impostazioni → Esporta / Importa da file*.

## Checklist, in ordine

### 1. Lettura e configuratore (5 minuti, nessuna chiave)
- [ ] Apri "Impasto per pizza". Porta le porzioni da 4 a 6: l'acqua deve seguire la farina al 65 %, il lievito deve crescere meno del fattore.
- [ ] Tocca la quantità della farina, scrivi `300` e conferma: tutta la ricetta si riproporziona (fattore ×0,6).
- [ ] Apri "Spaghetti alla carbonara", porta a 3 porzioni: i tuorli diventano 5 con avviso arancione (lineare sarebbe 4,5). Compare il suggerimento dei fattori "fattibili".
- [ ] Ripristina (bottone accanto al fattore).
- [ ] In fondo alla ricetta, "Aggiungi una nota": scrivi due righe e salva. Restano anche dopo aver ricaricato.
- [ ] Elimina una ricetta duplicata: la finestra di conferma ha "Tieni" ed "Elimina ricetta", Escape la chiude.

### 2. Modalità cucina
- [ ] Dalla carbonara, "Cucina passo per passo". Spunta gli ingredienti nella mise en place, poi "Inizia".
- [ ] Al passo 1 compare "Nel frattempo puoi" con i passi 2 e 3: toccane uno, poi usa il rimando per tornare al passo 1.
- [ ] Al passo 4 avvia il timer "Pasta". Torna indietro: il timer resta nella barra in alto. Chiudi la scheda e riaprila: il timer c'è ancora.
- [ ] Ricarica la pagina a metà cottura: si riparte dallo stesso passo (è nell'indirizzo, `?passo=`). Tocca "Passo N di M" per saltare a un altro passo.
- [ ] "Esci" chiede conferma; "Resta in cucina" non perde nulla.
- [ ] Arriva in fondo, dai un voto e una nota, salva: compaiono nel "Diario di cottura" della ricetta. Una cottura abbandonata con "Esci" non compare.

### 2a. Accesso (su pages.dev)
- [ ] Apri il link d'invito: la pagina dice "Invito valido per la tua email". Prova una password di 5 caratteri: viene rifiutata con la spiegazione. Scegline una lunga e crea l'account: la lista non mostra più l'avviso "Accedi per usare l'assistente".
- [ ] *Impostazioni → Account*: c'è la tua email, "Il tuo mese", e in "Dispositivi collegati" questo dispositivo.
- [ ] Da un altro browser o dal computer, *Accedi* con email e password sbagliata: "Email o password non corretti". Con quella giusta entri; in "Dispositivi collegati" ora sono due. Scollega il primo: su quello, alla prossima apertura, torna l'avviso di accesso.
- [ ] "Cambia password" con la vecchia sbagliata viene rifiutato; con quella giusta va a buon fine e gli altri dispositivi vengono scollegati.
- [ ] "Password dimenticata" dalla pagina di accesso: se le email non sono configurate lo dice; chiedi il link di reset a chi gestisce, aprilo, scegli la nuova password: sei dentro.
- [ ] "Esci": le ricette restano sul telefono, l'assistente chiede di accedere.

### 2b. Sincronizzazione (su pages.dev, dopo l'accesso)
- [ ] In *Impostazioni* la sezione "Sincronizzazione" mostra l'ultima ora e il numero di ricette sul server.
- [ ] Scrivi una nota su una ricetta; dopo qualche secondo "Sincronizza ora" riporta "1 inviata". Da un secondo dispositivo o da un altro browser, accedi con lo stesso account: le ricette e la nota compaiono.
- [ ] Cancella una ricetta su un dispositivo: sull'altro sparisce alla prossima apertura.

### 2c. Lista della spesa, teglia, preferiti (nessuna chiave)
- [ ] Apri il Tiramisù: sotto il titolo c'è "teglia rettangolare 30×20 cm". In **Dosi → Teglia** scegli tonda, 24 cm, Applica: il fattore diventa ×0,75 (rapporto tra le aree) e le uova passano a 3.
- [ ] Tocca la stella accanto al titolo: in lista compare il filtro "preferite".
- [ ] "Aggiungi alla spesa" dal Tiramisù e dalla pizza con 8 porzioni; apri il carrello in alto: gli ingredienti sono sommati (la farina è 1 kg), spunta qualcosa, ricarica: le spunte restano. "Copia" mette la lista negli appunti.
- [ ] In lista cambia "Ordina" in "Dalla A alla Z" e poi "Più cucinate": dopo una cottura conclusa la ricetta mostra "Cucinata una volta, il …".

### 2d. Pronto per le 20:00 e Riprendi
- [ ] Dalla pizza, "Cucina passo per passo": nella scheda **Pronto per le** scegli un orario tra qualche ora. Compare "Inizia alle …" con il totale; "Mostra gli orari dei passaggi" elenca ogni passo con la sua ora (i paralleli hanno la stessa ora del passo padre). Se l'orario è troppo vicino, l'avviso dice di quanto sei in ritardo.
- [ ] Inizia, vai al passo 3, "Esci": la ricetta ora ha "Riprendi dal passo 3" e "Ricomincia". Chiudi e riapri l'app: c'è ancora. Dopo "Salva e chiudi" a fine cottura sparisce.

### 2e. Condividi e stampa
- [ ] In una ricetta con porzioni cambiate, "Condividi": sul telefono si apre il foglio di condivisione con il testo (dosi già riscalate) e un link; sul computer finisce negli appunti. Apri il link in un altro browser: la pagina "Ricetta condivisa con te" la salva come copia.
- [ ] "Stampa" (o Ctrl+P): nell'anteprima ci sono solo titolo, ingredienti, passaggi e note, senza bottoni né barra.

### 3. Cosa preparo? (nessuna chiave)
- [ ] Dalla lista, "Cosa preparo oggi?". Scegli "45 minuti" e scrivi "uova, pecorino": la proposta è la carbonara con "Hai già pecorino". "Un'altra" scorre le alternative.
- [ ] Scegli "20 minuti": nessuna ricetta sta nel tempo; "Togli il limite di tempo" e "Fatti scrivere una ricetta" (porta a Importa → Piatto).

### 4. Wizard
- [ ] "+ Nuova": inserisci titolo e porzioni, due ingredienti (uno "a pezzi interi"), un passaggio inserendo gli ingredienti con i bottoni sotto al testo.
- [ ] Metti un ingrediente "uova" con regola lineare e un passaggio di riposo da 30 minuti senza timer: nel riepilogo il **Controllo della ricetta** li segnala (si può salvare lo stesso). Controlla anche la "Prova di scalatura ×2", poi salva.

### 5. Assistente AI (serve la chiave)
- [ ] Su pages.dev basta aver fatto l'accesso: in *Impostazioni → Account* c'è "Il tuo mese: … su 3,00 $". Su GitHub Pages incolla la chiave Anthropic in *Impostazioni → Assistente AI*, scegli il modello, salva.
- [ ] *Importa → Testo*: incolla una ricetta qualsiasi (anche presa da un sito). Controlla nel riepilogo ingredienti, regole di scalatura e passaggi, poi salva. Sotto il banner c'è il costo della richiesta.
- [ ] *Importa → Foto*: fotografa una pagina di un libro di ricette.
- [ ] *Importa → Sito*: incolla l'URL di una ricetta (Giallozafferano, Cucchiaio d'argento, un blog). Con il proxy configurato lo stato dice «Trovata "…", la strutturo»: la pagina è stata letta dai dati strutturati, costo di pochi centesimi. Senza proxy, o se la pagina non li espone, lo stato dice che la fa leggere all'AI. Se fallisce, segnalalo con l'URL usato.
- [ ] Fai due domande di seguito sulla stessa ricetta: la seconda costa visibilmente meno della prima (cache del contesto).
- [ ] *Importa → Piatto*: scrivi "vitello tonnato per 6" e "Scrivi la ricetta": nel riepilogo controlla dosi, regole e passaggi; la fonte dice che l'ha scritta l'assistente.
- [ ] *Cosa preparo?* → "Chiedi all'AI": propone una tua ricetta con il perché, oppure un piatto nuovo con "Scrivi la ricetta" che apre Importa già compilato.
- [ ] In una ricetta apri l'assistente e fai una domanda rapida. Ricarica la pagina: la conversazione è ancora lì.
- [ ] In modalità cucina, "Chiedi" su un passaggio: con "Risposte veloci in cucina" attivo la risposta arriva da Haiku e costa meno di un centesimo.
- [ ] Scheda "Variante": scrivi un'istruzione, crea la variante, controlla che si apra come nuova ricetta.
- [ ] *Impostazioni*: la "Spesa stimata finora" riporta le richieste fatte.

## Cosa segnalare

Per ogni problema: cosa stavi facendo, cosa ti aspettavi, cosa è successo, su quale dispositivo e browser. Per l'AI aggiungi anche il testo o l'URL usato. Gli errori dell'assistente compaiono in rosso sotto il pannello con un messaggio leggibile.
