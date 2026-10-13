# AI design: how EchoFlow analyses what people are talking about

EchoFlow collects posts and articles about a topic from several free sources and uses a large language model (LLM) to:

1. label the **mood of every post**: positive, neutral or negative, with a short reason,
2. write a **summary** of the discussion,
3. give **its own opinion** on it, plus themes and insights.

This document explains how that works, how we chose the model, what we learned about prompting, and where the limits are.

---

## 1. Pipeline

```
search "Finland, football"
        │
        ▼
POST /api/discover ── Reddit, Hacker News, Bluesky, Lemmy, Google News, news APIs (in parallel)
        │              → up to a few hundred posts, de-duplicated, time-filtered
        ▼
POST /api/analytics/analyze   (src/services/ai-service.ts)
        │
        ├── Summary request ─── 25 posts, mixed across sources
        │                        → summary, AI opinion, themes, insights, overall mood
        │
        └── Labelling requests ─ every post (max 200), in batches of 40, run in parallel
                                 → {"1":{"s":"neg","r":"reason"}, "2":{...}, ...}
        │
        ▼
mood bar = count of the labels   (so the bar always matches the coloured list)
```

Both kinds of request go through the same fallback chain: NVIDIA NIM models in the order of `NVIDIA_MODEL` (default **Nemotron 3 Super → Nemotron 3 Ultra**), then Google Gemini (`GEMINI_MODEL`, default **3.8 Flash → 3.5 Flash**), then a local Ollama model. Providers without a key are skipped. An answer that labels fewer than 80% of its batch is rejected and the next model is tried.

All models used are free: NVIDIA's hosted NIM endpoints (free API key), Google Gemini's free tier (free AI Studio key, no billing enabled) or Ollama running locally in Docker. Google states that free-tier prompts may be used to improve its products; we only send public headlines and posts.

---

## 2. Labelling prompt

Each post becomes one numbered line (title plus up to 160 characters of text). The model is told what each label means, with examples that stop it from reacting to single words:

> pos = good news or a happy/approving tone · neg = bad news or an unhappy/critical tone · neu = factual, informational, a question, mixed or unclear.
> "factory closes, 300 lose jobs" is neg even though "jobs" sounds positive; "top 10 picks for this weekend" is neu.

It must answer with **one JSON key per post number**, each holding a label and a reason of at most 8 words:

```json
{"1": {"s": "neg", "r": "factory closing, jobs lost"},
 "2": {"s": "neu", "r": "listing picks, no opinion"}}
```

The reason is shown next to each post in the UI, so a user (or a grader) can see *why* a post got its colour instead of just trusting it.

The full prompt is `buildLabelPrompt()` in [`src/services/ai-service.ts`](../src/services/ai-service.ts).

### Lesson: numbered keys, not an ordered list

The first version asked the model for an ordered list: *"article_labels: one label per post, in order"*. In the app it looked plausible at first, but a user noticed that clearly negative headlines ("Google accused of felling 300 hectares of forest") were coloured green.

What happened: the model gave a few sensible labels, then lost track of which label belonged to which post. It padded the rest of the list with `"pos"`, or stopped early. Nothing in the output said which post a label was for, so the app had no way to notice.

With numbered keys every label is explicitly tied to a post, and missing ones are visible. The benchmark (section 3) shows how big the difference is with the same models and the same posts:

| Model | Ordered list | Numbered keys |
|---|---|---|
| Nemotron 3 Super | 62% | **98%** |
| Nemotron 3 Ultra | 60% | **97%** |
| Nemotron 3.5 Lightning | 35% | **87%** |

With the list prompt, Lightning labelled almost everything `pos` and skipped the last 15% of posts. That is exactly the bug users saw. The numbered prompt also asks for a reason, which may help a little by making the model think about each post, but the main effect is the structure.

Other practical lessons:
- **Nemotron 3 models "think" before answering** by default, which made a 25-post analysis exceed a 60-second timeout. Turning it off (`chat_template_kwargs: {enable_thinking: false}`) brought it down to a few seconds without hurting accuracy on this task.
- **Models get retired.** The original default (`mistralai/mistral-nemotron`) started returning HTTP 410. Keeping a fallback chain and a benchmark makes it easy to switch.
- **Ask for the bar to be computed, not guessed.** Earlier the mood bar was the model's own percentage estimate and did not match the per-post colours. Now the bar is counted from the labels.

---

## 3. Choosing the model: benchmark

