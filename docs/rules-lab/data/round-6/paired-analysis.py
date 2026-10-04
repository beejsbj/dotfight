#!/usr/bin/env python3
"""Round 6b descriptive and seed-paired statistics; standard library only."""
import argparse
import json
import math
import statistics
import sys
from collections import defaultdict
from pathlib import Path

DEFAULT_ROOT = Path(__file__).resolve().parents[4]
SHIPPED = ['long long baseline', 'long ssssss:mix', 'long tttttt:mix',
           'long pppppp:mix', 'long hhhhhh:mix', 'long cccccc:mix', 'long ssssss:tttttt']
BASE_TAGS = ['square8', 'cone026', 'cone08', 'pentagon6', 'walk3000', 'walk12000', 'prism8']
MATCH_TAGS = [('ssssss', 'square8'), ('tttttt', 'cone026'), ('tttttt', 'cone08'),
              ('tttttt', 'pentagon6'), ('pppppp', 'prism8')]
EXPECTED = SHIPPED + ['long baseline ' + t for t in BASE_TAGS] + [
    'long ' + k + ':mix ' + t for k, t in MATCH_TAGS] + ['long hhhhhh:cccccc', 'long hhhhhh:tttttt']
FIELDS = ('turns flicks snipes lunges sends stops roadKills walkersSent banks splits jolts rules homes '
          'ruledFlicks ruledKills homeFlicks homeKills army convoyTurns walkerTurns bentFlicks wellBent '
          'rode rodeFoe crashes offPage doubles longestTurn arranged outside').split()
PAIRED_FIELDS = ['turns', 'rules', 'homes', 'roadKills', 'walkersSent', 'sends', 'banks', 'splits',
                 'ruledFlicks', 'homeFlicks']


def ratio(a, b, scale=1):
    return scale * a / b if b else None


def estimate(xs):
    return {'n': len(xs), 'mean': statistics.mean(xs) if xs else None,
            'se': statistics.stdev(xs) / math.sqrt(len(xs)) if len(xs) > 1 else None}


def rate(wins, n):
    p = ratio(wins, n)
    return {'wins': wins, 'decided': n, 'win_pct': None if p is None else 100 * p,
            'binomial_se_pct': None if p is None else 100 * math.sqrt(p * (1-p) / n)}


def quantile(xs, p):
    return sorted(xs)[min(len(xs)-1, math.floor(p*len(xs)))] if xs else None


def key(r):
    return (r['seed'], bool(r.get('swap', False)))


def kit_score(r, kit, half=False):
    if r['winner'] == -1:
        return 0.5 if half else None
    return float(r['kits'][r['winner']] == kit)


