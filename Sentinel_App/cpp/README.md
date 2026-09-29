# fraud_engine.cpp

A standalone C++ console program that re-implements Sentinel's anti-fraud /
duplicate-report detection algorithm (keyword screening + Jaccard word-overlap
similarity) outside the browser.

It is **not** wired into `index.html` — a web page cannot execute C++ directly.
It exists to demonstrate the algorithm as a fast, dependency-free compiled
module, e.g. as a future scoring microservice.

## Build & run

```bash
g++ -std=c++17 -O2 -o fraud_engine fraud_engine.cpp
./fraud_engine
```

On Windows with MinGW:

```bash
g++ -std=c++17 -O2 -o fraud_engine.exe fraud_engine.cpp
fraud_engine.exe
```

## What it prints

For two sample incoming reports, it prints a content-quality score (0-100),
whether the report passes or is rejected, and any existing reports it's
similar enough to be flagged as related/possible duplicates — the same
"AI matched N related reports" logic shown in the web app's AI Insight
banner.
