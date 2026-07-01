---
title: "Cutting cross-entropy memory in half at a 128k vocabulary"
description: "At large vocabularies the LM head and its loss quietly dominate activation memory. Chunking the cross-entropy computation gets most of it back — and buys you roughly 2× the batch size."
pubDate: 2026-06-20
tags: ["distributed training", "gpu", "pytorch"]
---

There's a memory cost in language-model training that's easy to miss because it doesn't live in the parameters. It lives in a single tensor: the logits produced by the LM head just before the loss. At small vocabularies nobody notices. At a 128k vocabulary it can be the largest activation in the whole forward pass — larger than any attention or MLP block — and it's the first thing to blow up your batch size.

This is a short write-up of why that happens and the simplest fix that actually works: chunking the cross-entropy so the full logits tensor never has to exist at once.

## Where the memory goes

Take a batch of `B` sequences of length `T`, a hidden size `H`, and a vocabulary of size `V`. The final hidden states are shaped `(B, T, H)`. To get token probabilities you project them through the unembedding matrix `(V, H)`, producing logits of shape `(B, T, V)`.

That logits tensor is the problem. With `B·T` on the order of tens of thousands of tokens and `V` at 128k, you're materializing something with billions of entries — in fp32 for the loss, and again for its gradient. On a training step where the rest of the model fits comfortably, this one tensor is what pushes you into an out-of-memory error.

The usual reactions are to shrink the batch or shard the vocabulary across devices. Both work, but both cost you something you'd rather keep: throughput, or communication.

## The fix: never build the whole thing

The key observation is that cross-entropy is a **sum over tokens**. Nothing requires you to compute every token's logits simultaneously. You can walk through the tokens in chunks, compute the loss for each chunk, accumulate, and let each chunk's logits be freed before the next one is allocated. Peak memory drops to the size of a single chunk rather than the full `(B·T, V)` tensor.

Here's the idea in plain PyTorch — flatten the batch and sequence dimensions into one axis of `N = B·T` tokens, then stride over it:

```python
import torch
import torch.nn.functional as F

def chunked_cross_entropy(hidden, weight, targets, chunk_size=1024):
    # hidden:  (N, H)  final-layer activations, flattened over batch * seq
    # weight:  (V, H)  the LM head / unembedding matrix
    # targets: (N,)    ground-truth token ids
    total = hidden.new_zeros(())
    for start in range(0, hidden.size(0), chunk_size):
        end = start + chunk_size
        logits = hidden[start:end] @ weight.T      # (chunk, V) — the expensive part
        total = total + F.cross_entropy(
            logits.float(), targets[start:end], reduction="sum"
        )
    return total / hidden.size(0)
```

The full-vocabulary `logits` now only ever exists for `chunk_size` tokens at a time. Pick the chunk to trade a little launch overhead for a lot of headroom. In our training that alone was the difference between an OOM and comfortably fitting — and once the loss stopped dominating memory, we could roughly **double the batch size**, which is free throughput on the same hardware.

## Why a Triton kernel, eventually

Chunking in PyTorch gets you most of the win, but you still pay to write each chunk's logits to global memory and read them back for the backward pass. The next step is to fuse the projection, the softmax, and the loss into a single kernel that keeps the chunk's logits in on-chip memory and never spills the full tensor at all — computing the gradient in the same pass. That's where writing a custom [Triton](https://github.com/triton-lang/triton) kernel earns its keep: same mathematical result, but the expensive intermediate simply never touches HBM.

I'll write that one up separately, because the interesting parts — the online softmax, the backward derivation, getting numerics right in a single pass — deserve their own post. For now, the takeaway is smaller: **the loss is an activation too, and at a large vocabulary it's often the biggest one.** Treat it like any other memory hotspot and the batch size you thought you couldn't afford is usually right there.
