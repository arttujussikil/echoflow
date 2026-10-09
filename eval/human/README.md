# Second human annotator

How much do two people agree on the mood of a post? This tells us how good "98% accuracy" really is. If two humans only agree 85% of the time, a model at 98% against *one* person's labels is mostly matching that person's taste.

## Instructions for the teammate

1. **Don't look at `eval/headlines.json`** first. It contains our labels.
2. Open `label-template.csv` in Excel, LibreOffice or a text editor.
3. Fill the `label` column for every row with **pos**, **neu** or **neg**:
   - **pos**: good news or a happy/approving tone (success, achievement, growth, praise, joy)
   - **neg**: bad news or an unhappy/critical tone (harm, conflict, loss, accusations, bans, cuts, complaints, outrage)
   - **neu**: factual, informational, a question, mixed or unclear

   These are the same definitions the AI gets. Go with your first impression; don't research the posts.
4. Save as `eval/human/teammate.csv` (keep it CSV; a `;` separator from Finnish Excel is fine).
5. Run:

   ```bash
   npm run eval -- --human eval/human/teammate.csv --out eval/results/human-agreement.md
   ```

The report adds a **"Two humans and the models"** table: how often you two agree (and Cohen's kappa), and how often each model agrees with each of you.
