// Pure best-score helper, shared by the game loop and the regression test.
// No DOM, no storage: the caller owns reading and writing the stored value.
export function nextBest(previousBest, score) {
  const prev = Number.isFinite(previousBest) ? previousBest : 0;
  const cur = Number.isFinite(score) ? score : 0;
  return Math.max(prev, cur);
}
