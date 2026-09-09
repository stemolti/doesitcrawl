# doesitcrawl

*[Leggi in italiano](README.it.md)*

A public, permanently running test of a question nobody has verified since 2024:
**do AI crawlers execute JavaScript before they index a page?**

The test is live at **[doesitcrawl.com](https://doesitcrawl.com)**. This repository is
the code behind it.

## The question

The most cited measurement is Vercel and MERJ's December 2024 analysis of more than 500
million GPTBot fetches, which observed no JavaScript execution at all. No public test
has replicated it since, while the crawlers themselves have changed and multiplied. This
page is a small, permanent attempt to keep the answer current.

## How it works

Three unique markers live on the page. Each one, if it ever shows up in an AI
assistant's answer, proves something different.

| Marker | Where it lives | What it proves |
|---|---|---|
| first | in the served HTML | the page was fetched and retained |
| second | in no served byte, reassembled only by running JavaScript | the crawler actually renders |
| third | a literal string inside `/e.js`, never inserted into the page | it downloads the JavaScript and indexes its text without executing it |

The third marker separates two things the classic test conflates. GPTBot downloads
JavaScript files in about 11.5% of its requests and ClaudeBot in about 23.84%, without
executing them. If the second marker were a literal inside the script, a crawler that
merely ingested the file would surface it, and the test would report rendering where
there is none. That is why the second marker travels XOR-encoded with a key that changes
on every request, and never appears in any byte the server sends.

## What is in here

| Directory | What it does |
|---|---|
| [apps/doesitcrawl](apps/doesitcrawl/) | The page and the crawler log, on a single free Cloudflare Worker |
| [apps/doesitcrawl-mirror](apps/doesitcrawl-mirror/) | The same page outside Cloudflare, as a control |
| [tools/page-parity.mjs](tools/page-parity.mjs) | Verifies the two surfaces serve the same page, and that the second marker is in no served byte |
| [tools/scanner](tools/scanner/) | Paired GPTBot and Chrome scan from the same address, to measure who blocks what |
| [tools/indexnow.py](tools/indexnow.py) | Tells search engines the page changed, instead of waiting for a crawler |
| [infra/supabase](infra/supabase/) | Schema for the independent log |

### Why there is a control copy

A Cloudflare block happens **before** the Worker runs. A blocked crawler leaves no trace
in the log, so an empty log is indistinguishable from a crawler that never came. The fix
cannot live inside the Worker, because in that case the Worker is never executed. It
needs a second observation point outside Cloudflare, and comparing the two logs separates
three cases that would otherwise collapse into one.

| Cloudflare log | External log | What you learned |
|---|---|---|
| visits | visits | nobody blocks, now wait for the engines to read it |
| nothing | visits | Cloudflare blocks, and the date is in the log |
| nothing | nothing | a discovery problem, not a rendering one |

What makes that comparison valid is that the two pages must be **identical except for
the markers and the canonical URL**. The template, however, is written twice, in two
files that deploy separately and in two different module syntaxes, so it can drift
without anyone noticing. Hence the parity check, which runs before every deploy.

## What is not public, and why

The values of the three markers are secrets. They live in the platform's secret store,
never in a file. **If a search engine learned a marker from another page instead of from
this one, the measurement would die without any signal.** For the same reason neither the
contents of the visit log nor the collected measurements are published.

Only variable names remain in the code. Account identifiers are replaced with
placeholders: anyone rebuilding the experiment must create their own.

## Licence

**No licence.** This code is published to be read, not reused: full copyright applies,
all rights reserved. If you need it for something, get in touch.

---

By [Stefano Agbodan](https://github.com/stemolti). The test is independent,
non-commercial, with no tracking and no cookies.
