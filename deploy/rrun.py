"""Run one shell command on the production VPS (189.74.100.34) over SSH with
password auth. Usage: python -I deploy/rrun.py "<command>" [timeout_seconds]
The root password is read from deploy/.eskiz.pass (gitignored) or the file
named by the ESKIZ_PASS_FILE environment variable."""
import io
import os
import shlex
import sys

import paramiko

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
HERE = os.path.dirname(os.path.abspath(__file__))
HOST = os.environ.get("ESKIZ_HOST", "189.74.100.34")
PASS_FILE = os.environ.get("ESKIZ_PASS_FILE", os.path.join(HERE, ".eskiz.pass"))

cmd = sys.argv[1]
timeout = int(sys.argv[2]) if len(sys.argv) > 2 else 600
with open(PASS_FILE, "r", encoding="utf-8") as f:
    password = f.read().strip()

cli = paramiko.SSHClient()
cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cli.connect(HOST, username="root", password=password, timeout=25, look_for_keys=False, allow_agent=False)
chan = cli.get_transport().open_session()
chan.settimeout(timeout)
chan.exec_command("bash -lc " + shlex.quote(cmd))
out = chan.makefile("r", -1).read().decode("utf-8", "replace")
err = chan.makefile_stderr("r", -1).read().decode("utf-8", "replace")
rc = chan.recv_exit_status()
if out.strip():
    print(out.rstrip())
if err.strip():
    print("[stderr]", err.rstrip()[-3000:])
print(f"[rc={rc}]")
cli.close()
sys.exit(rc)
