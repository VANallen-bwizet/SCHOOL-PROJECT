# Mathematical verification report

## Dataset
Simulated baseline: 100 students, 6 organizations, 250 unique memberships. Live edits may give different results; this report does not change the saved database.

U = all students; A = Computer Science Club; B = Arts Guild. |U| = 100, |A| = 50, |B| = 34.

## Set results
| Operation | Rule | Cardinality |
| --- | --- | ---: |
| Union | In A or B; count once | 75 |
| Intersection | In every selected set | 9 |
| A − B | In A, outside B | 41 |
| B − A | In B, outside A | 25 |
| Symmetric difference | In A or B, excluding both | 66 |
| Complement of A | U − A | 50 |

Check: |A ∪ B| = 50 + 34 − 9 = 75. Subset checks every ID; superset reverses the check. Equal sets satisfy both. Matching counts alone do not prove equality.

## Power sets and duplicates
Each new element doubles the subsets: |P(S)| = 2^|S|. For {1,2,3}, there are 8 subsets; the empty set has one. Limit: 10 unique IDs, or 1,024 subsets.

Duplicate cleanup keeps one copy of each student–organization pair. Different organizations remain valid memberships. SQLite prevents saved duplicate pairs.

## De Morgan verification
| Law | Left count | Right count | Direct count | Same IDs |
| --- | ---: | ---: | ---: | --- |
| (A ∪ B)ᶜ = Aᶜ ∩ Bᶜ | 25 | 25 | 25 | PASS |
| (A ∩ B)ᶜ = Aᶜ ∪ Bᶜ | 91 | 91 | 91 | PASS |

For any student x: outside the union means outside A AND outside B; outside the intersection means outside A OR outside B. This proves the identities. Independent direct loops and equivalent expressions compare actual IDs.

Sample verification: 256 subset pairs, 512 checks, 0 failures. This sample supports the general proof above. Full IDs: verification-results.json.

## Committees
C(n,k) = n! / (k!(n−k)!), for unordered groups without replacement. BigInt keeps counts exact. Included pools use union; exclusions remove students before counting.

Exclude Computer Science Club: n = 50; C(50,3) = 19600. C(n,0) = 1; k > n gives 0.

## Sets and relations
- Set: unique values, such as S = {1,2}.
- Cartesian product: every ordered pair in S × O. Two students and two organizations give four pairs.
- Relation: actual memberships R ⊆ S × O.

## Analytics
Jaccard = |A ∩ B| / |A ∪ B|; two empty sets score 1. Participation counts unique clubs; overlap rankings count shared students once per club. Recommendations exclude joined clubs and combine interest match (60%) with membership similarity (40%). One available signal gets full weight. Scores are matches, not probabilities.
  