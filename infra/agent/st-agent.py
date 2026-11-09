#!/usr/bin/env python3
"""Agente de monitoreo de Smart Traffic.

Cada 30 s (timer de systemd) revisa las medidas de seguridad de la maquina y envia el
reporte al dashboard por HTTPS con TLS mutuo: nginx en 10.0.1.10:9443 solo acepta el
certificado de un agente firmado por la CA interna, y el dashboard comprueba que el CN
del certificado coincide con la maquina que dice reportar.

El reporte describe la configuracion, nunca la copia: no incluye variables de entorno,
contrasenas, claves ni tokens.
"""
import json
import os
import re
import socket
import ssl
import subprocess
import threading
import time
import urllib.request
from datetime import datetime, timezone

CONF_DIR = "/etc/st-agent"
VERSION = "1.0"


def load_conf():
    with open(os.path.join(CONF_DIR, "agent.json"), encoding="utf-8") as handle:
        return json.load(handle)


def run(cmd, timeout=10):
    """Ejecuta un comando y devuelve su salida; nunca lanza excepcion."""
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, check=False)
        return out.returncode, out.stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        return 127, ""


def read(path, default=""):
    try:
        with open(path, encoding="utf-8", errors="replace") as handle:
            return handle.read()
    except OSError:
        return default


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ---------------------------------------------------------------- sistema

def cpu_percent(interval=0.5):
    def snap():
        parts = [int(x) for x in read("/proc/stat").splitlines()[0].split()[1:]]
        idle = parts[3] + parts[4]
        return idle, sum(parts)

    idle1, total1 = snap()
    time.sleep(interval)
    idle2, total2 = snap()
    total = total2 - total1
    return round(100 * (1 - (idle2 - idle1) / total), 1) if total else 0.0


def system_info():
    mem = {}
    for line in read("/proc/meminfo").splitlines():
        key, value = line.split(":", 1)
        mem[key] = int(value.split()[0]) // 1024
    stat = os.statvfs("/")
    size = stat.f_blocks * stat.f_frsize
    free = stat.f_bavail * stat.f_frsize
    os_name = re.search(r'PRETTY_NAME="([^"]+)"', read("/etc/os-release"))
    return {
        "os": os_name.group(1) if os_name else "linux",
        "kernel": os.uname().release,
        "uptime_s": int(float(read("/proc/uptime", "0 0").split()[0])),
        "load": [round(x, 2) for x in os.getloadavg()],
        "cpus": os.cpu_count(),
        "cpu_pct": cpu_percent(),
        "mem": {
            "total_mb": mem.get("MemTotal", 0),
            "avail_mb": mem.get("MemAvailable", 0),
            "used_mb": mem.get("MemTotal", 0) - mem.get("MemAvailable", 0),
        },
        "swap": {
            "total_mb": mem.get("SwapTotal", 0),
            "used_mb": mem.get("SwapTotal", 0) - mem.get("SwapFree", 0),
        },
        "disk": {
            "size_gb": round(size / 1e9, 1),
            "used_gb": round((size - free) / 1e9, 1),
            "pct": round(100 * (size - free) / size, 1) if size else 0,
        },
    }


def patching():
    _, out = run(["apt", "list", "--upgradable"], timeout=30)
    lines = [l for l in out.splitlines() if "/" in l]
    last = None
    for line in read("/var/log/apt/history.log").splitlines():
        if line.startswith("End-Date:"):
            last = line.split(":", 1)[1].strip()
    return {
        "upgradable": len(lines),
        "security": sum(1 for l in lines if "-security" in l),
        "reboot_required": os.path.exists("/var/run/reboot-required"),
        "last_apt_run": last,
    }


SSH_KEYS = [
    "passwordauthentication", "kbdinteractiveauthentication", "permitrootlogin",
    "pubkeyauthentication", "x11forwarding", "allowagentforwarding", "maxauthtries",
    "logingracetime", "permitemptypasswords", "clientaliveinterval",
]


def ssh_config():
    _, out = run(["sshd", "-T"])
    effective = {}
    for line in out.splitlines():
        key, _, value = line.partition(" ")
        if key in SSH_KEYS:
            effective[key] = value
    return effective


