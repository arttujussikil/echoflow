# Sentiment benchmark — 2026-10-09

Models label each text as pos / neu / neg with the app's own prompt (`buildLabelPrompt`), 40 texts per request. Accuracy counts unlabelled items as wrong. The 95% interval is a bootstrap over the items: when two intervals overlap a lot, the difference may be noise. Macro-F1 averages F1 over the three labels, so a model can't score well by over-using one label.

## EchoFlow headlines (our labels)

Hand-labelled posts for the sentiment benchmark. Mostly real headlines/posts collected by EchoFlow in October 2026 (searches: Finland, football, AI), plus a few written to cover Finnish and clear-cut cases. 'accept' lists every label we consider correct; ambiguous posts accept more than one.

Source: eval/headlines.json · Licence: MIT (this repo)

50 items (pos 13, neu 19, neg 18).

| Method | Prompt | Accuracy | 95% interval | Macro-F1 | Labelled | Time |
|---|---|---|---|---|---|---|
| Keyword list (no AI) | — | **64%** | 50%–76% | 0.55 | 100% | — |
| nvidia/nemotron-3-super-120b-a12b | numbered | **98%** | 94%–100% | 0.98 | 100% | 11 s |
| nvidia/nemotron-3-ultra-550b-a55b | numbered | **98%** | 94%–100% | 0.98 | 100% | 89 s |
| gemini-3.5-flash | numbered | **98%** | 94%–100% | 0.98 | 100% | 9 s |
| gemini-3.8-flash | numbered | failed | — | — | 0% | — |

<details><summary>Confusion matrices and mistakes</summary>


#### Keyword list (no AI)

| gold \ predicted | pos | neu | neg | none |
|---|---|---|---|---|
| **pos** | 2 | 8 | 0 | 0 |
| **neu** | 1 | 21 | 1 | 0 |
| **neg** | 2 | 6 | 9 | 0 |

18 mistakes (first 15):

- neu (want neg): TCU Fans Have Plenty of Company in College Football's Slow Start Club - Sports Illustrated
- neu (want pos): Sesterce plans a €10B AI campus in Jämsä
- pos (want neu/neg): JetBrains reports revenue growth, net financial loss for 2025
- neu (want pos): No ai. Just perfect
- neu (want neg): No AI for kids. Full stop.
- neu (want neg): Sign me up for the Official Trump Administration Enemies List. It's AI.
- neu (want pos): I sometimes get Hedgehog visitors around my apartment building. #WeeWildlifeWednesday
- pos (want neg): Nvidia, Oracle, CoreWeave and other AI stocks sink on OpenAI revenue report - CNBC
- neu (want neg): High school football players threaten to sexually assault female student in group chat
- neg (want neu): Helsinki will not ban face coverings in schools, but tightens guidelines
- pos (want neg): The UAE is threatening to pull billions of pounds of investment out of the UK
- neu (want pos): Spooky Shrooms for #FungiFriday 😁
- neu (want pos): Helsinki opens new free public library in Kalasatama
- neu (want neg): Työttömyys kasvoi syyskuussa selvästi
- neu (want pos): Hallitus ja ammattiliitot pääsivät sopimukseen palkoista

#### nvidia/nemotron-3-super-120b-a12b (numbered prompt)

| gold \ predicted | pos | neu | neg | none |
|---|---|---|---|---|
| **pos** | 10 | 0 | 0 | 0 |
| **neu** | 0 | 22 | 0 | 0 |
| **neg** | 0 | 1 | 17 | 0 |

1 mistakes:

- neu (want neg): TCU Fans Have Plenty of Company in College Football's Slow Start Club - Sports Illustrated

#### nvidia/nemotron-3-ultra-550b-a55b (numbered prompt)

| gold \ predicted | pos | neu | neg | none |
|---|---|---|---|---|
| **pos** | 12 | 0 | 0 | 0 |
| **neu** | 0 | 20 | 0 | 0 |
| **neg** | 0 | 1 | 17 | 0 |

1 mistakes:

- neu (want neg): TCU Fans Have Plenty of Company in College Football's Slow Start Club - Sports Illustrated

#### gemini-3.5-flash (numbered prompt)

