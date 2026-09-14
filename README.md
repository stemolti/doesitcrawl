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

## What it has found so far

*Updated 14 September 2026. The page has been live since 7 September.*

A fourth marker, live since 10 September, records per request whether the JavaScript
actually ran. It separates three cases a server log cannot: the script ran and used one
browser primitive, it ran and used another, or the crawler followed a literal URL found
in the source **without running anything** — the last being positive proof of
non-execution, which is the hard half of this question.

Categories below are the ones **Cloudflare verifies**. A user-agent string alone proves
nothing.

| Crawler | Category | Requests | Page fetches | Since the marker | Verdict |
|---|---|---:|---:|---:|---|
| `meta-externalagent` | AI Crawler | 6 | 3 | 2 | **executes JavaScript** |
| `GoogleOther` | AI Crawler | 4 | 1 | 1 | **reads the source, does not execute** |
| `Googlebot` | Search Engine Crawler | 57 | 14 | 3 | executes JavaScript |
| `bingbot` | Search Engine Crawler | 34 | 12 | 7 | page only, never the script |
| `ClaudeBot` | AI Crawler | 115 | 2 | **0** | never tested |
| `GPTBot` | AI Crawler | 14 | 2 | **0** | never tested |
| `Applebot` | AI Search | 8 | 3 | **0** | never tested |
| `OAI-SearchBot` | Search Engine Crawler | 11 | 0 | **0** | never tested |

| Finding | Evidence |
|---|---|
| A verified AI crawler **does** render | 14 Sep, 07:41 UTC: `meta-externalagent` fetched page, script and both execution primitives in 628 ms. Not every time — on 12 Sep it took the page alone. One render in two chances. |
| A verified AI crawler **demonstrably does not** | 11 Sep: `GoogleOther`, verified from Google's network, requested the literal URL as written in the source instead of the form the script builds at runtime. Only possible by reading without executing. |
| **They stop coming back** | The marker went live *after* the AI crawlers had already stopped fetching the page, so four of them were never tested at all. "Never tested" is not "does not render". |

| Crawler | Its requests are mostly | The page itself |
|---|---|---|
| `ClaudeBot` | `robots.txt` ×55, `sitemap.xml` ×54 | twice, both 7 Sep |
| `GPTBot` | `sitemap.xml` ×6 | twice, 7 and 9 Sep |
| `Applebot` | the script ×3 | three times, all by 8 Sep |
| `OAI-SearchBot` | `robots.txt` ×6 | never |

For a new domain with no authority this may matter more than the rendering question: an
empty result at the end must be read as *they stopped coming*, not as *they do not
render*.

### A warning about user-agent statistics

| Claimed name | Verified | What it actually asked for |
|---|---|---|
| `ChatGPT-User`, `PerplexityBot`, `OAI-SearchBot` | **no** | `/.env.production`, `/.git/HEAD`, `/service_account.json`, `/.netrc`, `/aws-exports.js` |

A credential scan wearing those names. Any measurement of AI crawler traffic built on
user-agent strings alone is counting it.

### What this does not say

One page, one new domain with no authority, a few weeks. It reports what these crawlers
did here, not what they do everywhere. An absent beacon never proves non-execution; only
the literal-URL case proves it positively.

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
this one, the measurement would die without any signal.**

The visit log is not published either: it contains IP addresses, and the addresses are
what turns a user-agent claim into a verified crawler, so they matter and they are not
mine to publish.

**The results are.** Until 14 September 2026 this section said the measurements were not
published either. That was changed deliberately, not overlooked: the findings above
contain no marker, no address and no log. A test whose answer stays private is not a
public test.

Only variable names remain in the code. Account identifiers are replaced with
placeholders: anyone rebuilding the experiment must create their own.

## Licence

**No licence.** This code is published to be read, not reused: full copyright applies,
all rights reserved. If you need it for something, get in touch.

---

By [Stefano Agbodan](https://github.com/stemolti). The test is independent,
non-commercial, with no tracking and no cookies.