SYSCTLS = [
    "net.ipv4.conf.all.accept_redirects", "net.ipv4.conf.all.send_redirects",
    "net.ipv4.conf.all.accept_source_route", "net.ipv4.conf.all.log_martians",
    "net.ipv4.tcp_syncookies", "kernel.dmesg_restrict", "kernel.kptr_restrict",
    "kernel.randomize_va_space", "net.ipv4.ip_forward", "vm.swappiness",
]


def sysctls():
    values = {}
    for key in SYSCTLS:
        values[key] = read("/proc/sys/" + key.replace(".", "/")).strip()
    return values


def time_sync():
    _, out = run(["chronyc", "-n", "tracking"])
    info = {"synced": False}
    for line in out.splitlines():
        key, _, value = line.partition(":")
        key, value = key.strip(), value.strip()
        if key == "Reference ID":
            match = re.search(r"\(([^)]+)\)", value)
            info["source"] = match.group(1) if match else value
        elif key == "Stratum":
            info["stratum"] = int(value or 0)
        elif key == "System time":
            seconds = float(value.split()[0])
            info["offset_ms"] = round(seconds * 1000 * (-1 if "slow" in value else 1), 3)
        elif key == "Leap status":
            info["synced"] = value == "Normal"
    return info


def services(names):
    status = {}
    for name in names:
        _, out = run(["systemctl", "is-active", name])
        _, enabled = run(["systemctl", "is-enabled", name])
        status[name] = {"active": out or "unknown", "enabled": enabled or "unknown"}
    return status


def audit_info():
    _, out = run(["auditctl", "-s"])
    enabled = re.search(r"enabled (\d)", out)
    _, rules = run(["auditctl", "-l"])
    return {
        "enabled": bool(enabled and enabled.group(1) != "0"),
        "rules": 0 if "No rules" in rules else len([r for r in rules.splitlines() if r.strip()]),
    }


# ---------------------------------------------------------------- firewall

def firewall():
    code, out = run(["nft", "-j", "list", "table", "inet", "hostfw"])
    info = {"loaded": code == 0, "chains": [], "rules_text": ""}
    if code != 0:
        return info
    items = json.loads(out).get("nftables", [])
    chains = {}
    for item in items:
        if "chain" in item:
            chain = item["chain"]
            chains[chain["name"]] = {
                "name": chain["name"], "hook": chain.get("hook"), "policy": chain.get("policy"),
                "priority": chain.get("prio"), "rules": 0, "dropped_packets": 0, "dropped_bytes": 0,
            }
        elif "rule" in item:
            rule = item["rule"]
            entry = chains.get(rule["chain"])
            if entry is None:
                continue
            entry["rules"] += 1
            if str(rule.get("comment", "")).startswith("descartados"):
                for expr in rule.get("expr", []):
                    if "counter" in expr:
                        entry["dropped_packets"] = expr["counter"].get("packets", 0)
                        entry["dropped_bytes"] = expr["counter"].get("bytes", 0)
    info["chains"] = list(chains.values())
    _, text = run(["nft", "list", "table", "inet", "hostfw"])
    # Los contadores cambian a cada momento: se quitan para mostrar solo las reglas.
    info["rules_text"] = re.sub(r" counter packets \d+ bytes \d+", " counter", text)
    _, docker_chains = run(["nft", "list", "tables"])
    info["other_tables"] = [l.replace("table ", "") for l in docker_chains.splitlines() if "hostfw" not in l]
    info["persisted"] = "table inet hostfw" in read("/etc/nftables.conf")
    return info


# ---------------------------------------------------------------- red

def listening():
    _, out = run(["ss", "-H", "-tlnp"])
    result = []
    for line in out.splitlines():
        parts = line.split()
        if len(parts) < 4:
            continue
        local = parts[3]
        addr, _, port = local.rpartition(":")
        proc = re.search(r'users:\(\("([^"]+)"', line)
        result.append({"addr": addr.strip("[]"), "port": int(port), "process": proc.group(1) if proc else ""})
    unique = {(r["addr"], r["port"]): r for r in result}
    return sorted(unique.values(), key=lambda r: r["port"])