| gold \ predicted | pos | neu | neg | none |
|---|---|---|---|---|
| **pos** | 12 | 0 | 0 | 0 |
| **neu** | 0 | 18 | 1 | 0 |
| **neg** | 0 | 0 | 19 | 0 |

1 mistakes:

- neg (want neu/pos): Day five in Finland travel & still finding dog hair

</details>

---

## Financial PhraseBank

Sentences from English financial news, labelled from an investor's point of view by 16 annotators. Sampled evenly from four annotator-agreement bands (75 each) to show how accuracy drops as humans disagree more.

Source: https://huggingface.co/datasets/takala/financial_phrasebank (Aalto University) · Licence: CC BY-NC-SA 3.0

*Malo, P., Sinha, A., Korhonen, P., Wallenius, J., Takala, P. (2014). Good debt or bad debt: Detecting semantic orientations in economic texts. JASIST 65(4).*

300 items (pos 85, neu 171, neg 44).

| Method | Prompt | Accuracy | 95% interval | Macro-F1 | Labelled | Time |
|---|---|---|---|---|---|---|
| Keyword list (no AI) | — | **63%** | 56%–67% | 0.49 | 100% | — |
| nvidia/nemotron-3-super-120b-a12b | numbered | **77%** | 74%–82% | 0.78 | 100% | 61 s |
| nvidia/nemotron-3-ultra-550b-a55b | numbered | **78%** | 73%–82% | 0.79 | 100% | 198 s |
| gemini-3.5-flash | numbered | **74%** | 70%–79% | 0.77 | 100% | 67 s |
| gemini-3.8-flash | numbered | failed | — | — | 0% | — |

**Accuracy by subgroup**

| Method | 100% agree (n=75) | 50–65% agree (n=75) | 66–74% agree (n=75) | 75–99% agree (n=75) |
|---|---|---|---|---|
| Keyword list (no AI) | 71% | 52% | 61% | 67% |
| nvidia/nemotron-3-super-120b-a12b | 97% | 59% | 71% | 83% |
| nvidia/nemotron-3-ultra-550b-a55b | 99% | 61% | 72% | 79% |
| gemini-3.5-flash | 96% | 59% | 63% | 80% |

<details><summary>Confusion matrices and mistakes</summary>


#### Keyword list (no AI)

| gold \ predicted | pos | neu | neg | none |
|---|---|---|---|---|
| **pos** | 40 | 45 | 0 | 0 |
| **neu** | 29 | 142 | 0 | 0 |
| **neg** | 9 | 29 | 6 | 0 |

112 mistakes (first 15):

- pos (want neu) [100% agree]: The total investment necessary will be EUR40m, the company estimated.
- neu (want neg) [100% agree]: Vaisala 's net profit for the third quarter of 2007 dropped to 3.0 mln euro ($ 4.3 mln) from 6.8 mln euro ($ 9
- neu (want pos) [50–65% agree]: More than 200 volunteers from Fiskars, the garden tool company, Home Depot (NYSE: HD), the city of Baltimore a
- neu (want neg) [75–99% agree]: EMSA Deputy Chairman of the Board Juri Lember told BNS on Wednesday that this was the first time he heard abou
- neu (want pos) [66–74% agree]: Satama earned Data Management Solutions competency with Business Intelligence specialization recentlyvia the a
- neu (want pos) [75–99% agree]: It is now the leading private road ambulance service company in Finland.
- neu (want pos) [75–99% agree]: In addition to fireplace exports, demand for lining stone has exceeded the level of the earlier part of the ye
- neu (want pos) [50–65% agree]: Our strong company brands - ESL Shipping, Leipurin, Telko and Kaukomarkkinat - aim to be the market leaders in
- pos (want neu) [50–65% agree]: `` This agreement is a direct result of LCC 's strategy and plan that was announced earlier this year, '' said
- neu (want pos) [100% agree]: In the reporting period, net sales rose by 8% year-on-year to EUR64.3 m, due to the business acquisitions real
- neu (want neg) [100% agree]: Finnish electronics contract manufacturer Scanfil reports net sales of EUR 241.2 mn in 2006, down from EUR 321
- neu (want pos) [100% agree]: Finnish Metso Paper has been awarded a contract for the rebuild of Sabah Forest Industries ' (SFI) pulp mill i
- pos (want neu) [100% agree]: The phones are targeted at first time users in growth markets.
- neu (want pos) [50–65% agree]: The long-term contract is global.
- neu (want neg) [75–99% agree]: Rivals say Qualcomm has fewer patents on 3G phones than on earlier versions and should lower its rates.