def summary(rows):
    decided = [r for r in rows if r['winner'] != -1]
    totals = {f: sum(r[f] for r in rows) for f in FIELDS}
    out = {'games': len(rows), 'seeds': sorted({r['seed'] for r in rows}),
           'swap_games': sum(bool(r.get('swap')) for r in rows),
           'stalled': len(rows)-len(decided), 'stalled_pct': ratio(len(rows)-len(decided), len(rows), 100),
           'stalled_records': [{'seed': r['seed'], 'swap': bool(r.get('swap')), 'turns': r['turns']} for r in rows if r['winner'] == -1],
           'first_player': rate(sum(r['winner'] == 0 for r in decided), len(decided)),
           'per_game': {f: estimate([r[f] for r in rows]) for f in FIELDS}, 'totals': totals}
    out['per_game']['turns'].update({f'p{int(p*100)}': quantile([r['turns'] for r in rows], p) for p in (0.1, 0.5, 0.9)})
    kills = sum(sum(r['perFlick']) for r in rows)
    out['totals']['kills'] = kills
    out['pooled'] = {'kills_per_flick': ratio(kills, totals['flicks']),
        'walker_loss_pct': ratio(totals['roadKills'], totals['walkersSent'], 100),
        'ruled_kills_per_flick': ratio(totals['ruledKills'], totals['ruledFlicks']),
        'home_kills_per_flick': ratio(totals['homeKills'], totals['homeFlicks']),
        'ruled_flick_pct': ratio(totals['ruledFlicks'], totals['flicks'], 100),
        'home_flick_pct': ratio(totals['homeFlicks'], totals['flicks'], 100),
        'lunge_pct': ratio(totals['lunges'], totals['flicks'], 100),
        'snipe_pct': ratio(totals['snipes'], totals['flicks'], 100),
        'road_kills_per_walker_turn': ratio(totals['roadKills'], totals['walkerTurns']),
        'road_kills_per_convoy_turn': ratio(totals['roadKills'], totals['convoyTurns'])}
    kits = sorted({k for r in rows if r.get('kits') and r['kits'][0] != r['kits'][1] for k in r['kits']})
    out['kits'] = {}
    for kit in kits:
        games = [r for r in rows if r.get('kits') and r['kits'][0] != r['kits'][1] and kit in r['kits']]
        by_seed = defaultdict(list)
        for r in games:
            by_seed[r['seed']].append(r)
        wins = sum(kit_score(r, kit) or 0 for r in games)
        n = sum(r['winner'] != -1 for r in games)
        # Equal seed weights; seeds with a stall use only their decided seat(s).
        means = [statistics.mean(v) for rs in by_seed.values()
                 if (v := [kit_score(r, kit) for r in rs if r['winner'] != -1])]
        e = estimate([100*v for v in means])
        complete = {s: rs for s, rs in by_seed.items() if {key(r)[1] for r in rs} == {False, True}
                    and all(r['winner'] != -1 for r in rs)}
        ce = estimate([100*statistics.mean(kit_score(r, kit) for r in rs) for rs in complete.values()])
        out['kits'][kit] = {**rate(wins, n), 'games': len(games), 'stalled': len(games)-n,
            'seed_equal_weight_decided': {'n_seeds': e['n'], 'win_pct': e['mean'], 'clustered_se_pct': e['se'],
                'policy': 'Mean each seed over its decided seats; omit seeds with no decided seat. This mean may differ from pooled rate.'},
            'complete_decided_seeds': {'n_seeds': ce['n'], 'win_pct': ce['mean'], 'clustered_se_pct': ce['se'],
                'excluded_seeds': sorted(set(by_seed)-set(complete))},
            'seed_seat_counts': {str(s): {'games': len(rs), 'decided': sum(r['winner'] != -1 for r in rs)} for s, rs in sorted(by_seed.items())}}
    return out


