# Pont pty <-> simulateur Grbl (127.0.0.1:<port>) : /tmp/ttyGRBL, sans socat.
# Usage : python3 -I bridge.py 5000
# Quand le simulateur ferme la liaison (ctl drop) ou que le pont est tué (sim.sh unplug),
# le pseudo-terminal disparaît avec /tmp/ttyGRBL, comme un câble USB débranché.
import os, pty, select, signal, socket, sys, time, tty

port = int(sys.argv[1])
path = '/tmp/ttyGRBL'
master, slave = pty.openpty()
tty.setraw(slave)
tty.setraw(master)
name = os.ttyname(slave)


def cleanup(*_):
    try:
        if os.readlink(path) == name:
            os.unlink(path)
    except OSError:
        pass
    sys.exit(0)


signal.signal(signal.SIGTERM, cleanup)
signal.signal(signal.SIGINT, cleanup)
try:
    os.unlink(path)
except OSError:
    pass
link = socket.create_connection(('127.0.0.1', port))
os.symlink(name, path)
print('bridge', name, '->', port, flush=True)
try:
    while True:
        r, _, _ = select.select([master, link], [], [])
        if master in r:
            try:
                data = os.read(master, 4096)
            except OSError:
                # No reader on the slave side yet (port not opened): wait.
                time.sleep(0.05)
                continue
            if data:
                link.sendall(data)
        if link in r:
            data = link.recv(4096)
            if not data:
                print('liaison fermée par le simulateur', flush=True)
                break
            os.write(master, data)
except OSError as e:
    print('pont arrêté :', e, flush=True)
finally:
    cleanup()