#### nvidia/nemotron-3-super-120b-a12b (numbered prompt)

| gold \ predicted | pos | neu | neg | none |
|---|---|---|---|---|
| **pos** | 57 | 28 | 0 | 0 |
| **neu** | 29 | 136 | 6 | 0 |
| **neg** | 0 | 5 | 39 | 0 |

68 mistakes (first 15):

- pos (want neu) [75–99% agree]: These six agreements are the company 's first customer acquisitions in India since taking over TVS Electronics
- pos (want neu) [75–99% agree]: hu will offer a further discount of between 25% and 50% on selected books.
- neu (want neg) [75–99% agree]: EMSA Deputy Chairman of the Board Juri Lember told BNS on Wednesday that this was the first time he heard abou
- neu (want pos) [50–65% agree]: Our strong company brands - ESL Shipping, Leipurin, Telko and Kaukomarkkinat - aim to be the market leaders in
- neu (want pos) [66–74% agree]: The subscriptions increase Cargotec 's share capital by 36,780 euros.
- pos (want neu) [50–65% agree]: `` This agreement is a direct result of LCC 's strategy and plan that was announced earlier this year, '' said
- pos (want neu) [50–65% agree]: `` We have become convinced that we can do that very quickly, '' he told Finnish business reporters.
- pos (want neu) [66–74% agree]: `` Ruukki is now included on DJSI World for the second year running and the European DJSI STOXX for the third 
- neu (want pos) [50–65% agree]: The long-term contract is global.
- neu (want pos) [66–74% agree]: Mr Kivimeister said John Deer former Timberjack stands to win in the situation: it controls around 60% of Esto
- pos (want neu) [50–65% agree]: Mr. Jorma Valkama, Managing Director of Suomen Paikallissanomat Oy, states that Rannikkoseutu complements in a
- neu (want pos) [66–74% agree]: KAUKO-TELKO LTD PRESS RELEASE 19.06.2007 AT 14.00 1 (1) Telko Group (Kauko-Telko) is expanding its strategic p
- neu (want pos) [75–99% agree]: Finnish Larox has signed a contract with the Talvivaara Project for the delivery of filters to the Talvivaara 
- pos (want neu) [66–74% agree]: The company said production volumes so far indicate the circuit is capable of the targeted output rate of 60,0
- pos (want neu) [75–99% agree]: Nokia OYJ 's production site at Bochum, Germany, posted profit before interest of 134 mln eur for 2007, Capita

#### nvidia/nemotron-3-ultra-550b-a55b (numbered prompt)

| gold \ predicted | pos | neu | neg | none |
|---|---|---|---|---|
| **pos** | 61 | 24 | 0 | 0 |
| **neu** | 35 | 129 | 7 | 0 |
| **neg** | 0 | 1 | 43 | 0 |

67 mistakes (first 15):

- pos (want neu) [75–99% agree]: These six agreements are the company 's first customer acquisitions in India since taking over TVS Electronics
- pos (want neu) [75–99% agree]: hu will offer a further discount of between 25% and 50% on selected books.
- neu (want pos) [66–74% agree]: The subscriptions increase Cargotec 's share capital by 36,780 euros.
- pos (want neu) [50–65% agree]: `` This agreement is a direct result of LCC 's strategy and plan that was announced earlier this year, '' said
- pos (want neu) [50–65% agree]: `` We have become convinced that we can do that very quickly, '' he told Finnish business reporters.
- pos (want neu) [66–74% agree]: `` Ruukki is now included on DJSI World for the second year running and the European DJSI STOXX for the third 
- neu (want pos) [50–65% agree]: The long-term contract is global.
- neu (want pos) [66–74% agree]: Mr Kivimeister said John Deer former Timberjack stands to win in the situation: it controls around 60% of Esto
- pos (want neu) [75–99% agree]: The Innova 2 building will be located close to downtown, in the immediate vicinity of Paviljonki and the trave
- pos (want neu) [50–65% agree]: Mr. Jorma Valkama, Managing Director of Suomen Paikallissanomat Oy, states that Rannikkoseutu complements in a
- neu (want pos) [75–99% agree]: Finnish Larox has signed a contract with the Talvivaara Project for the delivery of filters to the Talvivaara 
- pos (want neu) [66–74% agree]: The company said production volumes so far indicate the circuit is capable of the targeted output rate of 60,0
- pos (want neu) [75–99% agree]: Nokia OYJ 's production site at Bochum, Germany, posted profit before interest of 134 mln eur for 2007, Capita
- pos (want neu) [66–74% agree]: Today, we are connecting people in new and different ways - fusing advanced mobile technology with personalize
- pos (want neu) [50–65% agree]: Ponsse plans to create a network that is based on strong partnership, and participates in the production of la

