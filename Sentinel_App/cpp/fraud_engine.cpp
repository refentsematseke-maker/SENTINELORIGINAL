/* ==========================================================================
   SENTINEL — cpp/fraud_engine.cpp

   Standalone C++ implementation of the same anti-fraud / duplicate-report
   detection algorithm used in js/fraudEngine.js and server/server.js.

   WHY THIS FILE EXISTS
   The web app runs entirely in JavaScript (a browser cannot execute C++
   directly), so this program is not wired live into index.html. It exists
   to (a) demonstrate the core detection algorithm implemented as a fast,
   dependency-free, compiled module, and (b) show the team can express the
   same logic outside the browser — e.g. as a future high-performance
   scoring microservice the Node backend could shell out to, or call over a
   small socket/FFI boundary, once report volume made a compiled scorer
   worthwhile.

   WHAT IT DOES
   Reads a small hard-coded set of sample reports (stand-ins for rows that
   would come from the database), then for each new report:
     1. Runs a keyword / spam heuristic content check.
     2. Computes Jaccard word-overlap similarity against existing reports
        to flag likely duplicates ("AI matched N related reports").
     3. Prints a simple risk verdict.

   BUILD & RUN
     g++ -std=c++17 -O2 -o fraud_engine fraud_engine.cpp
     ./fraud_engine
   ========================================================================== */

#include <iostream>
#include <string>
#include <vector>
#include <set>
#include <sstream>
#include <algorithm>
#include <cctype>

struct Report {
    int id;
    std::string title;
    std::string description;
};

// Lower-cases a string.
std::string toLower(const std::string& s) {
    std::string out = s;
    std::transform(out.begin(), out.end(), out.begin(), [](unsigned char c) { return std::tolower(c); });
    return out;
}

// Splits text into a set of lowercase "words" on any non-alphanumeric run.
std::set<std::string> wordSet(const std::string& text) {
    std::set<std::string> words;
    std::string lower = toLower(text);
    std::string current;
    for (char c : lower) {
        if (std::isalnum(static_cast<unsigned char>(c))) {
            current += c;
        } else if (!current.empty()) {
            words.insert(current);
            current.clear();
        }
    }
    if (!current.empty()) words.insert(current);
    return words;
}

// Jaccard similarity: |intersection| / |union|, in [0, 1].
double jaccardSimilarity(const std::string& a, const std::string& b) {
    std::set<std::string> setA = wordSet(a);
    std::set<std::string> setB = wordSet(b);
    if (setA.empty() || setB.empty()) return 0.0;

    std::vector<std::string> intersection;
    std::set_intersection(setA.begin(), setA.end(), setB.begin(), setB.end(), std::back_inserter(intersection));

    std::vector<std::string> unionSet;
    std::set_union(setA.begin(), setA.end(), setB.begin(), setB.end(), std::back_inserter(unionSet));

    return unionSet.empty() ? 0.0 : static_cast<double>(intersection.size()) / static_cast<double>(unionSet.size());
}

struct ContentCheck {
    bool isValid;
    int score;
    std::vector<std::string> reasons;
};

// Same suspicious-keyword + low-detail heuristic as the JS/Node versions.
ContentCheck checkContent(const std::string& text) {
    static const std::vector<std::string> suspiciousWords = { "fake", "prank", "hoax", "joke" };
    std::string lower = toLower(text);
    int score = 100;
    std::vector<std::string> reasons;

    for (const auto& w : suspiciousWords) {
        if (lower.find(w) != std::string::npos) {
            score -= 40;
            reasons.push_back("Contains flagged phrase: \"" + w + "\"");
        }
    }
    if (lower.size() < 12) {
        score -= 25;
        reasons.push_back("Description is very short / low detail.");
    }
    if (score < 0) score = 0;
    return { score > 50, score, reasons };
}

// Finds existing reports related to newText above a similarity threshold,
// sorted by descending similarity — mirrors AntiFraudEngine.findRelated().
std::vector<std::pair<Report, double>> findRelated(const std::string& newText,
                                                     const std::vector<Report>& existing,
                                                     double threshold = 0.18) {
    std::vector<std::pair<Report, double>> matches;
    for (const auto& r : existing) {
        double score = jaccardSimilarity(newText, r.title + " " + r.description);
        if (score >= threshold) matches.push_back({ r, score });
    }
    std::sort(matches.begin(), matches.end(), [](const auto& a, const auto& b) { return a.second > b.second; });
    return matches;
}

void printVerdict(const Report& incoming, const std::vector<Report>& database) {
    std::cout << "\n--- Screening report #" << incoming.id << ": \"" << incoming.title << "\" ---\n";

    ContentCheck check = checkContent(incoming.title + " " + incoming.description);
    std::cout << "Content score: " << check.score << "/100 -> "
              << (check.isValid ? "PASSED" : "REJECTED") << "\n";
    for (const auto& reason : check.reasons) std::cout << "  - " << reason << "\n";

    auto related = findRelated(incoming.title + " " + incoming.description, database);
    if (related.empty()) {
        std::cout << "No closely related existing reports found.\n";
    } else {
        std::cout << "AI matched " << related.size() << " related report(s):\n";
        for (const auto& [report, score] : related) {
            std::cout << "  - #" << report.id << " \"" << report.title << "\" (similarity "
                      << static_cast<int>(score * 100) << "%)\n";
        }
    }
}

int main() {
    // Sample "existing database" rows, mirroring js/data.js DEMO_POSTS.
    std::vector<Report> database = {
        { 1, "Suspicious Silver Polo near Campus Gate",
          "Unregistered silver VW Polo idling near the primary student drop-off point." },
        { 2, "Missing black Dell backpack with research drives",
          "Left unattended for under 5 minutes at the library learning commons." },
        { 3, "Community alert: attempted break-in, Block C residence",
          "Two individuals attempted to force a ground-floor window at approximately 02:40." }
    };

    // Sample incoming reports to screen: one legitimate-looking duplicate-ish
    // report, and one that should be rejected by the content heuristic.
    std::vector<Report> incoming = {
        { 101, "Silver Polo circling student dropoff again",
          "Same silver Polo from last night idling near campus gate, driver watching students." },
        { 102, "This is fake just a prank report",
          "haha just testing, ignore this, it's a joke" }
    };

    std::cout << "SENTINEL fraud_engine.cpp — anti-fraud / duplicate detection demo\n";
    std::cout << "===================================================================\n";

    for (const auto& r : incoming) {
        printVerdict(r, database);
    }

    std::cout << "\nDone. This algorithm is mirrored in js/fraudEngine.js (client-side)\n";
    std::cout << "and server/server.js (server-side, authoritative).\n";
    return 0;
}
