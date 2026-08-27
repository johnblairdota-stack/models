from pathlib import Path
import sys
path = Path(sys.argv[1])
s = path.read_text(encoding='utf-8')
old = "/c\\.runEnd \\|\\| 'TIME'/.test(phoneSrc)\n    && /THE OUTCOME WORD IS THE ONE FACT/.test(phoneSrc));"
# actual text in file:
old = "    /c\\.runEnd \\|\\| 'TIME'/.test(phoneSrc)\n    && /THE OUTCOME WORD IS THE ONE FACT/.test(phoneSrc));"
if old not in s:
    # try raw without extra escapes for finding
    idx = s.find("c.runEnd || 'TIME'")
    print('idx', idx)
    if idx < 0:
        raise SystemExit('warm assert missing')
    # replace the whole W24d test
    tstart = s.rfind("t('W24d", 0, idx)
    tend = s.find(');', idx) + 2
    new = (
"t('W24d · the phone paints the outcome word at recap when the server sent one',\n"
"    /const end = c\\.runEnd/.test(phoneSrc)\n"
"    && /THE OUTCOME WORD IS THE ONE FACT/.test(phoneSrc)\n"
"    && !/c\\.runEnd \\|\\| 'TIME'/.test(phoneSrc));"
    )
    s = s[:tstart] + new + s[tend:]
else:
    s = s.replace(old,
"    /const end = c\\.runEnd/.test(phoneSrc)\n"
"    && /THE OUTCOME WORD IS THE ONE FACT/.test(phoneSrc)\n"
"    && !/c\\.runEnd \\|\\| 'TIME'/.test(phoneSrc));")
path.write_text(s, encoding='utf-8')
print('warm fixed')