#### gemini-3.5-flash (numbered prompt)

| gold \ predicted | pos | neu | neg | none |
|---|---|---|---|---|
| **pos** | 68 | 17 | 0 | 0 |
| **neu** | 51 | 114 | 6 | 0 |
| **neg** | 1 | 2 | 41 | 0 |

77 mistakes (first 15):

- pos (want neu) [75–99% agree]: These six agreements are the company 's first customer acquisitions in India since taking over TVS Electronics
- pos (want neu) [75–99% agree]: hu will offer a further discount of between 25% and 50% on selected books.
- neu (want neg) [75–99% agree]: EMSA Deputy Chairman of the Board Juri Lember told BNS on Wednesday that this was the first time he heard abou
- neu (want pos) [66–74% agree]: The subscriptions increase Cargotec 's share capital by 36,780 euros.
- pos (want neu) [50–65% agree]: `` This agreement is a direct result of LCC 's strategy and plan that was announced earlier this year, '' said
- pos (want neu) [50–65% agree]: `` We have become convinced that we can do that very quickly, '' he told Finnish business reporters.
- pos (want neu) [66–74% agree]: `` Ruukki is now included on DJSI World for the second year running and the European DJSI STOXX for the third 
- pos (want neu) [66–74% agree]: Community gardening has become a popular activity, especially to raise vegetables.
- neu (want pos) [50–65% agree]: The long-term contract is global.
- pos (want neu) [50–65% agree]: Mr. Jorma Valkama, Managing Director of Suomen Paikallissanomat Oy, states that Rannikkoseutu complements in a
- pos (want neu) [66–74% agree]: The company said production volumes so far indicate the circuit is capable of the targeted output rate of 60,0
- pos (want neu) [75–99% agree]: Nokia OYJ 's production site at Bochum, Germany, posted profit before interest of 134 mln eur for 2007, Capita
- pos (want neu) [66–74% agree]: Today, we are connecting people in new and different ways - fusing advanced mobile technology with personalize
- pos (want neu) [50–65% agree]: Ponsse plans to create a network that is based on strong partnership, and participates in the production of la
- pos (want neu) [66–74% agree]: Currently more than 100 of Global Fortune 500 companies are using SSH security solutions.

</details>

---

## TweetEval (sentiment)

English tweets from the SemEval-2017 Task 4 test set. 100 per label, sampled from 3,000 tweets spread across the test split.

Source: https://huggingface.co/datasets/cardiffnlp/tweet_eval · Licence: Research use (SemEval-2017; tweet texts are not redistributed here)

*Barbieri, F., Camacho-Collados, J., Espinosa-Anke, L., Neves, L. (2020). TweetEval: Unified Benchmark and Comparative Evaluation for Tweet Classification. Findings of EMNLP.*

300 items (pos 100, neu 100, neg 100).

| Method | Prompt | Accuracy | 95% interval | Macro-F1 | Labelled | Time |
|---|---|---|---|---|---|---|
| Keyword list (no AI) | — | **42%** | 37%–47% | 0.38 | 100% | — |
| nvidia/nemotron-3-super-120b-a12b | numbered | **68%** | 63%–74% | 0.68 | 100% | 70 s |
| nvidia/nemotron-3-ultra-550b-a55b | numbered | **51%** | 45%–56% | 0.59 | 73% | 469 s |
| gemini-3.5-flash | numbered | **49%** | 44%–55% | 0.58 | 67% | 202 s |
| gemini-3.8-flash | numbered | failed | — | — | 0% | — |

<details><summary>Confusion matrices and mistakes</summary>


#### Keyword list (no AI)