[`eval/sentiment-benchmark.ts`](../eval/sentiment-benchmark.ts) scores models against [`eval/headlines.json`](../eval/headlines.json): **50 hand-labelled posts**. Most are real posts EchoFlow collected in October 2026 (searches *Finland*, *football*, *AI*). About a dozen were written by us to cover Finnish text and clear-cut cases. Ambiguous posts accept more than one label (e.g. *"JetBrains reports revenue growth, net financial loss"* accepts neu or neg).

It uses the app's real prompt (`buildLabelPrompt`) and also scores the keyword method as a non-AI baseline.

Results (3 runs per model, 2026-10-09, full report with every mistake in [`eval/results/2026-10-09.md`](../eval/results/2026-10-09.md)):

| Method | Accuracy (min–max over 3 runs) | Avg time for 50 posts |
|---|---|---|
| Keyword list (no AI) | 64% | 0 s |
| Nemotron 3 Super 120B | **98%** (98–98) | 13.6 s |
| Nemotron 3 Ultra 550B | 97% (96–98) | 20.5 s |
| Nemotron 3.5 Lightning 30B | 87% (86–88) | 25.4 s |

An earlier, shorter test on 38 posts also tried other models available on the free NVIDIA tier. `openai/gpt-oss-20b` reached 89% but took ~100 s. GLM 5.3, Gemma 4 31B and DeepSeek V4.1 Flash timed out after 120 s, and several listed models returned 404 for our key.

**Decision:** Nemotron 3 Super first (most accurate, fastest, reliably available) and Ultra as backup. Ultra's free endpoint often answered 503 (busy) during testing.

### Second provider: Google Gemini (free tier)

We added Google Gemini through its free tier (Google AI Studio key, no billing enabled) and ran the same benchmark (3 runs, [`eval/results/2026-10-09-gemini.md`](../eval/results/2026-10-09-gemini.md)):

| Model | Accuracy | Avg time for 50 posts | Successful runs |
|---|---|---|---|
| Nemotron 3 Super (NVIDIA) | 98% | 19.8 s | 3/3 |
| Nemotron 3 Ultra (NVIDIA) | 97% (94–98) | 15.8 s | 3/3 |
| Gemini 3.5 Flash | 98% | 9.3 s | 3/3 |
| Gemini 3.8 Flash | 100% (1 run) | 27.4 s | 1/3, busy (503) twice |

Gemini 3.5 Flash is as accurate as Nemotron 3 Super and about twice as fast. Gemini 3.8 Flash got every post right in the one run that went through, but the free endpoint was overloaded most of the time. `gemini-2.5-flash` is no longer offered to new keys, and 3.6/3.7 Flash hung without answering in our tests.

All the top models now score 97–100%, so **this test set can no longer separate them**. Each model makes at most one mistake, and those are on the most debatable posts. A harder test set (sarcasm, mixed news, longer Finnish texts) would be the next step.

**Decision:** NVIDIA stays first and Gemini (3.8 Flash, then 3.5 Flash) is the backup. Both are equally accurate here, and NVIDIA's free tier allows more requests per minute. The order is a one-line change in `.env` (`NVIDIA_MODEL`, `GEMINI_MODEL`).

### Side-by-side comparison in the app

The **⇄ Compare NVIDIA vs Gemini** button in the AI card runs both providers on exactly the same posts and prompts, with no fallback between them. It shows both analyses next to each other, an agreement score and every post the two models labelled differently, with both reasons.

On a live *"Finland, football"* search (60 posts) the two agreed on **52 of 60 posts (87%)**. Nearly all disagreements were neutral vs positive/negative on borderline posts. That is a useful way to find posts whose mood is genuinely debatable.

Running the same model twice is not perfectly consistent either: in testing, a few borderline posts (e.g. a 1–0 match report) got neutral in one run and positive in another, even at temperature 0.1.