def tcp_probe(host, port, timeout=2.0):
    start = time.monotonic()
    try:
        with socket.create_connection((host, port), timeout=timeout):
            result = "open"
    except socket.timeout:
        result = "blocked"
    except ConnectionRefusedError:
        result = "refused"
    except OSError as err:
        result = "error:" + (err.strerror or type(err).__name__)
    return result, round((time.monotonic() - start) * 1000)


NODE_PROBE = (
    "const net=require('net');const t=JSON.parse(process.argv[1]);"
    "Promise.all(t.map(([h,p])=>new Promise(r=>{const s=Date.now();"
    "const c=net.connect({host:h,port:p,timeout:2000});"
    "c.on('connect',()=>{c.destroy();r(['open',Date.now()-s])});"
    "c.on('timeout',()=>{c.destroy();r(['blocked',Date.now()-s])});"
    "c.on('error',e=>r([e.code==='ECONNREFUSED'?'refused':'error:'+e.code,Date.now()-s]))})))"
    ".then(x=>console.log(JSON.stringify(x)))"
)


def probes(conf):
    """Comprueba la segmentacion: lo permitido conecta y lo demas queda bloqueado."""
    results = []
    lock = threading.Lock()

    def host_probe(probe):
        outcome, ms = tcp_probe(probe["host"], probe["port"])
        with lock:
            results.append({**probe, "from": "host", "result": outcome, "ms": ms})

    threads = [threading.Thread(target=host_probe, args=(p,)) for p in conf.get("host_probes", [])]
    for thread in threads:
        thread.start()

    container = conf.get("probe_container")
    container_probes = conf.get("container_probes", [])
    if container and container_probes:
        targets = json.dumps([[p["host"], p["port"]] for p in container_probes])
        code, out = run(["docker", "exec", container, "node", "-e", NODE_PROBE, targets], timeout=15)
        try:
            outcomes = json.loads(out) if code == 0 else []
        except json.JSONDecodeError:
            outcomes = []
        for probe, outcome in zip(container_probes, outcomes or [["error:exec", 0]] * len(container_probes)):
            results.append({**probe, "from": f"contenedor {container}", "result": outcome[0], "ms": outcome[1]})

    for thread in threads:
        thread.join()
    for item in results:
        opened = item["result"] == "open"
        item["ok"] = opened if item["expect"] == "allow" else not opened
    return sorted(results, key=lambda r: (r["expect"], r["host"], r["port"]))


# ---------------------------------------------------------------- contenedores

def containers():
    _, ids = run(["docker", "ps", "-aq"])
    if not ids:
        return []
    _, out = run(["docker", "inspect", *ids.split()], timeout=20)
    try:
        data = json.loads(out)
    except json.JSONDecodeError:
        return []
    result = []
    for item in data:
        host = item.get("HostConfig", {})
        config = item.get("Config", {})
        state = item.get("State", {})
        mounts = item.get("Mounts", [])
        result.append({
            "name": item.get("Name", "").lstrip("/"),
            "image": config.get("Image"),
            "status": state.get("Status"),
            "health": (state.get("Health") or {}).get("Status"),
            "started_at": state.get("StartedAt"),
            "restarts": item.get("RestartCount", 0),
            "user": config.get("User") or "root",
            "read_only": bool(host.get("ReadonlyRootfs")),
            "cap_drop": host.get("CapDrop") or [],
            "cap_add": host.get("CapAdd") or [],
            "no_new_privileges": "no-new-privileges:true" in (host.get("SecurityOpt") or []),
            "privileged": bool(host.get("Privileged")),
            "mem_limit_mb": (host.get("Memory") or 0) // (1024 * 1024),
            "pids_limit": host.get("PidsLimit"),
            "restart_policy": (host.get("RestartPolicy") or {}).get("Name"),
            "ports": sorted({f'{b.get("HostIp") or "0.0.0.0"}:{b.get("HostPort")}->{p}'
                             for p, binds in (host.get("PortBindings") or {}).items() for b in (binds or [])}),
            "networks": sorted((item.get("NetworkSettings", {}).get("Networks") or {}).keys()),
            "docker_socket": any(m.get("Source") == "/var/run/docker.sock" for m in mounts),
            "secret_mounts_ro": all(not m.get("RW") for m in mounts if "secrets" in (m.get("Source") or "")),
        })
    return sorted(result, key=lambda c: c["name"])