| gold \ predicted | pos | neu | neg | none |
|---|---|---|---|---|
| **pos** | 20 | 76 | 4 | 0 |
| **neu** | 7 | 82 | 11 | 0 |
| **neg** | 4 | 73 | 23 | 0 |

175 mistakes (first 15):

- neu (want pos): Watching Chanel taunt desperate masses on Black Friday is the funniest thing in life #ScreamQueens
- neu (want neg): @user yeah true. Leftists are actually willing to stab nazi scum like you
- neu (want neg): #POTUSTrump voters are very comfortable with #TrumpTransitionTeam process because the drama reads a lot like #
- neu (want neg): .@chrislhayes @user Pizzagate was the difference in the election. Comey letter, tied to Weiner, led to 10 days
- neu (want neg): Steve Bannon is a misogynistic, white supremacist homophobe--and he's Trump's new top advisor. Take action:
- neu (want pos): Obama calls for unity in Thanksgiving message #Trump2016 #TrumpTrain #GOP #ccot #tcot #ThanksTrump #UniteBlue
- neu (want pos): #MIDNIGHT #MUSICHappy Birthday!Little Richard, GOOD GOLLY MISS MOLLY (Muhammad Ali's 50th Birthday)
- neu (want pos): Robots helped inspire deep learning might become -
- neu (want pos): Leonard Cohen could rock a waltz.
- neu (want pos): thanksgiving is over, it's time to pick out a christmas tree 🎄they are on sale today & tomorrow…
- neu (want neg): @user Lies. Ignore all the UNIONISTS and other leftists pushing pedophilia as a non-crime. #evil
- neu (want neg): Wikileaks: Clinton Foundation Inside Information Raises Questions About Bill Clinton | TIME
- neu (want neg): @user @user the media tried their best at a Nazi tactic, repeat a lie over and over and people will believe it
- neu (want pos): I think I may be finally in with the in crowd #mannequinchallenge #grads2014 @user
- neu (want neg): @user @user And worse has been done by US drone strikes.

#### nvidia/nemotron-3-super-120b-a12b (numbered prompt)

| gold \ predicted | pos | neu | neg | none |
|---|---|---|---|---|
| **pos** | 67 | 28 | 5 | 0 |
| **neu** | 14 | 62 | 24 | 0 |
| **neg** | 5 | 20 | 75 | 0 |

96 mistakes (first 15):

- pos (want neg): #POTUSTrump voters are very comfortable with #TrumpTransitionTeam process because the drama reads a lot like #
- pos (want neu): Dance Teacher Realness with my 10th grade girls #mannequinchallenge
- neu (want pos): Robots helped inspire deep learning might become -
- neu (want pos): thanksgiving is over, it's time to pick out a christmas tree 🎄they are on sale today & tomorrow…
- pos (want neu): interesting how the US will now see Latin America. The ice cream is really good and so is the health system. G
- pos (want neu): DJ&PK are giving away free @user tickets at Big O Tires 12600 South 4689 West until 10am. Get 2 tix while they
- neu (want neg): Remember, it always comes in three's ... Florence Henderson, Fidel Castro and the next will be .......Cross yo
- neu (want neg): @user @user & why does this matter? Clinton... hmm do you mean the guy who built the wall on the S.W. Mexican 
- pos (want neu): Still digesting #Westworld - will have to rewatch!
- neu (want neg): @user any updates on that income tax audit or was that all a lie? #BlackFriday #StillWithHer #Thanksgiving #Au
- pos (want neu): New Look At Luke Evans and Emma Watson As Gaston and Belle In #BeautyAndTheBeast
- neu (want neg): #FFRNN #CLASSROOM GUEST LECTURER Neil Cavuto; Apple vs. Government (A Company that Cares vs #Obamacare) #unite
- neu (want neg): Obamacare if you have called Marco Rubio a puppet Jeb Bush who s going over and complimented me.
- neg (want pos): @user Wow...this is one deadly statement! Reminding me of the Greta Muhammad Ali.
- neg (want neu): @user @user @user Pls help Hillary ask for a recount in Mi, Wi and Pa!

#### nvidia/nemotron-3-ultra-550b-a55b (numbered prompt)

