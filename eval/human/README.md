# Ihmisarviointi – ohjeet Nikolle

**Lyhyesti:** avaa `label.html` selaimessa, merkitse 150 tekstiä (noin 15–20 min), lataa CSV ja laita se tähän kansioon nimellä `niko.csv`.

## Miksi tätä tarvitaan

Benchmarkissa tekoäly saa omilla otsikoillamme 98 %, mutta luku on verrattu vain *Arttun* merkintöihin. Mieliala on usein tulkintakysymys, joten tarvitsemme toisen ihmisen samoista teksteistä. Sen jälkeen voimme sanoa raportissa esimerkiksi: *"kaksi ihmistä oli samaa mieltä X %:ssa teksteistä, ja tekoäly oli yhtä usein samaa mieltä kummankin kanssa"*. Se on paljon vahvempi väite kuin pelkkä prosenttiluku.

Osassa 2 olet käytännössä **neljäs merkitsijä** Helsingin yliopiston FinnSentiment-aineistossa. Siinä jokaisen lauseen on merkinnyt kolme ihmistä, ja voimme verrata sinua heihin ja tekoälyyn.

## Näin teet sen

1. **Älä katso etukäteen** tiedostoa `eval/headlines.json` tai `eval/results/`-kansiota, koska niissä näkyvät vastaukset.
2. Avaa **`eval/human/label.html`** selaimessa (tuplaklikkaa tiedostoa). Nettiä tai asennuksia ei tarvita.
3. Kirjoita nimeksi **niko** ja paina *Aloita*.
4. Valitse jokaiselle tekstille **Negatiivinen / Neutraali / Positiivinen**, joko napeilla tai näppäimillä **1 / 2 / 3**. Valinta vie automaattisesti seuraavaan; **←** palaa edelliseen, jos painoit väärin.
   - **Osa 1:** 50 uutisotsikkoa ja somepostausta (englanti ja suomi)
   - **Osa 2:** 100 suomenkielistä keskustelupalstan lausetta
5. Lopuksi paina **Lataa tulokset (CSV)**. Selain lataa tiedoston `niko.csv`.
6. Siirrä `niko.csv` tähän kansioon (`eval/human/niko.csv`) ja pushaa se, tai lähetä tiedosto Arttulle.

Voit pitää taukoja. Edistyminen tallentuu samaan selaimeen, joten kun avaat sivun uudelleen, *Jatka*-nappi vie siihen, mihin jäit. Jos haluat varmuuskopion kesken kaiken, oikean yläkulman **Lataa CSV** tallentaa tähänastiset merkinnät.

## Merkintäohjeet

Nämä ovat **samat määritelmät, jotka tekoäly saa**, jotta vertailu on reilu:

| Valinta | Milloin |
|---|---|
| **Positiivinen** | hyvä uutinen tai iloinen/hyväksyvä sävy (menestys, saavutus, kasvu, kehu, ilo) |
| **Negatiivinen** | huono uutinen tai tyytymätön/kriittinen sävy (vahinko, konflikti, menetys, syytös, kielto, leikkaus, valitus, suuttumus) |
| **Neutraali** | asiallinen tieto, kysymys, ristiriitainen tai epäselvä |

- Arvioi sitä, mitä teksti **kertoo tai ilmaisee**, älä yksittäisiä sanoja. "Tehdas suljetaan, 300 menettää työnsä" on negatiivinen, vaikka siinä on sana "työ".
- **Mene ensivaikutelman mukaan.** Älä googlaa tekstejä äläkä kysy tekoälyltä, koska sen jälkeen et olisi enää riippumaton ihminen.
- Jos et osaa päättää, valitse **Neutraali**.

## Arttulle: tulosten laskeminen

Kun `niko.csv` on kansiossa:

```bash
npm run eval:data      # jos testijoukkoja ei ole vielä ladattu tälle koneelle
npm run eval -- --dataset headlines,finsen --human eval/human/niko.csv --out eval/results/human-agreement.md
```

Raporttiin tulee kummallekin testijoukolle taulukko **"A second human: niko"**:

- **niko vs reference:** Nikon ja viiteluokkien (Arttun / FinnSentimentin enemmistön) yhtäpitävyys
- **Original annotators vs each other:** FinnSentimentin alkuperäiset merkitsijät keskenään (osa 2)
- **niko vs original annotators:** Niko verrattuna kuhunkin alkuperäiseen merkitsijään (osa 2)
- **\<malli> vs niko:** kunkin tekoälymallin yhtäpitävyys Nikon kanssa

Lisää malleja voi ottaa mukaan `--models`-valinnalla, esim. `--models nvidia/nemotron-3-super-120b-a12b,hf:onnx-community/twitter-xlm-roberta-base-sentiment-ONNX@q8`.

`label.html` tehdään uudelleen komennolla `npm run eval -- --make-template` (tarvitsee FinnSentimentin, eli `npm run eval:data`).

---

*Osa 2 sisältää lauseita FinnSentiment-aineistosta: Lindén, K., Jauhiainen, T., Hardwick, S. (2023). FinnSentiment: a Finnish social media corpus for sentiment polarity annotation. Language Resources and Evaluation. Kielipankki, CC BY 4.0.*