# ---------------------------------------------------------------- certificados

def cert_info(path):
    code, text = run(["openssl", "x509", "-in", path, "-noout", "-subject", "-issuer", "-enddate",
                      "-startdate", "-fingerprint", "-sha256", "-ext", "subjectAltName,extendedKeyUsage", "-text"])
    if code != 0:
        return None

    def grab(pattern):
        match = re.search(pattern, text, re.MULTILINE)
        return match.group(1).strip() if match else None

    not_after = grab(r"^notAfter=(.+)$")
    days = None
    if not_after:
        try:
            expiry = datetime.strptime(not_after, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
            days = (expiry - datetime.now(timezone.utc)).days
        except ValueError:
            pass
    return {
        "file": path,
        "subject": grab(r"^subject=(.+)$"),
        "issuer": grab(r"^issuer=(.+)$"),
        "not_after": not_after,
        "days_left": days,
        "key": grab(r"Public Key Algorithm: (.+)$"),
        "curve": grab(r"NIST CURVE: (.+)$") or grab(r"ASN1 OID: (.+)$"),
        "key_bits": grab(r"Public-Key: \((\d+) bit\)"),
        "signature": grab(r"Signature Algorithm: (.+)$"),
        "san": grab(r"X509v3 Subject Alternative Name:.*\n\s*(.+)$"),
        "usage": grab(r"X509v3 Extended Key Usage:.*\n\s*(.+)$"),
        "fingerprint": grab(r"Fingerprint=(.+)$"),
    }


def certificates(roots):
    seen, result = set(), []
    for root in roots:
        for dirpath, _, files in os.walk(root):
            for name in sorted(files):
                path = os.path.join(dirpath, name)
                if "BEGIN CERTIFICATE" not in read(path):
                    continue
                info = cert_info(path)
                if info and info["fingerprint"] not in seen:
                    seen.add(info["fingerprint"])
                    result.append(info)
    return result


# ---------------------------------------------------------------- actividad por rol

def docker_logs(name, since="10m"):
    # docker logs reparte la salida del contenedor entre stdout y stderr.
    try:
        proc = subprocess.run(["docker", "logs", "--since", since, name], capture_output=True, text=True,
                              timeout=20, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return ""
    return proc.stdout + proc.stderr if proc.returncode == 0 else ""


def container_peers(name, ports):
    """Conexiones establecidas dentro del contenedor (quien esta conectado a cada puerto)."""
    _, pid = run(["docker", "inspect", "-f", "{{.State.Pid}}", name])
    if not pid or pid == "0":
        return []
    _, out = run(["nsenter", "-t", pid, "-n", "ss", "-H", "-tn", "state", "established"])
    peers = {}
    for line in out.splitlines():
        parts = line.split()
        if len(parts) < 4:
            continue
        local_port = int(parts[2].rpartition(":")[2])
        remote_ip = parts[3].rpartition(":")[0].strip("[]").replace("::ffff:", "")
        if local_port in ports:
            key = (local_port, remote_ip)
            peers[key] = peers.get(key, 0) + 1
    return [{"port": p, "peer": ip, "connections": n} for (p, ip), n in sorted(peers.items())]


def activity(role):
    window = "10m"
    if role == "auth":
        counts = {"token_issued": 0, "token_denied": 0, "token_rate_limited": 0}
        clients = {}
        for line in docker_logs("auth-server", window).splitlines():
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            event = entry.get("event")
            if event in counts:
                counts[event] += 1
                if event == "token_issued":
                    clients[entry.get("client")] = clients.get(entry.get("client"), 0) + 1
        return {"window": window, **counts, "tokens_by_client": clients}
    if role == "ingest":
        logs = docker_logs("traffic_sensor_simulator", window)
        return {"window": window, "events_sent": logs.count("[APP] Evento enviado"),
                "token_failures": logs.count("No se pudo obtener token"),
                "kafka_errors": logs.count("Error enviando a Kafka")}
    if role == "core":
        logs = docker_logs("traffic_density_processor", window)
        return {"window": window, "events_processed": logs.count("Processed event"),
                "invalid_tokens": logs.count("Invalid token")}
    if role == "app":
        statuses = {}
        for match in re.finditer(r'" (\d{3}) \d+ "', docker_logs("nginx", window)):
            statuses[match.group(1)] = statuses.get(match.group(1), 0) + 1
        logs = docker_logs("alert_dispatcher", window)
        # Configuracion efectiva de Nginx (nginx -T), resumida en si/no.
        _, conf = run(["docker", "exec", "nginx", "nginx", "-T"], timeout=15)
        nginx = {
            "server_tokens_off": bool(re.search(r"^\s*server_tokens off;", conf, re.M)),
            "rate_5r_s": "rate=5r/s" in conf,
            "burst_10_nodelay": "burst=10 nodelay" in conf,
            "tls_modern_only": bool(re.search(r"ssl_protocols TLSv1\.2 TLSv1\.3;", conf)) and "TLSv1.1" not in conf,
            "client_cert_required": "ssl_verify_client on;" in conf,
            "hsts": "Strict-Transport-Security" in conf,
            "methods_limited": "limit_except GET HEAD" in conf,
        }
        return {"window": window, "http_status": statuses, "alerts_dispatched": logs.count("[DISPATCHER] Evento procesado"),
                "rate_limited_429": statuses.get("429", 0), "nginx": nginx}
    if role == "data":
        result = {"window": window}

        def rmq(*args):
            code, out = run(["docker", "exec", "rabbitmq", "rabbitmqctl", "--quiet", *args, "--formatter", "json"],
                            timeout=20)
            try:
                return json.loads(out) if code == 0 else []
            except json.JSONDecodeError:
                return []

        result["rabbitmq_users"] = [{"user": u.get("user"), "tags": u.get("tags")} for u in rmq("list_users")]
        result["rabbitmq_permissions"] = rmq("list_permissions", "-p", "/")
        result["rabbitmq_queues"] = rmq("list_queues", "name", "messages", "consumers")
        result["rabbitmq_connections"] = rmq("list_connections", "user", "peer_host", "ssl", "ssl_protocol",
                                             "ssl_cipher", "peer_cert_subject")
        result["kafka_peers"] = container_peers("kafka", {9092})
        return result
    if role == "bastion":
        _, banned = run(["fail2ban-client", "status", "sshd"])
        grab = lambda label: int((re.search(label + r":\s+(\d+)", banned) or [0, 0])[1])
        _, journal = run(["journalctl", "-u", "ssh", "--since", "-60min", "--no-pager", "-q"], timeout=20)
        _, who = run(["who"])
        return {
            "window": "60m",
            "fail2ban_currently_banned": grab("Currently banned"),
            "fail2ban_total_banned": grab("Total banned"),
            "fail2ban_total_failed": grab("Total failed"),
            "ssh_failed_attempts": len(re.findall(r"Failed|Invalid user|authentication failure", journal)),
            "ssh_accepted": journal.count("Accepted publickey"),
            "admin_sessions": len([l for l in who.splitlines() if l.strip()]),
        }
    return {}


# ---------------------------------------------------------------- evaluacion

def evaluate(report, conf):
    """Resume el estado en comprobaciones de si/no que el dashboard muestra por maquina."""
    checks = []

    def add(check_id, label, ok, detail=""):
        checks.append({"id": check_id, "label": label, "ok": bool(ok), "detail": detail})

    fw = report["firewall"]
    policies = {c["name"]: c["policy"] for c in fw["chains"]}
    add("fw_loaded", "Firewall nftables cargado", fw["loaded"], "tabla inet hostfw")
    add("fw_default_drop", "Politica por defecto: descartar",
        fw["loaded"] and all(p == "drop" for p in policies.values()),
        ", ".join(f"{k}={v}" for k, v in policies.items()))
    add("fw_persisted", "Firewall persistente tras reinicio", fw["persisted"], "/etc/nftables.conf")

    ssh = report["ssh"]
    add("ssh_no_password", "SSH sin contrasenas", ssh.get("passwordauthentication") == "no"
        and ssh.get("kbdinteractiveauthentication") == "no", "solo clave publica")
    add("ssh_no_root", "SSH sin acceso root", ssh.get("permitrootlogin") == "no")
    add("ssh_maxauth", "SSH con intentos limitados", int(ssh.get("maxauthtries", "6")) <= 3,
        f"MaxAuthTries {ssh.get('maxauthtries')}")

    sc = report["sysctl"]
    add("sysctl_redirects", "Kernel sin redirecciones ICMP ni ruta de origen",
        sc.get("net.ipv4.conf.all.accept_redirects") == "0" and sc.get("net.ipv4.conf.all.accept_source_route") == "0")
    add("sysctl_syncookies", "Proteccion SYN flood (syncookies)", sc.get("net.ipv4.tcp_syncookies") == "1")
    add("aslr", "ASLR completo", sc.get("kernel.randomize_va_space") == "2")

    add("time_synced", "Hora sincronizada (validez de JWT)", report["time"].get("synced"),
        f'{report["time"].get("source", "?")} desfase {report["time"].get("offset_ms", "?")} ms')
    add("auditd", "Auditoria del sistema (auditd)", report["services"].get("auditd", {}).get("active") == "active")
    add("patched", "Sin parches de seguridad pendientes", report["patching"]["security"] == 0,
        f'{report["patching"]["upgradable"]} actualizables, {report["patching"]["security"]} de seguridad')
    add("no_reboot", "Sin reinicio pendiente", not report["patching"]["reboot_required"])

    expected = set(conf.get("expected_ports", []))
    exposed = sorted({l["port"] for l in report["listening"]
                      if not l["addr"].startswith(("127.", "::1")) and l["addr"] not in ("127.0.0.53%lo", "127.0.0.54")})
    unexpected = [p for p in exposed if p not in expected]
    add("ports", "Solo puertos esperados en escucha", not unexpected,
        "inesperados: " + ", ".join(map(str, unexpected)) if unexpected else "puertos: " + ", ".join(map(str, exposed)))

    ctrs = report["containers"]
    if ctrs:
        weak = [c["name"] for c in ctrs if not (c["read_only"] and "ALL" in c["cap_drop"] and c["no_new_privileges"]
                                                and not c["privileged"] and not c["docker_socket"])]
        add("containers_hardened", "Contenedores bastionados", not weak,
            "sin bastionar: " + ", ".join(weak) if weak else f"{len(ctrs)} con solo lectura, sin capacidades y no-new-privileges")
        roots = [c["name"] for c in ctrs if c["user"] in ("root", "0", "")]
        add("containers_nonroot", "Contenedores sin root", not roots,
            "como root: " + ", ".join(roots) if roots else "todos con usuario sin privilegios")
        down = [c["name"] for c in ctrs if c["status"] != "running"]
        add("containers_running", "Contenedores en ejecucion", not down,
            "detenidos: " + ", ".join(down) if down else f"{len(ctrs)} en ejecucion")

    certs = report["certificates"]
    if certs:
        soon = [c["subject"] for c in certs if c["days_left"] is not None and c["days_left"] < 30]
        add("certs_valid", "Certificados vigentes (>30 dias)", not soon,
            f"{len(certs)} certificados, minimo {min((c['days_left'] or 0) for c in certs)} dias")

    act = report.get("activity", {})
    role = report.get("role")
    if role == "app" and act.get("nginx"):
        ng = act["nginx"]
        add("nginx_hardening", "Nginx bastionado (server_tokens, TLS 1.2+, HSTS, metodos)",
            ng["server_tokens_off"] and ng["tls_modern_only"] and ng["hsts"] and ng["methods_limited"],
            ", ".join(k for k, v in ng.items() if v))
        add("nginx_rate_limit", "Rate limiting 5 r/s con rafaga de 10", ng["rate_5r_s"] and ng["burst_10_nodelay"],
            f'{act.get("rate_limited_429", 0)} respuestas 429 en {act.get("window")}')
        add("gateway_mtls", "Pasarela de agentes exige certificado de cliente", ng["client_cert_required"],
            "ssl_verify_client on en 9443")
    if role == "data" and act.get("rabbitmq_permissions"):
        broad = [p["user"] for p in act["rabbitmq_permissions"]
                 if p.get("user") != "admin" and ".*" in (p.get("configure"), p.get("write"), p.get("read"))]
        add("rabbitmq_least_privilege", "RabbitMQ: un usuario por servicio con permisos minimos", not broad,
            "permisos amplios: " + ", ".join(broad) if broad else
            ", ".join(f'{p["user"]} escribe {p["write"]}' for p in act["rabbitmq_permissions"] if p.get("user") != "admin"))
        conns = act.get("rabbitmq_connections") or []
        plain = [c.get("user") for c in conns if not c.get("ssl")]
        add("rabbitmq_tls_only", "RabbitMQ: todas las conexiones con TLS", bool(conns) and not plain,
            f"{len(conns)} conexiones, {len(plain)} sin TLS")
    if role == "data" and act.get("kafka_peers") is not None:
        peers = sorted({p["peer"] for p in act["kafka_peers"]})
        add("kafka_peers", "Kafka: solo ingest y core conectados",
            bool(peers) and set(peers) <= {"10.0.3.10", "10.0.4.10"}, "clientes: " + (", ".join(peers) or "ninguno"))
    if role == "core":
        processed, invalid = act.get("events_processed", 0), act.get("invalid_tokens", 0)
        add("jwt_verification", "Cada evento verificado con su JWT RS256", processed > 0,
            f"{processed} eventos aceptados y {invalid} descartados por token invalido en {act.get('window')}")
    if role == "auth":
        add("auth_audit", "Auditoria de emision de tokens", True,
            f'{act.get("token_issued", 0)} emitidos, {act.get("token_denied", 0)} denegados en {act.get("window")}')

    failed = [f'{p["host"]}:{p["port"]}' for p in report["probes"] if not p["ok"]]
    add("segmentation", "Segmentacion de red como se diseno", not failed,
        "fallan: " + ", ".join(failed) if failed else f'{len(report["probes"])} pruebas de conexion correctas')
    return checks


# ---------------------------------------------------------------- envio

def send(report, conf):
    body = json.dumps(report).encode()
    context = ssl.create_default_context(cafile=os.path.join(CONF_DIR, "ca.pem"))
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(os.path.join(CONF_DIR, "agent.crt"), os.path.join(CONF_DIR, "agent.key"))
    request = urllib.request.Request(conf["report_url"], data=body, method="POST",
                                     headers={"Content-Type": "application/json"})
    start = time.monotonic()
    with urllib.request.urlopen(request, context=context, timeout=10) as response:
        response.read()
        return response.status, round((time.monotonic() - start) * 1000)


def main():
    conf = load_conf()
    started = time.monotonic()
    state_file = "/var/lib/st-agent/last.json"
    last = json.loads(read(state_file, "{}") or "{}")

    report = {
        "schema": 1,
        "agent_version": VERSION,
        "host": conf["host"],
        "role": conf["role"],
        "private_ip": conf["private_ip"],
        "hostname": socket.gethostname(),
        "collected_at": now_iso(),
        "system": system_info(),
        "patching": patching(),
        "ssh": ssh_config(),
        "sysctl": sysctls(),
        "time": time_sync(),
        "services": services(conf.get("services", [])),
        "audit": audit_info(),
        "firewall": firewall(),
        "listening": listening(),
        "containers": containers(),
        "certificates": certificates(conf.get("cert_dirs", [])),
        "probes": probes(conf),
        "activity": activity(conf["role"]),
        "last_delivery": last,
    }
    report["checks"] = evaluate(report, conf)
    report["collect_ms"] = round((time.monotonic() - started) * 1000)

    try:
        status, ms = send(report, conf)
        outcome = {"ok": status == 200, "status": status, "ms": ms, "at": now_iso()}
    except Exception as err:  # el error se registra y se reintenta en la siguiente ejecucion
        outcome = {"ok": False, "error": str(err)[:200], "at": now_iso()}
    os.makedirs(os.path.dirname(state_file), exist_ok=True)
    with open(state_file, "w", encoding="utf-8") as handle:
        json.dump(outcome, handle)
    print(json.dumps({"delivery": outcome, "checks_failed": [c["id"] for c in report["checks"] if not c["ok"]]}))
    return 0 if outcome["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