| gold \ predicted | pos | neu | neg | none |
|---|---|---|---|---|
| **pos** | 56 | 20 | 3 | 21 |
| **neu** | 10 | 44 | 19 | 27 |
| **neg** | 3 | 13 | 52 | 32 |

148 mistakes (first 15):

- none (want neg): An image of a dead animals body part is not the best #marketing approach :/ Especially with #veganism and vege
- none (want pos): Watching Chanel taunt desperate masses on Black Friday is the funniest thing in life #ScreamQueens
- none (want neg): @user yeah true. Leftists are actually willing to stab nazi scum like you
- none (want neu): How to Have Glowing #skins #skinnydip #skintight #BeautyAndTheBeast…
- none (want neg): #POTUSTrump voters are very comfortable with #TrumpTransitionTeam process because the drama reads a lot like #
- none (want neg): .@chrislhayes @user Pizzagate was the difference in the election. Comey letter, tied to Weiner, led to 10 days
- none (want neu): Dance Teacher Realness with my 10th grade girls #mannequinchallenge
- none (want neg): An Eastern Madkhali"The Khawarij should be killed by the ruler or in jail"#Libyahttps://t.co/JbARIw1Vhu
- none (want pos): @user just in time for the long weekend. Happy Thanksgiving from Ohio.
- none (want neg): Steve Bannon is a misogynistic, white supremacist homophobe--and he's Trump's new top advisor. Take action:
- none (want pos): Obama calls for unity in Thanksgiving message #Trump2016 #TrumpTrain #GOP #ccot #tcot #ThanksTrump #UniteBlue
- none (want pos): #MIDNIGHT #MUSICHappy Birthday!Little Richard, GOOD GOLLY MISS MOLLY (Muhammad Ali's 50th Birthday)
- none (want pos): Robots helped inspire deep learning might become -
- none (want pos): Leonard Cohen could rock a waltz.
- none (want pos): thanksgiving is over, it's time to pick out a christmas tree 🎄they are on sale today & tomorrow…

Errors (2 batches): 503 Request failed with status code 503; nvidia/nemotron-3-ultra-550b-a55b returned invalid JSON

#### gemini-3.5-flash (numbered prompt)

| gold \ predicted | pos | neu | neg | none |
|---|---|---|---|---|
| **pos** | 55 | 13 | 1 | 31 |
| **neu** | 5 | 36 | 23 | 36 |
| **neg** | 5 | 6 | 56 | 33 |

153 mistakes (first 15):

- pos (want neg): #POTUSTrump voters are very comfortable with #TrumpTransitionTeam process because the drama reads a lot like #
- pos (want neu): Dance Teacher Realness with my 10th grade girls #mannequinchallenge
- neu (want pos): Obama calls for unity in Thanksgiving message #Trump2016 #TrumpTrain #GOP #ccot #tcot #ThanksTrump #UniteBlue
- neu (want pos): Robots helped inspire deep learning might become -
- pos (want neg): @user These mother**kers know how to protest -Trump inauguration will be the same
- pos (want neg): first date dream: take me to an anti-trump protest
- pos (want neu): DJ&PK are giving away free @user tickets at Big O Tires 12600 South 4689 West until 10am. Get 2 tix while they
- neu (want neg): #FFRNN #CLASSROOM GUEST LECTURER Neil Cavuto; Apple vs. Government (A Company that Cares vs #Obamacare) #unite
- neu (want neg): Obamacare if you have called Marco Rubio a puppet Jeb Bush who s going over and complimented me.
- neu (want pos): Ariana Grande White House Easter Egg Roll in Washington #ArianaGrande
- neg (want neu): Since Trump became PresidentTPP - DeadFidel Castro - DeadISIS better hope ((((Allah)))) has something planned.
- neg (want neu): so fidel castro has died. when will maduro ever
- neu (want pos): LOT of 2 Allen Edmonds Grayson leather dress loafters Brown/Black career office #AllenEdmonds #Grays
- neg (want neu): Tony romo want me out the game
- neu (want pos): LIVE on #Periscope: Justice for Kenneth Chamberlin Sr. #blacklivesmatter

Errors (3 batches): 429 Request failed with status code 429

</details>

---

## FinnSentiment

Finnish social-media sentences (Suomi24 forum), each labelled by three native speakers. 100 per majority label. The three individual labels are kept for the human-agreement comparison.

