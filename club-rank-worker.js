'use strict';
/*
 * Recompute the same club aggregation and ranking formula as
 * scripts/club_analytics.py using verified team rows from data/clubs.json.
 * Work is performed off the UI thread. This file is a dedicated Web Worker.
 */
const CATEGORIES = Object.freeze(['A', 'AA', 'AAA']);
const FIELDS = Object.freeze(['gp', 'w', 'l', 't', 'gf', 'ga', 'pts']);
// CPython 3.12 uses Neumaier-compensated float summation in sum().
 // Match that engine exactly: naive JS reduce() shifts a few tied clubs by 1 ULP
 // and can incorrectly outrank a stronger win-percentage tiebreaker.
function pythonSum(values) {
  let total = 0, correction = 0;
  for (const value of values) {
    const next = total + value;
    if (Math.abs(total) >= Math.abs(value)) correction += (total - next) + value;
    else correction += (value - next) + total;
    total = next;
  }
  return total + correction;
}
const mean = values => values.length ? pythonSum(values) / values.length : null;

function categoryOf(team) {
  // All verified division identifiers are uNN-a-east, uNN-aa-west, uNN-aaa,
  // or u17/u18-aa. Use the exact middle segment; AA must never match A.
  const category = String(team.slug).split('-')[1]?.toUpperCase();
  if (!CATEGORIES.includes(category)) {
    throw new Error('Invalid verified team division: ' + String(team.slug).slice(0, 80));
  }
  return category;
}

function rankClubs(sourceClubs, selectedCategories) {
  if (!Array.isArray(sourceClubs) || !Array.isArray(selectedCategories) ||
      selectedCategories.length < 1 ||
      new Set(selectedCategories).size !== selectedCategories.length ||
      selectedCategories.some(category => !CATEGORIES.includes(category))) {
    throw new Error('Invalid club category selection');
  }
  const selected = new Set(selectedCategories);
  const results = [];
  for (const club of sourceClubs) {
    const teams = club.teams.filter(team => selected.has(categoryOf(team)));
    if (!teams.length) continue;
    const totals = Object.fromEntries(
      FIELDS.map(field => [field, teams.reduce((total, team) => total + team[field], 0)])
    );
    const validPercentiles = teams.map(team => team.percentile).filter(value => value !== null);
    const gp = totals.gp;
    results.push({
      ...club,
      teams,
      includedTeams: teams.length,
      coverage: 'complete',
      coverageComplete: true,
      totals,
      winPct: gp ? (totals.w + totals.t * 0.5) / gp * 100 : null,
      averageLeagueRank: mean(teams.map(team => team.leagueRank)),
      averagePowerRank: mean(teams.map(team => team.powerRank)),
      averagePowerRating: mean(teams.map(team => team.powerRating)),
      averageMomentum: mean(teams.map(team => team.momentum)),
      averagePercentile: mean(validPercentiles),
      excludedPercentiles: teams.length - validPercentiles.length,
      rank: null
    });
  }
  const eligible = results.filter(club => club.averagePercentile !== null);
  eligible.sort((a, b) => {
    // Exact same ranking order as the Python exporter: average percentile,
    // club Win %, average Power Rank, then canonical club name.
    if (a.averagePercentile !== b.averagePercentile) return b.averagePercentile - a.averagePercentile;
    const aWin = a.winPct === null ? -1 : a.winPct;
    const bWin = b.winPct === null ? -1 : b.winPct;
    if (aWin !== bWin) return bWin - aWin;
    if (a.averagePowerRank !== b.averagePowerRank) return a.averagePowerRank - b.averagePowerRank;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
  eligible.forEach((club, index) => { club.rank = index + 1; });
  results.sort((a, b) => {
    if (a.rank === null) return b.rank === null ? (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) : 1;
    if (b.rank === null) return -1;
    return a.rank - b.rank;
  });
  return results;
}

let verifiedClubs = null;
self.onmessage = event => {
  const message = event.data;
  if (message.type === 'init') {
    verifiedClubs = message.clubs;
    self.postMessage({type: 'ready'});
    return;
  }
  if (message.type !== 'rank') return;
  try {
    if (!verifiedClubs) throw new Error('Verified club data has not loaded');
    const clubs = rankClubs(verifiedClubs, message.categories);
    self.postMessage({type: 'ranked', requestId: message.requestId, categories: message.categories,
      clubs, includedTeams: clubs.reduce((total, club) => total + club.includedTeams, 0)});
  } catch (error) {
    self.postMessage({type: 'error', requestId: message.requestId,
      message: String(error.message || error).slice(0, 200)});
  }
};
