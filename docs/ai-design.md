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

Both kinds of request go through the same fallback chain: NVIDIA NIM models in the order of `NVIDIA_MODEL` (default **Nemotron 3 Super → Nemotron 3 Ultra**), then a local Ollama model. An answer that labels fewer than 80% of its batch is rejected and the next model is tried.

All models used are free: NVIDIA's hosted NIM endpoints (free API key) or Ollama running locally in Docker.

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

The keyword baseline gets 64%, partly because 24 of the 50 posts accept "neutral" and it defaults to neutral when it finds no known words. Its typical mistakes show why an LLM is needed: *"AI stocks **sink**"* → positive (it doesn't know "sink"), *"UAE is threatening to pull investment"* → positive (sees "investment"), and almost all Finnish sentences → neutral.

### Reproduce

```bash
npm install
# NVIDIA_API_KEY in .env (free at build.nvidia.com)
npm run eval                                       # default models, 2 runs
npm run eval -- --prompt both --runs 3 --out eval/results/my-run.md
npm run eval -- --models nvidia/nemotron-3-super-120b-a12b,openai/gpt-oss-20b
```

---

## 4. Summary, opinion and language

The summary request sees 25 posts. They are picked round-robin across sources, so one loud platform can't dominate, with the most engaged posts first. It returns a summary, the **AI's own opinion** (the prompt asks it to take a stance on whether the reaction seems justified), themes, insights and one overall mood word.

The settings drawer has **AI writes in: English / Suomi**. It adds one instruction to both prompts ("Write all text values in Finnish"). Labels stay `pos/neu/neg` so the code doesn't depend on the language. Posts themselves can be in any language; the benchmark includes Finnish posts.

---

## 5. Limitations

- **Small test set.** 50 posts labelled by us is enough to compare models and prompts against each other, but too small to give a precise accuracy figure. A difference of 1–2 points (Super vs Ultra) is within noise.
- **Our labels are subjective.** Mood is often debatable ("Finland bans private schools. Finland has the world's best schools." could be read three ways). We accepted several labels where we disagreed with ourselves, which makes the task easier.
- **The keyword baseline is a little optimistic.** A few words were added to its list ("halt", "accused", "forfeit") after looking at real posts, some of which are in the test set. The prompt examples were deliberately written so they do *not* appear in the test set.
- **Headlines only.** Most posts are judged from their title and the first ~160 characters. Sarcasm, images and context outside the text are invisible to the model ("Miss this guy." is a photo post).
- **Mood ≠ stance.** "Negative" means bad news or a critical tone, not that people are against the topic. A halt to a damaging project is labelled negative news even if many readers welcome it.
- **Free endpoints vary.** Response times range from ~3 s to ~30 s, and models can be busy or retired. The fallback chain hides this from the user but not the delay.
- **Limits per search.** Up to 200 posts are labelled; anything beyond that (rare) keeps a keyword estimate, marked with `*` in the UI.