def paired(treatment, control, groups, swapped):
    t = {key(r): r for r in groups.get(treatment, []) if 1 <= r['seed'] <= 120}
    c = {key(r): r for r in groups.get(control, []) if 1 <= r['seed'] <= 120}
    seats = [False, True] if swapped else [False]
    seeds, missing = [], []
    for s in range(1, 121):
        absent = [{'label': label, 'swap': seat} for label, lookup in ((treatment,t),(control,c)) for seat in seats if (s,seat) not in lookup]
        if absent:
            missing.append({'seed': s, 'missing': absent})
        else:
            seeds.append(s)
    def delta(fn, use_seeds):
        return estimate([statistics.mean(fn(t[s,seat])-fn(c[s,seat]) for seat in seats) for s in use_seeds])
    out = {'treatment': treatment, 'control': control, 'expected_n_seeds': 120, 'n_seeds': len(seeds),
           'complete': len(seeds) == 120, 'seeds': seeds, 'missing': missing,
           'unit': 'seed; mean of both seat differences' if swapped else 'seed; unswapped game',
           'differences': {f: delta(lambda r, f=f: r[f], seeds) for f in PAIRED_FIELDS}}
    decided_seeds = [s for s in seeds if all(lookup[s,seat]['winner'] != -1 for lookup in (t,c) for seat in seats)]
    exclusions = [{'seed': s, 'stalls': [{'label': label, 'swap': seat} for label, lookup in ((treatment,t),(control,c)) for seat in seats if lookup[s,seat]['winner'] == -1]} for s in seeds if s not in decided_seeds]
    out['first_player_difference'] = {'main_decided': delta(lambda r: 100*float(r['winner'] == 0), decided_seeds),
        'exclusions': exclusions, 'units': 'percentage points',
        'sensitivity_stalls_half': delta(lambda r: 50 if r['winner'] == -1 else 100*float(r['winner'] == 0), seeds)}
    if swapped:
        kits = sorted({kit for lookup in (t,c) for s in seeds for seat in seats for kit in lookup[s,seat].get('kits', [])})
        out['kit_win_differences'] = {}
        for kit in kits:
            if not all(kit in lookup[s,seat].get('kits', []) for lookup in (t,c) for s in seeds for seat in seats):
                continue
            def raw(lookup):
                rs = [lookup[s,seat] for s in decided_seeds for seat in seats]
                return rate(sum(kit_score(r,kit) for r in rs), len(rs))
            out['kit_win_differences'][kit] = {'units': 'percentage points',
                'main_complete_decided': delta(lambda r: 100*kit_score(r,kit), decided_seeds),
                'excluded_stalled_seeds': exclusions, 'matched_complete_seed_raw_rates': {'treatment': raw(t), 'control': raw(c)},
                'sensitivity_stalls_half': delta(lambda r: 100*kit_score(r,kit,True), seeds)}
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=DEFAULT_ROOT)
    parser.add_argument('--raw-dir', type=Path, help='Overrides ROOT/docs/rules-lab/data/round-6/raw')
    args = parser.parse_args()
    raw = args.raw_dir or args.root / 'docs/rules-lab/data/round-6/raw'
    paths = sorted(raw.glob('*.json'))
    if not paths:
        raise ValueError(f'No raw JSON files in {raw}')
    groups, seen, configurations = defaultdict(list), {}, {}
    for path in paths:
        data = json.loads(path.read_text())
        config = {k: data.get(k) for k in ('rules', 'stances', 'agents', 'maxTurns', 'kits', 'swap')}
        for label, records in data['games'].items():
            if label in configurations and configurations[label] != config:
                raise ValueError(f'Configuration mismatch for {label}: {path}')
            configurations[label] = config
            for r in records:
                if r['label'] != label or r['winner'] not in (-1,0,1):
                    raise ValueError(f'Invalid record label/winner: {path}')
                identity = (label, *key(r))
                if identity in seen:
                    raise ValueError(f'Duplicate label+seed+swap {identity}: {seen[identity]} and {path}')
                if len(r['perFlick']) != r['flicks']:
                    raise ValueError(f'perFlick length mismatch: {identity}')
                for field in FIELDS:
                    if field not in r:
                        raise ValueError(f'Missing {field}: {identity}')
                seen[identity] = str(path)
                groups[label].append(r)
    comparisons = [paired('long baseline '+tag, 'long long baseline', groups, False) for tag in BASE_TAGS]
    comparisons += [paired('long '+kit+':mix '+tag, 'long '+kit+':mix', groups, True) for kit,tag in MATCH_TAGS]
    result = {'schema_version': 1, 'raw_directory': str(raw), 'files': [str(p) for p in paths],
        'validation': {'duplicate_seed_swap_absent': True, 'configurations_consistent_per_label': True,
                       'total_games': len(seen), 'missing_expected_labels': sorted(set(EXPECTED)-set(groups)),
                       'unexpected_labels': sorted(set(groups)-set(EXPECTED))},
        'definitions': {'pct': 'percentage; pct SE values are percentage points',
            'sample_se': 'sample SD / sqrt(n); null for n < 2',
            'p90': 'sorted[floor(0.9*N)] capped at N-1',
            'pooled': 'ratio of summed numerator to summed denominator; null for denominator zero',
            'paired': 'treatment minus control, restricted to seeds 1-120; swapped seats averaged within seed',
            'binomial_se': '100*sqrt(p*(1-p)/decided); harness approximation, ignores seed clustering'},
        'full_labels': {label: summary(rows) for label,rows in sorted(groups.items())},
        'shipped_seed_le_120': {label: summary([r for r in groups[label] if r['seed'] <= 120]) for label in SHIPPED if label in groups},
        'paired_comparisons': comparisons}
    json.dump(result, sys.stdout, indent=2, sort_keys=True, allow_nan=False)
    sys.stdout.write('\n')


if __name__ == '__main__':
    main()
