import os
import re
import shutil
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))


def test_rootfall_integrity():
    with open(os.path.join(HERE, 'index.html'), 'r', encoding='utf-8') as f:
        html = f.read()

    # 1. 100% offline - zero external scripts or links
    assert not re.findall(r'<script[^>]+src=["\'](https?://[^"\']+)', html), "Found external scripts"
    assert not re.findall(r'<link[^>]+href=["\'](https?://[^"\']+)', html), "Found external links"

    # 2. Audio routines
    for routine in ['playKeyBlip', 'playErrorBuzz', 'playPenaltySiren', 'playStageClear',
                    'playVictoryFanfare', 'playTimerWarning', 'playTickPulse', 'triggerScreenShake']:
        assert routine in html, f"Missing audio routine: {routine}"

    # 3. Difficulty selection & per-difficulty time (alerts at 60/40/20% of total)
    assert 'KOLAY: { time: 60' in html
    assert 'ORTA:  { time: 75' in html
    assert 'ZOR:   { time: 90' in html
    assert 'AWAIT_DIFFICULTY' in html and 'ZORLUK SEVİYESİNİ SEÇ' in html
    # Skip: unlocked by hint, costs 10/15/20 s by difficulty
    for cost in ['skipCost: 10', 'skipCost: 15', 'skipCost: 20']:
        assert cost in html, f"Missing {cost}"
    assert 'function skipStage' in html and 'if (!hintUsed)' in html
    assert 'ATLANAN SORU' in html
    for frac in ['0.6', '0.4', '0.2']:
        assert f'totalTime * {frac}' in html, f"Missing alert at {frac}"

    # 4. The difficulty order must not exist any more (no permutation engine)
    for gone in ['DIFFICULTY_PERMUTATIONS', 'activePermutation', 'ZORLUK DÜZENİ', 'ZORLUK MOTORU']:
        assert gone not in html, f"Leftover: {gone}"

    # 5. Leaderboard per difficulty, reset with confirmation
    assert '"rootfall_lb"' in html
    assert 'reset-board' in html and 'confirm(' in html
    assert 'saveScore(operatorName, timeTakenSec, masterKeyCombined, selectedDifficulty)' in html

    # 6. Master key vault
    assert 'TÜM GÜVENLİK DUVARLARI AŞILDI // SON KİLİT DEVREDE' in html
    assert 'MASTER KEY >' in html
    assert 'timeRemaining - 5' in html
    assert 'TOPLANAN ANAHTARLAR:' in html and '1.ANAHTAR-2.ANAHTAR-3.ANAHTAR' in html
    keys = re.search(r'const KEY_WORDS = \[(.*?)\];', html, re.S).group(1)
    assert '-' not in keys, "Key words must not contain hyphens"

    # 7. Victory & failure screens, no event-specific leftovers
    assert 'ROOT ACCESS GRANTED // LEVEL 4 CLEARANCE' in html
    assert 'Derecen yerel liderlik tablosuna kaydedildi' in html
    assert 'TRACE ROUTE AKTİF' in html and 'YENİDEN DENE' in html
    leftovers = re.findall(r'\bCES\b|BEDAVA|Tanışma|\bstant', html)
    assert not leftovers, f"Event-specific text left over: {leftovers}"

    # 8. Behaviour: headless simulation (catalog 6x3x7, leak check, full runs, no repeats)
    node = shutil.which('node')
    sim = os.path.join(HERE, 'sim_test.js')
    if node and os.path.exists(sim):
        r = subprocess.run([node, sim, os.path.join(HERE, 'index.html')], capture_output=True, text=True)
        assert r.returncode == 0, r.stderr or r.stdout
    else:
        print("[skip] node or sim_test.js missing; behaviour simulation not run")

    print("All ROOTFALL v7.0 self-checks passed successfully!")


if __name__ == '__main__':
    test_rootfall_integrity()
