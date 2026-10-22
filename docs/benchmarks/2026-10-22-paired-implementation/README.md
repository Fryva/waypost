# Paired implementation microbenchmark (2026-10-22)

A handcrafted scheduling module; not a product/security benchmark. Both outputs
passed214/214fixed checks and blinded equivalent-quality acceptance.

With Waypost workflow249377native tokens; direct workflow81382; common blind
assessment82352. Difference167995, ratio3.064277. All repairs are counted; none
were necessary. See the research report for preparation cost and limitations.

Run either source against the same corpus (Node25.6.1/macOS verified):

```sh
node acceptance.mjs with-waypost.mjs
node acceptance.mjs without-waypost.mjs
```

Run from this directory. Task/protocol/result.json preserve the registered scope.
No dependency install is needed. These sources are isolated experiment outputs,
not changes to Waypost production code.
