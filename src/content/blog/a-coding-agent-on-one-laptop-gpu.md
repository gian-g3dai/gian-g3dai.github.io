---
title: "A coding agent on one laptop GPU"
description: "Fitting a terminal coding agent onto a 16 GB laptop GPU: why the biggest model you can load is the wrong choice, a GGUF chat template that quietly broke the agent loop, and a benchmark that caught one model deleting its own input data."
pubDate: 2026-09-20
tags: ["llm", "inference", "coding agents", "ollama", "local models"]
---

I found my old gaming laptop again, looked up the specs out of curiosity, and noticed the GPU had 16 GB of memory. When I bought that machine, 16 GB was a lot. It seemed like more than enough to run a coding agent locally, entirely on my own hardware: no API, no network, nothing leaving the laptop. So I gave it a try.

The machine is an RTX 3080 Laptop: 16 GB of VRAM, 15 GB of system RAM behind it, Ollama on WSL2. The thing I actually came away with is that 16 GB doesn't buy what it used to. That budget turns out to be the whole story, and most of what I got wrong came from ignoring it.

The harness was the easy part. [OpenCode](https://opencode.ai) installs as a single binary, which mattered because I had no Node.js on the machine, and it speaks to anything OpenAI-compatible — Ollama's `/v1` endpoint included. The models were where it got interesting.

## The biggest model you can load is the wrong model

I started with what was already on disk: a 27B dense model at IQ4_XS, 15 GB of weights. It loads. It even runs at 100% GPU. It is also the wrong choice, and the arithmetic says so before any benchmark does.

An agent lives in its KV cache. That model is 65 layers with 4 KV heads at head_dim 128, so each token of context costs `65 × 4 × 128 × 2 × 2` bytes ≈ **133 KB**. With 15 GB of weights on a 16 GB card, there is about a gigabyte left. That buys roughly 8k of context, and I could only reach 16k by giving up the vision projector and accepting no headroom at all.

16k sounds like plenty until you load an agent's system prompt and a dozen tool schemas into it. I watched it fire a context-compaction pass while working on a **four-line file**.

The 14B alternative is 40 layers with 8 KV heads — 160 KB per token, worse per token, but only 9.3 GB of weights. That leaves room for 24k of context and it still fits entirely in VRAM:

| | context | VRAM | prompt eval | generation |
|---|---|---|---|---|
| Qwen3 14B | 24k | 13 GB, 100% GPU | ~1000 tok/s | 32.5 tok/s |
| Qwen3.5 27B (dense) | 16k | 14 GB, 100% GPU | — | 18.4 tok/s |
| Qwen3-Coder 30B (MoE) | 32k | 22 GB, 33% CPU | ~600 tok/s | 31 tok/s |

That third row is the one worth internalising. The 30B is *larger than my entire GPU* and spills a third of its layers to CPU — and still generates as fast as the fully resident 14B, because only ~3B of its 30B parameters are active per token. Sparsity beats residency. The dense 27B sits entirely in VRAM and runs at half the speed of a model that doesn't fit.

One measurement trap, since I fell into both: a cold model charges load time to the first request (I got a nonsense 1.8 tok/s reading that way), and reusing a prompt hits Ollama's prefix cache and reports ~90,000 tok/s. Use a unique prompt and a warm model, or you're benchmarking neither.

## The template was broken

The 27B didn't just run slowly under the agent — it produced *nothing*. Fifteen minutes, zero bytes of output, while the model stayed pinned and busy. That isn't slowness, that's a loop.

The cause was in the GGUF's chat template. It rendered `.System`, `.Prompt` and `.Response` and nothing else: no `{{ range .Messages }}`, no `{{ if .Tools }}`, no handling of the `tool` role. In an agent loop the harness sends the whole history back each turn, and this template silently discarded every tool result. The model could never observe the outcome of its own actions, so it never converged. It also carried a hardcoded preamble — *"Reasoning effort is set to xhigh. Please think carefully through the task..."* — injected into every system prompt, and `PARAMETER stop <think>`, which halts generation the instant a reasoning block opens.

Rebuilding fixed the loop. Note the `FROM`: pointing at the existing model inherits the bad parameters, so it has to come from the raw GGUF blob.

```
FROM /home/…/blobs/sha256-40fac4050e94…   # raw weights, not the model tag
TEMPLATE """…"""                          # the stock Qwen3 template, with .Tools and .Messages
PARAMETER num_ctx 16384
```

After that it held a multi-turn tool conversation correctly and ran with reasoning off. It still failed the benchmark — it spent fifteen minutes calling the read tool with `file_path` when the harness wanted `filePath`, wrote itself a note saying *use `filePath`*, and then kept emitting `file_path` anyway: 11 redundant reads, 8 failed edits, one unchanged file. But that's a capability limit, not a defect, and it was worth separating the two.

Worth checking before you go template-spelunking: Ollama handles some models in native Go (`RENDERER qwen3-coder` / `PARSER qwen3-coder`) rather than through the Go template, and derived models inherit that. For those, the template is not where your bug is.

## The benchmark that mattered

Two tasks, both trivial by design: fix an off-by-one in a recursive `fib`, and write a script summing a CSV column while skipping a malformed row. The point of trivial tasks is that failure is informative.

I added one check that turned out to be the only one worth having — checksum the input file before and after each run. Ten runs per model, across two different harnesses:

| model | task passed | **input file destroyed** |
|---|---|---|
| Qwen3 14B | 8 / 10 | **0 / 10** |
| Qwen3-Coder 30B | 6 / 10 | **4 / 10** |

The 30B is the better coder on paper and it fixed the `fib` bug faster than the 14B did. It also, in four runs out of ten, overwrote the input data with rows it invented — and in one run ran `rm total.py data.csv`, deleting the file it had been asked to read. Then it computed the sum of its own fabricated data and reported that the *instruction* was wrong: *"the sum should be 10.0, not 8 as mentioned."*

The 14B's failures were the boring kind: it reached for pandas, which isn't installed, and once thrashed 19 consecutive failed edits until it timed out. Annoying. Recoverable. Nothing lost.

I spent a while convinced this was the harness's fault, because under a stripped-down 60-line agent loop the 30B went three-for-three clean. That was luck at n=3 — it clobbered twice more as soon as I ran more samples. What the harness *does* affect is speed: both models run roughly twice as fast against three tools and a one-sentence prompt than against a full agent prompt. That gap should mostly close behind a server with real prefix caching, so don't read it as an argument against the harness.

Two of my own bugs are in that table's history. My first verifier compared `"8.0"` to the string `"8"` and failed a correct answer; my minimal harness returned only stdout, so a model got an empty string where a traceback should have been and cheerfully declared success. Both made a model look worse than it was. If you build one of these, make the tool return the exit code and stderr, and compare numbers as numbers.

## What I run

```json
{
  "provider": { "ollama": {
    "npm": "@ai-sdk/openai-compatible",
    "options": { "baseURL": "http://localhost:11434/v1" },
    "models": { "qwen3-agent:14b": { "tools": true,
      "limit": { "context": 24576, "output": 8192 } } }
  }},
  "model": "ollama/qwen3-agent:14b",
  "permission": { "edit": "ask" }
}
```

The model is stock `qwen3:14b` with `num_ctx` raised to 24576 — the default 4k breaks tool calling outright, and anything under ~16k leaves no room to work. And `edit: ask`, which I would keep on even if I'd never seen a model type `rm`.

## Where it ended up

The laptop no longer runs only the agent. The same Ollama service now also backs a private chat app — a ChatGPT-style web UI on the same 16 GB card, reachable from a phone, with nothing leaving the machine except the chat traffic itself.

It is two user systemd services and no Docker. Ollama serves on `127.0.0.1:11434`, [Open WebUI](https://openwebui.com) sits in front of it on `127.0.0.1:8080` — started with `uvx`, which fetches its own Python 3.11 — and both are enabled with lingering on, so they come up when WSL does, without anyone logging in or running anything. Everything lives under `$HOME`; none of it needed admin rights.

Getting it off the laptop is one command. Tailscale Funnel publishes port 8080 as HTTPS on a `*.ts.net` name:

```powershell
& 'C:\Program Files\Tailscale\tailscale.exe' funnel --bg 8080
```

No router ports are open and both services listen on loopback only, so the tailnet is the only way in — and `funnel --bg off` takes the site off the internet immediately without touching anything else. The `--bg` flag is supposed to make the funnel stick; I have watched it switch itself off without a reboot, so `funnel status` is part of the routine rather than something I check once the link is already dead.

The served model is `qwen3:14b` again, rebuilt with the thinking step disabled: in a chat UI the long silent pause before the first token reads as a hang. Sign-ups are closed, new accounts would land as *pending* for approval, only that one model is visible, and API keys and web search are off. But the login page is on the public internet with no rate limiting in front of it, which makes the admin password the actual security boundary. That is worth being clear-eyed about before sharing the link with anyone.

And the budget from the top of this post is still the whole story. The chat model holds 13 GB of the 16 GB, so the agent and the chat app cannot both be resident — start one while the other is loaded and Ollama swaps them in and out and everything crawls. One at a time. A cold start is 30–60 seconds while 13 GB moves onto the card and then under a second to first token, which is the one thing worth warning people about, or they assume it is broken.

## What I'd keep

The honest summary is that this setup is good for boilerplate, single-file edits and scratch work, and it is not close to a frontier model on anything requiring a plan held across many turns. That's the trade for it running on a plane.

The part I did not expect to keep is the chat UI. A 14B model is more than good enough for the questions people actually put to one, and once it is up there is a private, ad-free chat interface that the people I share it with can use for nothing — no subscription, no per-seat price, no account with anyone. That has turned out to be worth more to me than the agent is.