Source: https://www.kielipankki.fi/corpora/finsen/ (Language Bank of Finland, University of Helsinki) · Licence: CC BY 4.0

*Lindén, K., Jauhiainen, T., Hardwick, S. (2023). FinnSentiment: a Finnish social media corpus for sentiment polarity annotation. Language Resources and Evaluation.*

300 items (pos 100, neu 100, neg 100).

| Method | Prompt | Accuracy | 95% interval | Macro-F1 | Labelled | Time |
|---|---|---|---|---|---|---|
| Keyword list (no AI) | — | **33%** | 29%–38% | 0.17 | 100% | — |
| nvidia/nemotron-3-super-120b-a12b | numbered | **75%** | 71%–80% | 0.76 | 100% | 75 s |
| nvidia/nemotron-3-ultra-550b-a55b | numbered | **77%** | 72%–82% | 0.77 | 100% | 202 s |
| gemini-3.5-flash | numbered | failed | — | — | 0% | — |
| gemini-3.8-flash | numbered | failed | — | — | 0% | — |

**Accuracy by subgroup**

| Method | 2 of 3 agree (n=133) | all 3 agree (n=165) | all 3 differ (n=2) |
|---|---|---|---|
| Keyword list (no AI) | 19% | 44% | 100% |
| nvidia/nemotron-3-super-120b-a12b | 64% | 84% | 50% |
| nvidia/nemotron-3-ultra-550b-a55b | 66% | 85% | 50% |

**Agreement with individual human annotators**

Each text was labelled by 3 people. "Human vs human" averages the 3 pairs of annotators; a method row averages its agreement with each annotator. Kappa corrects for agreement expected by chance (0 = chance, 1 = perfect).

| Comparison | Agreement | Cohen's kappa |
|---|---|---|
| Human vs human | 70% | 0.55 |
| Keyword list (no AI) vs human | 41% | -0.00 |
| nvidia/nemotron-3-super-120b-a12b vs human | 71% | 0.54 |
| nvidia/nemotron-3-ultra-550b-a55b vs human | 71% | 0.56 |

<details><summary>Confusion matrices and mistakes</summary>


#### Keyword list (no AI)

| gold \ predicted | pos | neu | neg | none |
|---|---|---|---|---|
| **pos** | 1 | 99 | 0 | 0 |
| **neu** | 1 | 98 | 1 | 0 |
| **neg** | 0 | 100 | 0 | 0 |

201 mistakes (first 15):

- neu (want neg) [all 3 agree]: Pahinta tässä on, että en edes halua lopettaa käyttöä, koska rakastan sitä euforista olotilaa.
- neu (want pos) [2 of 3 agree]: Ja kiitos taas eruskunnan suuntaan.
- neu (want neg) [2 of 3 agree]: Arvelen, että kyseessä on henkilö, joka tuntee minut, ja yrittää mustamaalata minua kirjoituksillaan.
- neu (want neg) [2 of 3 agree]: *irvistys*
- neu (want neg) [2 of 3 agree]: miehen nussima sitten olet?
- neu (want neg) [2 of 3 agree]: Et kai sä tosissas tällaista kirjoittele?
- neu (want pos) [all 3 agree]: joten olkaat hyvät te oiket tulkitsijat siirän tyhjän vastaussivun teille..:)
- neu (want neg) [2 of 3 agree]: Muilta osin vihaan lähes jokaista vastaantulijaa.
- neu (want pos) [2 of 3 agree]: niin siellä opetetaan kyllä kaikki
- neu (want pos) [2 of 3 agree]: Kiitos vinkeistä, luulen että niistä on apua.
- neu (want pos) [2 of 3 agree]: Kyllä Windows on perin ihana siihen kurttaukseen nähden!
- neu (want pos) [all 3 agree]: Oikein hyvää yötä ja mukavaa huomista päivää!
- neu (want neg) [2 of 3 agree]: Tuskin sääkään mikään komistus olet, kun täällä mainostat, reppana.
- neu (want pos) [2 of 3 agree]: Kiitos etukäteen...
- neu (want neg) [2 of 3 agree]: no sorry, näkyi jääneen ta välistä pois

#### nvidia/nemotron-3-super-120b-a12b (numbered prompt)

