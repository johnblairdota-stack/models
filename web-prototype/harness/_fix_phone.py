from pathlib import Path
import sys
path = Path(sys.argv[1])
s = path.read_text(encoding='utf-8')
marker = 'THE OUTCOME WORD IS THE ONE FACT'
i = s.find(marker)
if i < 0:
    raise SystemExit('marker missing')
start = s.rfind('/*', 0, i)
run = s.find('c.runEnd', i)
brace = s.find('}', run)
while brace + 1 < len(s) and s[brace+1] in '\r\n':
    brace += 1
line = s.rfind('\n', 0, start) + 1
good = (
"      /*\n"
"       * THE OUTCOME WORD IS THE ONE FACT THE PAD NEEDS AT RECAP.\n"
"       * Playcritique: the pad said \"Phones down.\" and never whether they smashed it or ran\n"
"       * out of time. `c.runEnd` is the server's `RUN_END` — SMASHED or TIME today; CAUGHT is\n"
"       * reserved until the hunter take exists. Missing end omits the word rather than inventing\n"
"       * TIME — same rule as the TV's `recapBoard`.\n"
"       */\n"
"      {\n"
"        const end = c.runEnd;\n"
"        body += end\n"
"          ? `<h1>${esc(end)}</h1>\n"
"        <p class=\"hint\">Phones down. Talk. The next ballot comes to this screen when the room is ready.</p>`\n"
"          : `<h1>Phones down.</h1>\n"
"        <p class=\"hint\">Talk. The next ballot comes to this screen when the room is ready.</p>`;\n"
"      }"
)
s2 = s[:line] + good + s[brace+1:]
path.write_text(s2, encoding='utf-8')
print('fixed', path, 'delta', len(s2)-len(s))
