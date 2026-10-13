# Benchmark datasets

Public, human-labelled sentiment datasets used by `npm run eval`, in addition to our own 50 headlines (`eval/headlines.json`).

```bash
npm run eval:data                                  # download + sample into eval/datasets/data/ (git-ignored)
npm run eval -- --dataset all --out eval/results/my-run.md
```

| Name | Dataset | Sample | Why it's here |
|---|---|---|---|
| `fpb` | **Financial PhraseBank** (Aalto University) | 300 English financial-news sentences, 75 from each annotator-agreement band (100%, 75–99%, 66–74%, 50–65%) | News text like EchoFlow's; the agreement bands show how models cope when humans themselves disagree |
| `tweeteval` | **TweetEval sentiment** (SemEval-2017, Cardiff NLP) | 300 English tweets, 100 per label | Short, informal, sarcastic social-media posts, like Bluesky/Reddit |
| `newsmtsc` | **NewsMTSC** (University of Konstanz) | 300 English news sentences, 100 per label, each with the sentiment toward one named person | Evaluates *Mood toward…*: the label is about the target, not the sentence |
| `finsen` | **FinnSentiment** (Language Bank of Finland, University of Helsinki) | 300 Finnish forum sentences, 100 per majority label, with all 3 annotators' labels | Tests Finnish, and lets us compare model–human agreement with human–human agreement |

## Why the texts aren't in the repo

The datasets have their own licences (Financial PhraseBank: CC BY-NC-SA 3.0; FinnSentiment: CC BY 4.0; TweetEval and NewsMTSC: research use), which don't fit this repo's MIT licence. So the repo only contains:

- `fetch-datasets.ts`, which downloads each dataset from its official source, and
- `samples.lock.json`, the IDs of the sampled rows. With it, `npm run eval:data` rebuilds exactly the same 300-item samples. Delete it to draw a new sample.

The one exception is `eval/human/label.html`, the labelling tool for a second human annotator. It contains 100 FinnSentiment sentences, which CC BY 4.0 allows with attribution (given in the tool and in `eval/human/README.md`).

## Sampling notes

- Samples are **balanced** (equal numbers per label, or per agreement band), not the natural distribution. In real data most sentences are neutral. A balanced sample makes the task harder and macro-F1 more meaningful, but accuracy here is not "accuracy on typical posts".
- Financial PhraseBank labels are from an **investor's** point of view ("profit up" = positive). EchoFlow's prompt asks for good/bad news in general, which usually but not always matches.
- In FinnSentiment, a balanced sample over-represents positive and negative sentences, which are rarer and more often disputed than neutral ones. That's one reason human agreement on this sample is low.

## Sources

- Malo, P., Sinha, A., Korhonen, P., Wallenius, J., Takala, P. (2014). *Good debt or bad debt: Detecting semantic orientations in economic texts.* JASIST 65(4). https://huggingface.co/datasets/takala/financial_phrasebank
- Barbieri, F., Camacho-Collados, J., Espinosa-Anke, L., Neves, L. (2020). *TweetEval: Unified Benchmark and Comparative Evaluation for Tweet Classification.* Findings of EMNLP. https://huggingface.co/datasets/cardiffnlp/tweet_eval
- Hamborg, F., Donnay, K. (2021). *NewsMTSC: A Dataset for (Multi-)Target-dependent Sentiment Classification in Political News Articles.* EACL. https://github.com/fhamborg/NewsMTSC
- Lindén, K., Jauhiainen, T., Hardwick, S. (2023). *FinnSentiment: a Finnish social media corpus for sentiment polarity annotation.* Language Resources and Evaluation. https://www.kielipankki.fi/corpora/finsen/
