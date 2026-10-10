#!/usr/bin/env python3
"""Owned POSIX PTY transport. Requires Python 3.9 or later and its stdlib."""

import errno
import fcntl
import json
import os
import pty
import selectors
import signal
import struct
import sys
import termios
import time


DATA_LIMIT = 256 * 1024
CONTROL_LIMIT = 4096
FRAME_LIMIT = 1024
GRACE_SECONDS = 2.0


class TransportFault(Exception):
    def __init__(self, code):
        self.code = code


def dimensions(cols, rows):
    return struct.pack("HHHH", rows, cols, 0, 0)


def unique_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError("duplicate_key")
        value[key] = item
    return value


def check():
    if sys.version_info < (3, 9) or os.name != "posix":
        return 1
    master, slave = pty.openpty()
    try:
        fcntl.ioctl(slave, termios.TIOCSWINSZ, dimensions(80, 24))
        termios.tcgetattr(slave)
        selector = selectors.DefaultSelector()
        try:
            os.set_blocking(master, False)
            selector.register(master, selectors.EVENT_READ)
        finally:
            selector.close()
    finally:
        os.close(master)
        os.close(slave)
    os.write(1, b'{"protocol":1,"ok":true}\n')
    return 0


def parse_args(args):
    if (len(args) < 6 or args[0] != "--cols" or args[2] != "--rows"
            or args[4] != "--"):
        raise TransportFault("control_protocol_invalid")
    try:
        cols, rows = int(args[1]), int(args[3])
    except ValueError:
        raise TransportFault("control_protocol_invalid")
    if not (1 <= cols <= 4096 and 1 <= rows <= 4096) or not args[5]:
        raise TransportFault("control_protocol_invalid")
    return cols, rows, args[5:]