The keyword baseline gets 64%, partly because 24 of the 50 posts accept "neutral" and it defaults to neutral when it finds no known words. Its typical mistakes show why an LLM is needed: *"AI stocks **sink**"* → positive (it doesn't know "sink"), *"UAE is threatening to pull investment"* → positive (sees "investment"), and almost all Finnish sentences → neutral.

### Reproduce

```bash
npm install
# NVIDIA_API_KEY (free at build.nvidia.com) and/or GEMINI_API_KEY (free at aistudio.google.com) in .env
npm run eval                                       # default models (Gemini too if its key is set), 2 runs
npm run eval -- --prompt both --runs 3 --out eval/results/my-run.md
npm run eval -- --models nvidia/nemotron-3-super-120b-a12b,gemini-3.5-flash
```

---

### Small local models from Hugging Face

LLMs are not the only option. Hugging Face has small classifiers trained only for sentiment that run on a laptop CPU with no key and no rate limit. `npm run eval -- --models hf:<repo>` runs any of them locally (ONNX via `@huggingface/transformers`). Results on the same four test sets ([`eval/results/2026-10-13-hf-local.md`](../eval/results/2026-10-13-hf-local.md)):

| Model (size) | Our headlines | Financial PhraseBank | TweetEval | FinnSentiment |
|---|---|---|---|---|
| Nemotron 3 Super, cloud LLM (for comparison) | 98% | 77% | 68% | 75% |
| **twitter-xlm-roberta-base-sentiment** (Cardiff NLP, 278M, multilingual) | 78% (82% at q8) | 58% | 70% | 74% |
| twitter-roberta-base-sentiment-latest (Cardiff NLP, English) | 74% | 62% | 70% | 39% |
| multilingual-sentiment-analysis (tabularisai) | 74% | 51% | 49% | 43% |
| distilbert-base-multilingual-cased-sentiments-student | 60% | 39% | 55% | 42% |
| finbert-finnsentiment (Turku FinBERT, Finnish only) | 48% | 57% | 40% | 93%* |
| Keyword list (no AI) | 64% | 63% | 42% | 33% |

- **xlm-roberta is the surprise.** It's a 278M-parameter model, about 400× smaller than the cloud LLM. On tweets and Finnish forum posts it matches the LLM, even though it was never fine-tuned on Finnish (only pre-trained on it). It falls behind on news, where knowing *what is bad news* matters more than tone.
- **\*FinBERT's 93% is data leakage, not skill.** It was fine-tuned on 90% of the FinnSentiment corpus, so most of our 300 test sentences were in its training data. The warning signs are in the numbers. It agrees with the human annotators *more* often (82%) than they agree with each other (70%), and it gets 99% of the sentences all three humans agreed on. On data it hasn't seen (our headlines, tweets) it is the weakest model. Leakage like this is easy to miss when a model is downloaded from a hub.
- **Quantization is free here.** The 8-bit version of xlm-roberta (`@q8`, ~280 MB) scored the same as or slightly better than the full 1.1 GB model, and ran ~4× faster. The 4-bit version lost 2–8 points.
- **We use it in the app.** xlm-roberta (q8) labels the moods when NVIDIA and Gemini don't answer, instead of the 3B Ollama model, which mislabelled or skipped most posts. It runs inside the web container and labels 40 posts in a few hundred milliseconds. It gives no reasons and can't write the summary, so the UI says when it was used.

## 4. Summary, opinion and language

The summary request sees 25 posts. They are picked round-robin across sources, so one loud platform can't dominate, with the most engaged posts first. It returns a summary, the **AI's own opinion** (the prompt asks it to take a stance on whether the reaction seems justified), themes, insights and one overall mood word.

The settings drawer has **AI writes in: English / Suomi**. It adds one instruction to both prompts ("Write all text values in Finnish"). Labels stay `pos/neu/neg` so the code doesn't depend on the language. Posts themselves can be in any language; the benchmark includes Finnish posts.

---

## 5. Limitations

- **Small test set.** 50 posts labelled by us is enough to compare models and prompts against each other, but too small to give a precise accuracy figure. A difference of 1–2 points (Super vs Ultra vs Gemini) is within noise, and the best models now all score 97–100%.
- **Our labels are subjective.** Mood is often debatable ("Finland bans private schools. Finland has the world's best schools." could be read three ways). We accepted several labels where we disagreed with ourselves, which makes the task easier.
- **The keyword baseline is a little optimistic.** A few words were added to its list ("halt", "accused", "forfeit") after looking at real posts, some of which are in the test set. The prompt examples were deliberately written so they do *not* appear in the test set.
- **Headlines only.** Most posts are judged from their title and the first ~160 characters. Sarcasm, images and context outside the text are invisible to the model ("Miss this guy." is a photo post).
- **Mood ≠ stance.** "Negative" means bad news or a critical tone, not that people are against the topic. A halt to a damaging project is labelled negative news even if many readers welcome it.
- **Free endpoints vary.** Response times range from ~3 s to ~30 s, and models can be busy or retired. The fallback chain hides this from the user but not the delay.
- **Hub models need checking.** A model's own reported accuracy, or a score on a public dataset, may come from overlap with its training data (see FinBERT above). Always check the model card for what it was trained on.
- **Limits per search.** Up to 200 posts are labelled; anything beyond that (rare) keeps a keyword estimate, marked with `*` in the UI.
