import os
import signal
import sys
from supervisor import childutils

while True:
    headers, payload = childutils.listener.wait(sys.stdin, sys.stdout)
    childutils.listener.ok(sys.stdout)
    os.kill(os.getppid(), signal.SIGTERM)