class Transport:
    def __init__(self, cols, rows, argv):
        self.selector = None
        self.pid = None
        self.master = None
        self.exec_fd = None
        self.reaped = False
        self.input = bytearray()
        self.output = bytearray()
        self.commands = bytearray()
        self.events = bytearray()
        self.input_peak = 0
        self.output_peak = 0
        self.input_open = True
        self.control_open = True
        self.output_open = True
        self.stop_at = None
        self.killed_at = None
        self.retire_at = None
        self.event_at = None
        self.complete = False
        self.signal_requested = None
        self.previous_handlers = {}
        try:
            self.selector = selectors.DefaultSelector()
            for fd in (0, 1, 3, 4):
                os.set_blocking(fd, False)
            for sig in (signal.SIGINT, signal.SIGTERM):
                self.previous_handlers[sig] = signal.signal(sig, self.on_signal)
            self.spawn(cols, rows, argv)
        except TransportFault:
            raise
        except OSError:
            raise TransportFault("pty_setup_failed")

    def spawn(self, cols, rows, argv):
        read_fd, write_fd = os.pipe()
        os.set_inheritable(write_fd, False)
        try:
            pid, master = pty.fork()
        except OSError:
            os.close(read_fd)
            os.close(write_fd)
            raise TransportFault("pty_setup_failed")
        if pid == 0:
            try:
                os.close(read_fd)
                fcntl.ioctl(0, termios.TIOCSWINSZ, dimensions(cols, rows))
                # Never pass either control channel to the provider.
                os.closerange(3, write_fd)
                os.closerange(write_fd + 1, os.sysconf("SC_OPEN_MAX"))
                signal.signal(signal.SIGINT, signal.SIG_DFL)
                signal.signal(signal.SIGTERM, signal.SIG_DFL)
                os.execvpe(argv[0], argv, os.environ)
            except BaseException:
                try:
                    os.write(write_fd, b"x")
                except OSError:
                    pass
                os._exit(127)
        os.close(write_fd)
        self.pid, self.master, self.exec_fd = pid, master, read_fd
        os.set_blocking(master, False)
        os.set_blocking(read_fd, False)

    def on_signal(self, sig, _frame):
        self.signal_requested = sig

    def stop(self, sig):
        if self.reaped:
            return
        if self.stop_at is None:
            self.stop_at = time.monotonic()
        self.input_open = False
        try:
            os.kill(self.pid, sig)
        except ProcessLookupError:
            pass
        except OSError:
            raise TransportFault("child_wait_failed")

    def event(self, value):
        line = json.dumps(value, separators=(",", ":")).encode("ascii") + b"\n"
        if len(line) - 1 > FRAME_LIMIT or len(self.events) + len(line) > CONTROL_LIMIT:
            raise TransportFault("control_transport_failed")
        if not self.events:
            self.event_at = time.monotonic()
        self.events.extend(line)

    def reap(self):
        if self.reaped:
            return
        try:
            pid, status = os.waitpid(self.pid, os.WNOHANG)
        except OSError:
            raise TransportFault("child_wait_failed")
        if pid == 0:
            return
        self.reaped = True
        self.input_open = False
        self.input.clear()
        self.retire_at = time.monotonic()
        if os.WIFEXITED(status):
            code = os.WEXITSTATUS(status)
        elif os.WIFSIGNALED(status):
            code = min(255, 128 + os.WTERMSIG(status))
        else:
            raise TransportFault("child_wait_failed")
        self.event({"type": "child_exit", "code": code})

    def interest(self, fd, mask, name):
        try:
            current = self.selector.get_key(fd)
        except KeyError:
            current = None
        if mask and current is None:
            self.selector.register(fd, mask, name)
        elif mask and current.events != mask:
            self.selector.modify(fd, mask, name)
        elif not mask and current is not None:
            self.selector.unregister(fd)

    def interests(self):
        self.interest(0, selectors.EVENT_READ if self.input_open and len(self.input) < DATA_LIMIT else 0, "input")
        self.interest(1, selectors.EVENT_WRITE if self.output else 0, "output")
        self.interest(3, selectors.EVENT_READ if self.control_open else 0, "control")
        self.interest(4, selectors.EVENT_WRITE if self.events else 0, "events")
        mask = 0
        if self.output_open and len(self.output) < DATA_LIMIT:
            mask |= selectors.EVENT_READ
        if self.input and self.output_open and not self.reaped:
            mask |= selectors.EVENT_WRITE
        self.interest(self.master, mask, "master")
        if self.exec_fd is not None:
            self.interest(self.exec_fd, selectors.EVENT_READ, "exec")

    def read_input(self):
        try:
            chunk = os.read(0, min(65536, DATA_LIMIT - len(self.input)))
        except BlockingIOError:
            return
        except OSError:
            raise TransportFault("input_transport_failed")
        if not chunk:
            self.input_open = False
            self.stop(signal.SIGTERM)
            return
        self.input.extend(chunk)
        self.input_peak = max(self.input_peak, len(self.input))

    def read_control(self):
        try:
            chunk = os.read(3, CONTROL_LIMIT - len(self.commands))
        except BlockingIOError:
            return
        except OSError:
            raise TransportFault("control_transport_failed")
        if not chunk:
            self.control_open = False
            if self.commands:
                raise TransportFault("control_protocol_invalid")
            self.stop(signal.SIGTERM)
            return
        self.commands.extend(chunk)
        while b"\n" in self.commands:
            end = self.commands.index(10)
            if end > FRAME_LIMIT:
                raise TransportFault("control_protocol_invalid")
            frame = bytes(self.commands[:end])
            del self.commands[:end + 1]
            try:
                value = json.loads(frame, object_pairs_hook=unique_object)
            except (ValueError, UnicodeError, RecursionError):
                raise TransportFault("control_protocol_invalid")
            if not isinstance(value, dict):
                raise TransportFault("control_protocol_invalid")
            if value.get("type") == "resize" and set(value) == {"type", "cols", "rows"}:
                cols, rows = value["cols"], value["rows"]
                if type(cols) is not int or type(rows) is not int or not (1 <= cols <= 4096 and 1 <= rows <= 4096):
                    raise TransportFault("control_protocol_invalid")
                try:
                    fcntl.ioctl(self.master, termios.TIOCSWINSZ, dimensions(cols, rows))
                except OSError:
                    if not self.reaped:
                        raise TransportFault("pty_setup_failed")
            elif value.get("type") == "stop" and set(value) == {"type", "signal"} and value["signal"] in ("SIGINT", "SIGTERM"):
                self.stop(getattr(signal, value["signal"]))
            else:
                raise TransportFault("control_protocol_invalid")
        if len(self.commands) > FRAME_LIMIT:
            raise TransportFault("control_protocol_invalid")

    def read_master(self):
        try:
            chunk = os.read(self.master, min(65536, DATA_LIMIT - len(self.output)))
        except BlockingIOError:
            return
        except OSError as error:
            if error.errno == errno.EIO and sys.platform.startswith("linux"):
                chunk = b""
            else:
                raise TransportFault("output_transport_failed")
        if not chunk:
            self.output_open = False
            self.input.clear()
            return
        self.output.extend(chunk)
        self.output_peak = max(self.output_peak, len(self.output))

    def write(self, fd, buffer, code):
        try:
            count = os.write(fd, buffer)
        except BlockingIOError:
            return
        except OSError:
            raise TransportFault(code)
        if count <= 0:
            raise TransportFault(code)
        del buffer[:count]

    def dispatch(self, name, mask):
        if name == "input":
            self.read_input()
        elif name == "control":
            self.read_control()
        elif name == "output":
            self.write(1, self.output, "output_transport_failed")
        elif name == "events":
            self.write(4, self.events, "control_transport_failed")
            if not self.events:
                self.event_at = None
        elif name == "exec":
            try:
                failed = os.read(self.exec_fd, 1)
            except BlockingIOError:
                return
            except OSError:
                raise TransportFault("child_spawn_failed")
            self.selector.unregister(self.exec_fd)
            os.close(self.exec_fd)
            self.exec_fd = None
            if failed:
                raise TransportFault("child_spawn_failed")
        elif name == "master":
            if mask & selectors.EVENT_READ:
                self.read_master()
            if mask & selectors.EVENT_WRITE and self.input and self.output_open and not self.reaped:
                self.write(self.master, self.input, "input_transport_failed")

    def run(self):
        while True:
            if self.signal_requested is not None:
                self.stop(self.signal_requested)
                self.signal_requested = None
            self.reap()
            now = time.monotonic()
            if self.stop_at is not None and not self.reaped and now - self.stop_at >= GRACE_SECONDS:
                if self.killed_at is None:
                    try:
                        os.kill(self.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    except OSError:
                        raise TransportFault("child_wait_failed")
                    self.killed_at = now
                elif now - self.killed_at >= GRACE_SECONDS:
                    raise TransportFault("child_wait_failed")
            if self.reaped and not self.output_open and not self.output and self.exec_fd is None and not self.complete:
                self.event({"type": "complete", "input_peak": self.input_peak, "output_peak": self.output_peak})
                self.complete = True
            if self.complete and not self.events:
                return 0
            if self.retire_at is not None and now - self.retire_at >= GRACE_SECONDS:
                raise TransportFault("transport_incomplete")
            if self.event_at is not None and now - self.event_at >= GRACE_SECONDS:
                raise TransportFault("control_transport_failed")
            self.interests()
            for key, mask in self.selector.select(0.05):
                self.dispatch(key.data, mask)

    def close(self):
        # Cleanup only the directly owned PID. Descendants have no authority here.
        if self.pid is not None and not self.reaped:
            if self.stop_at is None:
                self.stop(signal.SIGTERM)
            deadline = self.stop_at + GRACE_SECONDS
            while time.monotonic() < deadline:
                try:
                    pid, _status = os.waitpid(self.pid, os.WNOHANG)
                except ChildProcessError:
                    pid = self.pid
                if pid:
                    self.reaped = True
                    break
                time.sleep(0.01)
            if not self.reaped:
                try:
                    os.kill(self.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                # SIGKILL is requested. Do not wait forever for kernel retirement.
                deadline = time.monotonic() + 0.25
                while time.monotonic() < deadline:
                    try:
                        pid, _status = os.waitpid(self.pid, os.WNOHANG)
                    except ChildProcessError:
                        pid = self.pid
                    if pid:
                        self.reaped = True
                        break
                    time.sleep(0.01)
        if self.selector is not None:
            self.selector.close()
        for fd in (self.master, self.exec_fd):
            if fd is not None:
                os.close(fd)
        for sig, handler in self.previous_handlers.items():
            signal.signal(sig, handler)


def report_error(code):
    # A blocked or closed owner channel cannot turn fault cleanup into a hang.
    data = bytearray(json.dumps({"type": "error", "code": code}, separators=(",", ":")).encode("ascii") + b"\n")
    try:
        os.set_blocking(4, False)
        selector = selectors.DefaultSelector()
        try:
            selector.register(4, selectors.EVENT_WRITE)
            deadline = time.monotonic() + GRACE_SECONDS
            while data and time.monotonic() < deadline:
                if not selector.select(min(0.05, max(0, deadline - time.monotonic()))):
                    continue
                try:
                    count = os.write(4, data)
                except BlockingIOError:
                    continue
                if count <= 0:
                    break
                del data[:count]
        finally:
            selector.close()
    except OSError:
        pass


def main():
    transport = None
    fault = None
    try:
        if sys.argv[1:] == ["--check"]:
            return check()
        if sys.version_info < (3, 9) or os.name != "posix":
            raise TransportFault("pty_setup_failed")
        cols, rows, argv = parse_args(sys.argv[1:])
        transport = Transport.__new__(Transport)
        transport.__init__(cols, rows, argv)
        return transport.run()
    except TransportFault as error:
        fault = error.code
    except Exception:
        fault = "pty_setup_failed"
    finally:
        if transport is not None:
            transport.close()
        if fault is not None:
            report_error(fault)
    return 1


if __name__ == "__main__":
    sys.exit(main())
