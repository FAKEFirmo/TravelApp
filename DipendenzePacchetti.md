# Dipendenze e pacchetti installati

Elenco di tutto quello che è stato installato sul Mac per sviluppare Little Prince: dove si trova, a cosa serve e come rimuoverlo.

**Regola del progetto:** sul Mac installiamo solo lo stretto necessario per sviluppare e provare l'app. Le build finali (macOS, iOS, in futuro Android e Windows) girano sui server di GitHub tramite [GitHub Actions](.github/workflows/build.yml), quindi gli strumenti di build non servono in locale.

_Ultimo aggiornamento: 6 ottobre 2026_

## Installati e ancora necessari

| Cosa | Dove | Spazio | A cosa serve | Come rimuoverlo |
|---|---|---|---|---|
| Rust (rustup, cargo, toolchain stable) | `~/.rustup`, `~/.cargo` | ~1 GB | Compila la parte nativa dell'app (Tauri) | `rustup self uninstall` (rimuove anche le righe aggiunte ai profili della shell) |
| Riga di configurazione di Rust | `~/.zshenv` e `~/.profile`: riga `. "$HOME/.cargo/env"` | – | Mette `cargo` nel PATH | Rimossa automaticamente da `rustup self uninstall`, oppure cancellare la riga a mano |
| Pacchetti npm del progetto | `node_modules/` nella cartella del progetto | ~250 MB | Librerie dell'app (globe.gl, lucide, Tauri CLI, Vite…) | `rm -rf node_modules`; si reinstallano con `npm install` |
| File di build | `src-tauri/target/` nella cartella del progetto | ~2 GB (cresce con le build) | Output della compilazione Rust e app di prova | `rm -rf src-tauri/target`, oppure `cd src-tauri && cargo clean` |
| Simulatore iOS (iOS 27) | Gestito da Xcode | ~8–10 GB | Provare l'app iOS su un iPhone virtuale | Xcode → Settings → Components → iOS 27 → icona ⓘ / Delete. Dispositivi simulati: `xcrun simctl delete unavailable` |

## Già rimossi (servivano solo per compilare iOS in locale)

Ora che la build iOS gira su GitHub, questi pacchetti sono stati disinstallati. Restano elencati qui per trasparenza.

| Cosa | Installato da | Rimosso con |
|---|---|---|
| `xcodegen` (Homebrew) | noi, per generare il progetto Xcode | `brew uninstall xcodegen` |
| `libimobiledevice` + `libimobiledevice-glue`, `libplist`, `libusbmuxd`, `libtatsu`, `libtasn1` (Homebrew) | Tauri, in automatico durante `tauri ios init` | `brew uninstall libimobiledevice && brew autoremove` |
| `ruby` + `libyaml` (Homebrew) | tentativo di installare CocoaPods | `brew autoremove` |
| Target Rust iOS: `aarch64-apple-ios`, `aarch64-apple-ios-sim`, `x86_64-apple-ios` | noi e Tauri | `rustup target remove aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios` |

## Dati dell'app e cache

| Cosa | Dove | Come rimuoverlo |
|---|---|---|
| Dati dell'app (viaggi e foto) | `~/Library/Application Support/com.littleprince.app` | **Attenzione: contiene i tuoi viaggi.** Fai un backup prima di cancellare la cartella |
| Dati WebView e cache dell'app | `~/Library/WebKit/com.littleprince.app`, `~/Library/Caches/com.littleprince.app` | Cancella le cartelle |
| Cache di npx (creazione progetto) | `~/.npm/_npx/7b1d68f041a84c52` (~260 MB, insieme a una cache precedente) | `rm -rf ~/.npm/_npx/7b1d68f041a84c52` |
| Cache dei download di Homebrew | `~/Library/Caches/Homebrew` | `brew cleanup --prune=all` |
| Vecchia app Swift: dati rimasti | `~/Library/Containers/com.enta.Little-Prince` e `…UITests.xctrunner` | macOS li protegge: cancellali dal Finder (⌘⇧G e incolla il percorso) |

## Già presenti prima del progetto (non toccati)

Homebrew, Node.js 22 (via nvm), Xcode, Python 3. Durante l'installazione `openssl@3` è stato aggiornato da 3.6.4 a 3.6.5: lo usano anche altri programmi (python, llama.cpp), quindi va lasciato.

## Rimuovere tutto in un colpo

Dalla cartella del progetto, quando non serve più nulla:

```sh
rustup self uninstall -y
rm -rf node_modules src-tauri/target
rm -rf ~/.npm/_npx/7b1d68f041a84c52
rm -rf ~/Library/WebKit/com.littleprince.app ~/Library/Caches/com.littleprince.app
brew autoremove && brew cleanup --prune=all
# Facoltativo, cancella i viaggi salvati:
# rm -rf "$HOME/Library/Application Support/com.littleprince.app"
```

Il simulatore iOS si rimuove da Xcode (vedi tabella sopra).

## Build nel cloud (niente da installare)

Il file [`.github/workflows/build.yml`](.github/workflows/build.yml) compila su GitHub a ogni push su `main`:

- **macOS:** file `.dmg` (non firmato)
- **iOS:** app per il simulatore (`little-prince-ios-simulator.zip`)
- **Web:** versione installabile da Safari, pubblicata su <https://fakefirmo.github.io/TravelApp/> (GitHub Pages, gratuito)

Per scaricare i risultati: pagina _Actions_ del repository → ultima esecuzione → _Artifacts_, oppure:

```sh
gh run download -R FAKEFirmo/TravelApp
```

Per provare l'app iOS sul simulatore (con il simulatore acceso):

```sh
unzip little-prince-ios-simulator.zip
xcrun simctl install booted "Little Prince.app"
```
