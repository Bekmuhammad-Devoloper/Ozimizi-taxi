"""Upload files to the production VPS (189.74.100.34) over SFTP (password
auth). Usage: python -I deploy/rput.py <local>:<remote> [...]
Password: deploy/.eskiz.pass (gitignored) or $ESKIZ_PASS_FILE."""
import io
import os
import sys

import paramiko

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
HERE = os.path.dirname(os.path.abspath(__file__))
HOST = os.environ.get("ESKIZ_HOST", "189.74.100.34")
PASS_FILE = os.environ.get("ESKIZ_PASS_FILE", os.path.join(HERE, ".eskiz.pass"))
with open(PASS_FILE, "r", encoding="utf-8") as f:
    password = f.read().strip()

cli = paramiko.SSHClient()
cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cli.connect(HOST, username="root", password=password, timeout=25, look_for_keys=False, allow_agent=False)
sftp = cli.open_sftp()
for pair in sys.argv[1:]:
    local, remote = pair.rsplit(":", 1)
    sftp.put(local, remote)
    print(f"put {os.path.basename(local)} -> {remote} ({sftp.stat(remote).st_size} bytes)")
sftp.close()
cli.close()
