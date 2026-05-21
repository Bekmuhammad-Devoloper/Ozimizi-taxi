"""SSH helper for deployment scripts. Reads commands from argv or stdin."""
import os
import sys
import paramiko

HOST = os.environ.get("SSH_HOST", "104.248.25.130")
PORT = int(os.environ.get("SSH_PORT", "22"))
USER = os.environ.get("SSH_USER", "root")
PASSWORD = os.environ.get("SSH_PASSWORD", "")

def run(cmd: str) -> int:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=20, allow_agent=False, look_for_keys=False)
    chan = client.get_transport().open_session()
    chan.get_pty()
    chan.exec_command(cmd)
    while True:
        if chan.recv_ready():
            sys.stdout.write(chan.recv(4096).decode(errors="replace"))
            sys.stdout.flush()
        if chan.recv_stderr_ready():
            sys.stderr.write(chan.recv_stderr(4096).decode(errors="replace"))
            sys.stderr.flush()
        if chan.exit_status_ready():
            # Drain remaining output
            while chan.recv_ready():
                sys.stdout.write(chan.recv(4096).decode(errors="replace"))
            while chan.recv_stderr_ready():
                sys.stderr.write(chan.recv_stderr(4096).decode(errors="replace"))
            rc = chan.recv_exit_status()
            client.close()
            return rc

if __name__ == "__main__":
    if len(sys.argv) > 1:
        cmd = " ".join(sys.argv[1:])
    else:
        cmd = sys.stdin.read()
    sys.exit(run(cmd))
