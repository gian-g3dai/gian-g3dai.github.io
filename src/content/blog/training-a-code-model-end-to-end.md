---
title: "Fine-tuning a code model end to end"
description: "What it actually takes to train a code LLM in-house: the data pipeline that turns out to be most of the work, FSDP and LoRA-aware sharding, the kernels that buy back memory, and getting the thing served. A tour of the repo behind it."
pubDate: 2026-09-19
tags: ["llm", "fine-tuning", "distributed training", "gpu", "inference"]
---

For about three years at Unakin we trained our own code models — the ones behind Sawyer, an agent that writes and iterates on game code inside Unity. We didn't do this because training your own model is fun. We did it because in 2023 nothing off the shelf knew C# in a Unity project well enough to be useful, and the gap was big enough to be worth closing ourselves.

[LLM-Research](https://github.com/gian-g3dai/LLM-Research) is what came out of it: a research repo for fine-tuning and extended pre-training of Code Llama and Llama 2/3 on our own 8× A100 cluster. It's a research repo in the honest sense — there are files in there called `tt.py` and `pnk.py` — but the shape of it is a decent map of what this work actually involves. This is the tour.

## Most of it is data

The single most surprising thing, if you come to this expecting the interesting part to be the model: roughly half the package is data plumbing. `unakin/llm/_data/datasources/` holds around forty of them — GitHub code, C# repos and pull requests, Godot code, Unity docs and Q&A, CommitPackFT, SWE-bench, RedPajama, Stack Exchange, Open Platypus, Dolly, Magpie, HotpotQA. Each is a small class that knows how to pull its source and normalise it into the same record shape, behind a `dataset_factory` that assembles mixtures from config.

That structure exists because the ratio between these sources *is* the experiment. Changing the proportion of Unity-specific code to general code changes the model more than most hyperparameters will, and if mixing is a config file rather than a rewrite, you can actually test that. There's also `mine_pdf.py`, which exists because a chunk of the domain knowledge we needed only existed as PDFs.

If you're starting this kind of project, budget accordingly. The training loop is a week. The data pipeline is the rest of the year.

## Making it fit

We trained Code Llama 13B and 34B, and later Llama 3 8B, across 8× A100s — full fine-tuning, extended pre-training, and LoRA, depending on the run. That means PyTorch FSDP (`unakin/llm/distributed/`), with a second implementation alongside the first because FSDP's own API moved underneath us, plus tensor parallelism for the cases where sharding data wasn't enough.

The part that took real work was LoRA under FSDP. The default sharding assumes every parameter is a training citizen; with adapters, the frozen base weights and the tiny trainable adapters want to be treated differently, and getting the wrapping and the optimizer state to agree took custom, LoRA-aware sharding plus a fused LoRA path (`adapters/fused_lora.py`). Adjacent to that sits a pile of unglamorous work that nobody writes blog posts about: checkpoint conversion between Meta's format, ours and safetensors (`scripts/convert_*.py`), resumable checkpointing, and mixed-precision optimizers — including an AdamW with Kahan summation, because at bf16 the optimizer quietly loses updates to rounding.

## Buying back memory in the loss

The previous version of this post was entirely about one kernel, so here's the short version, because it's the piece I'd still recommend to anyone training at a large vocabulary.

At a 128k vocabulary, the logits tensor produced by the LM head — shape `(batch × seq, vocab)`, in fp32, and again for its gradient — is frequently the largest activation in the whole forward pass. Bigger than any attention block. It's the thing that OOMs you.

Cross-entropy is a sum over tokens, so nothing requires computing all of them at once. Chunk the tokens, compute the loss per chunk, accumulate, and let each chunk's logits be freed before the next is allocated (`split_ce.py`). Peak memory drops to one chunk instead of the full tensor. Fusing the projection, softmax and loss into a single Triton kernel (`kernels/cross_entropy.py`, `adapters/triton_ce.py`) goes further — the intermediate never touches HBM at all. Together that cut loss memory by about half and let us roughly double the batch size on the same GPUs, which is free throughput.

The general lesson is the useful bit: **the loss is an activation too**, and at a large vocabulary it's often the biggest one. The same repo has the same instinct applied elsewhere — fused projections, memory-efficient dropout, custom norms, CUDA graphs over the Llama forward pass to cut launch overhead.

## The experiment is the config

Every run is a stack of config files: model, optimizer, adapter, dataset mixture, parallelism strategy, checkpointing, logging. The second iteration (`recipes_2/`) moved this to composable YAML groups with W&B logging attached.

This sounds like bookkeeping and it is, but it's the difference between "we think the 34B run with the new mixture was better" and knowing. A training run you can't reproduce exactly is an anecdote.

## Getting it served

A checkpoint isn't a product. [Poseidon-Triton](https://github.com/gian-g3dai/Poseidon-Triton) is the other half: compile the weights into a TensorRT-LLM engine, build the Triton Inference Server container around it, deploy. Three scripts, because by the fifth time you do this by hand you've made a different mistake each time.

The client side lived back in the training repo (`unakin/deployment/triton/`) — a proxy server in front of Triton, chat-to-token conversion so prompt templating matches training exactly, auth, and request logging into Elastic. That last one matters more than it sounds: production traffic is the only honest source of evaluation data, and the fastest way to find out your model is bad in a way your benchmark never tested.

## What I'd keep

If I rebuilt this today, most of the infrastructure would be someone else's problem — that layer has gotten genuinely good. What I'd keep is the shape: datasources as swappable components, the run fully described by config, and the willingness to go down to the kernel when a single tensor is standing between you and twice the batch size. Those three haven't aged, and they're the same instincts I'm now applying a layer up, to training agents with RL.