| gold \ predicted | pos | neu | neg | none |
|---|---|---|---|---|
| **pos** | 74 | 25 | 1 | 0 |
| **neu** | 6 | 82 | 12 | 0 |
| **neg** | 1 | 30 | 69 | 0 |

75 mistakes (first 15):

- pos (want neg) [all 3 agree]: Pahinta tässä on, että en edes halua lopettaa käyttöä, koska rakastan sitä euforista olotilaa.
- neu (want neg) [2 of 3 agree]: *irvistys*
- neu (want pos) [all 3 agree]: joten olkaat hyvät te oiket tulkitsijat siirän tyhjän vastaussivun teille..:)
- neu (want pos) [2 of 3 agree]: niin siellä opetetaan kyllä kaikki
- neg (want neu) [2 of 3 agree]: Tarkoituksellista harhautusta koko ajatus vuosikiertoisen "energiaviljelyn" esiin tuominen.
- neu (want pos) [2 of 3 agree]: Kiitos etukäteen...
- neu (want neg) [2 of 3 agree]: no sorry, näkyi jääneen ta välistä pois
- neu (want neg) [2 of 3 agree]: Muita vaihtoehtojahan ei ole olemassa, et sillei hei
- neu (want pos) [all 3 agree]: Kehystä ja teemaa, oikeinko saan toivoa? ;)
- neu (want pos) [all 3 agree]: mut siellä pitää olla ihan lähekkäin ;).
- neu (want neg) [2 of 3 agree]: En mä tiedä kuinka mä voisin sua neuvoa.
- neu (want neg) [all 3 agree]: Tässä se nyt nähtiin, Täällä meidän lintukodossa piilotellaan asioita, Ai ai, ja Kokko haluaa lisää kavereita 
- neu (want neg) [2 of 3 agree]: Mutta ei aavistustakaan mitä teen.
- neu (want neg) [2 of 3 agree]: Noissa piirretyissä hahmoissa tai heidän puheissa ei ole päätä eikä häntää.
- neg (want neu) [2 of 3 agree]: Eksymyksen ja paatumuksen valtaan joutumisen vaara on todellinen!

#### nvidia/nemotron-3-ultra-550b-a55b (numbered prompt)

| gold \ predicted | pos | neu | neg | none |
|---|---|---|---|---|
| **pos** | 72 | 23 | 5 | 0 |
| **neu** | 5 | 78 | 17 | 0 |
| **neg** | 1 | 19 | 80 | 0 |

70 mistakes (first 15):

- neg (want pos) [2 of 3 agree]: Ja kiitos taas eruskunnan suuntaan.
- neu (want neg) [2 of 3 agree]: *irvistys*
- neu (want pos) [all 3 agree]: joten olkaat hyvät te oiket tulkitsijat siirän tyhjän vastaussivun teille..:)
- neu (want pos) [2 of 3 agree]: niin siellä opetetaan kyllä kaikki
- neg (want neu) [2 of 3 agree]: Tarkoituksellista harhautusta koko ajatus vuosikiertoisen "energiaviljelyn" esiin tuominen.
- neu (want neg) [2 of 3 agree]: no sorry, näkyi jääneen ta välistä pois
- neu (want pos) [all 3 agree]: Kehystä ja teemaa, oikeinko saan toivoa? ;)
- neu (want pos) [all 3 agree]: mut siellä pitää olla ihan lähekkäin ;).
- neu (want neg) [2 of 3 agree]: En mä tiedä kuinka mä voisin sua neuvoa.
- neu (want neg) [2 of 3 agree]: Mutta ei aavistustakaan mitä teen.
- pos (want neu) [all 3 differ]: " L ä s n ä - o l e m i n e n :)
- neu (want neg) [2 of 3 agree]: Noissa piirretyissä hahmoissa tai heidän puheissa ei ole päätä eikä häntää.
- neu (want pos) [2 of 3 agree]: Siellä erilaisuus on lähinnä rikkaus (asuin siis itärannikolla) ja älkää uskoko televisiota, ei sielläkään ulk
- neg (want neu) [2 of 3 agree]: Eksymyksen ja paatumuksen valtaan joutumisen vaara on todellinen!
- neu (want pos) [2 of 3 agree]: Liika pitkästä sais taas ottaa ylimääräset pois, ku joka sentti ei sinne mahru :)!

</details>
